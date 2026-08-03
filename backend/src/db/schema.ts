export { authSessions, authUsers } from "../modules/identity/infrastructure/auth.tables";
export { userProfiles } from "../modules/identity/infrastructure/user-profile.tables";
export {
  commentVotes,
  comments,
  threadMedia,
  threadVotes,
  threads,
} from "../modules/discussions/infrastructure/discussion.tables";
export { mediaAssets } from "../modules/media/infrastructure/media.tables";
export { integrationAuditEvents } from "../modules/audit/infrastructure/audit-events.tables";
export {
  moderationActions,
  reports,
} from "../modules/moderation/infrastructure/moderation.tables";
export {
  societies,
  societyMemberships,
  societyRules,
} from "../modules/societies/infrastructure/society.tables";
export { platformConfig } from "../modules/platform/infrastructure/platform.tables";
export { contentAnalysisRuns } from "../modules/content-analysis/infrastructure/content-analysis.tables";
