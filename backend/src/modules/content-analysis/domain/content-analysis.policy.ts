import type {
  ContentAnalysisResult,
  Severity,
  FindingSource,
} from "../application/content-analysis.dto";

/**
 * Domain invariants for content analysis.
 *
 * Sentiment is supporting information, never a validity rule. Higher
 * confidence does not automatically imply stricter action.
 */
export function isStrictResult(value: unknown): value is ContentAnalysisResult {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;

  if (r.decision !== "allow" && r.decision !== "review") return false;

  const s = r.sentiment as Record<string, unknown> | undefined;
  if (!s || !["positive", "neutral", "negative", "mixed"].includes(s.label as string)) {
    return false;
  }
  if (typeof s.confidence !== "number" || s.confidence < 0 || s.confidence > 1) return false;

  if (!Array.isArray(r.findings)) return false;
  for (const f of r.findings as Array<Record<string, unknown>>) {
    if (typeof f.category !== "string") return false;
    if (!["low", "medium", "high"].includes(f.severity as Severity)) return false;
    if (typeof f.confidence !== "number" || f.confidence < 0 || f.confidence > 1) return false;
    if (!["title", "body", "image", "comment"].includes(f.source as FindingSource)) return false;
    if (typeof f.evidence !== "string") return false;
  }

  if (typeof r.summary !== "string") return false;
  return true;
}

// TODO(phase 2): decision/finding schema invariants, thread status transitions,
// context limits, deterministic comment selection, prompt-injection handling.
