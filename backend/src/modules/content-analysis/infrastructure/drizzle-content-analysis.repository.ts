import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { ContentAnalysisRepository } from "../application/content-analysis.repository";
import type { ContentAnalysisRun } from "../domain/content-analysis";
import { contentAnalysisRuns } from "./content-analysis.tables";

/**
 * Drizzle implementation of ContentAnalysisRepository. Never imported outside
 * the module's infrastructure layer.
 */
export class DrizzleContentAnalysisRepository implements ContentAnalysisRepository {
  readonly db: NodePgDatabase;

  constructor(db: NodePgDatabase) {
    this.db = db;
  }

  async create(run: ContentAnalysisRun): Promise<ContentAnalysisRun> {
    const [row] = await this.db
      .insert(contentAnalysisRuns)
      .values({ ...run, decision: run.decision })
      .returning();
    if (!row) throw new Error("failed to create content analysis run");
    return run;
  }

  async findById(id: string): Promise<ContentAnalysisRun | null> {
    const [row] = await this.db
      .select()
      .from(contentAnalysisRuns)
      .where(eq(contentAnalysisRuns.id, id));
    if (!row) throw new Error("not implemented mapping");
    return null;
  }

  async findBySourceEvent(sourceEventId: string): Promise<ContentAnalysisRun[]> {
    const rows = await this.db
      .select()
      .from(contentAnalysisRuns)
      .where(eq(contentAnalysisRuns.sourceEventId, sourceEventId));
    // TODO(phase 2): map drizzle rows to domain model.
    void rows;
    return [];
  }
}
