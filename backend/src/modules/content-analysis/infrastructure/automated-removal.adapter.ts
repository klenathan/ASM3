import type {
  AutoRemovalResult,
  AutomatedRemovalPort,
  AutoRemovedEvent,
  RemoveThreadIfPublishedInput,
} from "../application/automated-removal.port";
import { buildAutoRemovedEvent } from "../application/automated-removal.port";

export interface DiscussionsAutomatedRemovalAdapterDeps {
  removeThreadIfPublished(input: RemoveThreadIfPublishedInput): Promise<AutoRemovalResult>;
  publishAutoRemoved(event: AutoRemovedEvent): Promise<void>;
}

export class DiscussionsAutomatedRemovalAdapter implements AutomatedRemovalPort {
  private readonly deps: DiscussionsAutomatedRemovalAdapterDeps;

  constructor(deps: DiscussionsAutomatedRemovalAdapterDeps) {
    this.deps = deps;
  }

  async removeThreadIfPublished(input: RemoveThreadIfPublishedInput): Promise<AutoRemovalResult> {
    const result = await this.deps.removeThreadIfPublished(input);
    if (result === "removed") {
      await this.deps.publishAutoRemoved(buildAutoRemovedEvent(input));
    }
    return result;
  }
}
