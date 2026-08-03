/**
 * Context port for rehydrating report-analysis context.
 * Implemented by Moderation/Discussions. Includes capped comments and vote
 * aggregates but never voter identities.
 */
export interface CommentContext {
  id: string;
  body: string;
  score: number;
}

export interface ReportAnalysisContext {
  reportId: string;
  reportReason: string;
  reportDetails?: string;
  threadId: string;
  threadTitle: string;
  threadBody: string;
  globalPolicy: string;
  societyRules: Array<{ id: string; title: string; description: string }>;
  images: Array<{ bucket: string; key: string; contentType: string; byteSize: number }>;
  comments: CommentContext[];
  upvotes: number;
  downvotes: number;
  netScore: number;
  visibleCommentCount: number;
  contextTruncated: boolean;
}

export interface ReportAnalysisContextPort {
  loadReportContext(reportId: string): Promise<ReportAnalysisContext>;
}
