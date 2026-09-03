import type { ActionEventInput, PersistedActionEvent } from "../domain/action-event";

/** Append-only persistence seam used by product transaction contexts. */
export interface ActionEventWriter {
  append(event: ActionEventInput): Promise<PersistedActionEvent>;
}

/** Retention is intentionally the only destructive operation exposed. */
export interface ActionEventRetention {
  deleteIngestedBefore(cutoff: Date): Promise<number>;
}
