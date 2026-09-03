import { lt } from "drizzle-orm";

import type { Database } from "../../../db/client";
import {
  validateActionEvent,
  type ActionEventInput,
  type PersistedActionEvent,
} from "../domain/action-event";
import type { ActionEventPseudonymizer } from "../domain/pseudonymizer";
import { actionEvents } from "./action-event.tables";
import type { ActionEventRetention, ActionEventWriter } from "../application/action-event.ports";

type ActionEventExecutor = Pick<Database, "insert" | "delete">;

export class DrizzleActionEventWriter implements ActionEventWriter, ActionEventRetention {
  private readonly database: ActionEventExecutor;
  private readonly pseudonymizer: ActionEventPseudonymizer;

  constructor(database: ActionEventExecutor, pseudonymizer: ActionEventPseudonymizer) {
    this.database = database;
    this.pseudonymizer = pseudonymizer;
  }
  async append(event: ActionEventInput): Promise<PersistedActionEvent> {
    validateActionEvent(event);
    const identity = this.pseudonymizer.pseudonymize(event.actorUserId);
    const persisted: PersistedActionEvent = {
      ...event,
      actorPseudonym: identity.pseudonym,
      pseudonymKeyVersion: identity.keyVersion,
      ingestedAt: new Date(),
    };

    await this.database.insert(actionEvents).values({
      eventId: persisted.eventId,
      eventType: persisted.eventType,
      schemaVersion: persisted.schemaVersion,
      actorUserId: persisted.actorUserId,
      actorPseudonym: persisted.actorPseudonym,
      pseudonymKeyVersion: persisted.pseudonymKeyVersion,
      actorPlatformRole: persisted.actorPlatformRole,
      actorSocietyRole: persisted.actorSocietyRole,
      occurredAt: persisted.occurredAt,
      ingestedAt: persisted.ingestedAt,
      targetType: persisted.targetType,
      targetId: persisted.targetId,
      societyId: persisted.societyId,
      threadId: persisted.threadId,
      commentId: persisted.commentId,
      reportId: persisted.reportId,
      correlationId: persisted.correlationId,
      fromReaction: persisted.fromReaction,
      toReaction: persisted.toReaction,
      metadata: persisted.metadata,
    });

    return persisted;
  }

  async deleteIngestedBefore(cutoff: Date): Promise<number> {
    const deleted = await this.database
      .delete(actionEvents)
      .where(lt(actionEvents.ingestedAt, cutoff))
      .returning({ eventId: actionEvents.eventId });
    return deleted.length;
  }
}
