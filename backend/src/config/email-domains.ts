/**
 * Approved RMIT registration domains.
 *
 * Keep this list empty until AU, VN, and EU domains are confirmed. Authentication
 * must fail closed when this list is empty. Update through reviewed source changes,
 * not environment variables, so eligibility policy remains auditable.
 */
export const ALLOWED_EMAIL_DOMAINS: readonly string[] = [
  "rmit.edu.au",
  "rmit.edu.vn",
  "rmit.edu.eu",
  "rmit.eu",
];
