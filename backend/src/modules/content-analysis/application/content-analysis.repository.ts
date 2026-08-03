import type { ContentAnalysisRun } from "../domain/content-analysis";

/**
 * Repository port for content-analysis runs. Lives on the
 * application/domain boundary; Drizzle implementation is in infrastructure.
 */
export interface ContentAnalysisRepository {
  create(run: ContentAnalysisRun): Promise<ContentAnalysisRun>;
  findById(id: string): Promise<ContentAnalysisRun | null>;
  findBySourceEvent(sourceEventId: string): Promise<ContentAnalysisRun[]>;
}

// TODO(phase 2): methods for updating status/result, reanalysis increment.
