import type {
  AnalysisDecision,
  ContentAnalysisResult,
  FindingSource,
  Severity,
} from "../application/content-analysis.dto";

/**
 * Domain invariants for content analysis.
 *
 * Sentiment is supporting information, never a validity rule. Higher
 * confidence does not automatically imply stricter action. Popularity and
 * sentiment never prove validity.
 */

// ---------------------------------------------------------------------------
// Decision/finding schema invariants
// ---------------------------------------------------------------------------

/**
 * Strict structural validation of a content-analysis result. The backend
 * treats this as authoritative before persisting any result or state
 * transition. The Lambda function bundle keeps an identical copy
 * (backend/src/functions/content-analysis/openrouter-content-analyzer.ts);
 * keep the two in sync so both sides agree on the contract.
 *
 * Invariants enforced here:
 *  - decision is a known value;
 *  - sentiment label is known and confidence is bounded [0, 1];
 *  - every finding carries a category, bounded severity/confidence, a known
 *    source, and non-empty evidence;
 *  - a non-empty summary is always present;
 *  - a non-empty rationale is always present (for human moderation review);
 */

/**
 * Return a human-readable reason describing the first schema invariant that
 * fails, or null when the value is a valid {@link ContentAnalysisResult}. Used
 * to surface the failing field in logs/errors instead of a generic message.
 */
export function strictResultIssue(value: unknown): string | null {
  if (typeof value !== "object" || value === null) {
    return "result is not an object";
  }
  const r = value as Record<string, unknown>;

  if (r.decision !== "allow" && r.decision !== "review") {
    return `invalid decision ${JSON.stringify(r.decision)} (expected "allow"|"review")`;
  }
  if (typeof r.summary !== "string" || r.summary.length === 0) {
    return "summary is missing or empty";
  }
  if (typeof r.rationale !== "string" || r.rationale.length === 0) {
    return "rationale is missing or empty";
  }

  const s = r.sentiment as Record<string, unknown> | undefined;
  if (!s) {
    return "sentiment is missing";
  }
  if (!["positive", "neutral", "negative", "mixed"].includes(s.label as string)) {
    return `invalid sentiment label ${JSON.stringify(s.label)}`;
  }
  if (typeof s.confidence !== "number" || s.confidence < 0 || s.confidence > 1) {
    return `sentiment confidence out of range [0,1] (${JSON.stringify(s.confidence)})`;
  }

  if (!Array.isArray(r.findings)) {
    return "findings is not an array";
  }
  const findings = r.findings as Array<Record<string, unknown>>;
  for (let i = 0; i < findings.length; i += 1) {
    const f = findings[i];
    if (typeof f !== "object" || f === null) {
      return `findings[${i}] is not an object`;
    }
    if (typeof f.category !== "string" || f.category.length === 0) {
      return `findings[${i}].category is missing or empty`;
    }
    if (!["low", "medium", "high"].includes(f.severity as Severity)) {
      return `findings[${i}] has invalid severity ${JSON.stringify(f.severity)}`;
    }
    if (typeof f.confidence !== "number" || f.confidence < 0 || f.confidence > 1) {
      return `findings[${i}].confidence out of range [0,1] (${JSON.stringify(f.confidence)})`;
    }
    if (!["title", "body", "image", "comment"].includes(f.source as FindingSource)) {
      return `findings[${i}] has invalid source ${JSON.stringify(f.source)}`;
    }
    if (typeof f.evidence !== "string" || f.evidence.length === 0) {
      return `findings[${i}].evidence is missing or empty`;
    }
  }

  return null;
}

/** Strict type-guard wrapper over {@link strictResultIssue}. */
export function isStrictResult(value: unknown): value is ContentAnalysisResult {
  return strictResultIssue(value) === null;
}

// ---------------------------------------------------------------------------
// Thread-status transition mapping
// ---------------------------------------------------------------------------

/**
 * Publication outcome that flows from an analysis decision. This is the
 * domain-level contract the Phase-3 enforcer will apply to the thread status
 * schema; it is expressed here independently of any concrete table.
 *
 *  - allow   -> published       (visible to the community)
 *  - review  -> pending_review  (route to moderation workflow)
 *  - failure -> pending_review  (never silently publish)
 */
export type ThreadAnalysisOutcome = "published" | "pending_review";

export function outcomeForDecision(decision: AnalysisDecision): ThreadAnalysisOutcome {
  return decision === "allow" ? "published" : "pending_review";
}

/** An exhausted or failed analysis must never silently publish content. */
export function outcomeForFailure(): ThreadAnalysisOutcome {
  return "pending_review";
}

// ---------------------------------------------------------------------------
// Context limits and deterministic comment selection
// ---------------------------------------------------------------------------

export interface AnalysisCommentInput {
  readonly id: string;
  readonly body: string;
  readonly score: number;
}

/** Default cap on the total comment context sent for analysis. */
export const DEFAULT_MAX_ANALYSIS_COMMENTS = 40;
/** Default cap on the most recent comments included in context. */
export const DEFAULT_MAX_LATEST_COMMENTS = 20;
/** Default cap on the highest-scored comments included in context. */
export const DEFAULT_MAX_TOP_COMMENTS = 20;

export interface SelectedCommentContext {
  readonly comments: readonly AnalysisCommentInput[];
  readonly truncated: boolean;
}

/**
 * Deterministically merge "latest" and "highest-scored" comment candidates
 * into a single bounded context.
 *
 * The caller supplies already-bounded, independently ordered candidates
 * (latest by recency tie-broken by id, top by score). Highest-scored comments
 * are prioritized (moderators most need evidence from the most visible
 * content), then deduplicated by id against the latest set. Ties in score are
 * broken by ascending id so the output order is reproducible regardless of
 * fetch order.
 *
 * `truncated` is true when visible comments were dropped because of the cap.
 */
export function selectAnalysisComments(options: {
  latest: readonly AnalysisCommentInput[];
  top: readonly AnalysisCommentInput[];
  maxComments?: number;
}): SelectedCommentContext {
  const maxComments = options.maxComments ?? DEFAULT_MAX_ANALYSIS_COMMENTS;

  const topSorted = [...options.top].sort(
    (a, b) => b.score - a.score || a.id.localeCompare(b.id),
  );
  const ordered = [...topSorted, ...options.latest];

  const seen = new Set<string>();
  const comments: AnalysisCommentInput[] = [];
  for (const comment of ordered) {
    if (seen.has(comment.id)) continue;
    seen.add(comment.id);
    comments.push(comment);
    if (comments.length >= maxComments) break;
  }

  const totalVisible = new Set<string>(
    [...options.top, ...options.latest].map((comment) => comment.id),
  ).size;

  return {
    comments,
    truncated: comments.length < totalVisible,
  };
}

// ---------------------------------------------------------------------------
// Prompt-injection handling
// ---------------------------------------------------------------------------

/**
 * Plain-text marker used to visibly delimit untrusted user content before it
 * is sent to the model. Kept minimal and deterministic so it composes with a
 * fixed system prompt that instructs the model to ignore instructions inside
 * the fenced region.
 */
export const UNTRUSTED_CONTENT_FENCE = "--- UNTRUSTED USER CONTENT ---";

/** Bound on how much of a single untrusted field is forwarded to the model. */
export const DEFAULT_MAX_UNTRUSTED_LENGTH = 20_000;

/**
 * Wrap a single untrusted field in the delimiters used by the prompt. Text
 * inside the fence must always be treated as data, never as instructions.
 */
export function delimitUntrusted(text: string): string {
  return `${UNTRUSTED_CONTENT_FENCE}\n${text}\n${UNTRUSTED_CONTENT_FENCE}`;
}

/**
 * Clip untrusted text to a bounded length before it reaches the model. Trims
 * whitespace and appends an ellipsis when content was truncated so the model
 * (and later readers) can tell the excerpt is partial.
 */
export function truncateUntrusted(
  text: string,
  maxLength: number = DEFAULT_MAX_UNTRUSTED_LENGTH,
): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength)}…`;
}
