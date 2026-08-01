export const CAMPUS_SUFFIXES: readonly string[] = [
  "rmit.edu.au",
  "rmit.edu.vn",
  "rmit.eu",
] as const;

const _STUDENT = /^s([0-9]{5,12})$/;
const _LABEL = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

function _allowedDomain(domain: string): boolean {
  return CAMPUS_SUFFIXES.some(
    (suffix) => domain === suffix || domain.endsWith("." + suffix)
  );
}

/**
 * Validate an RMIT student email and return the derived `s<number>` username,
 * or null when the email is not an approved RMIT student address.
 */
export function deriveUsername(email: string): string | null {
  const raw = email.trim().toLowerCase();
  if (!raw) return null;
  if (raw.split("@").length - 1 !== 1) return null;
  const at = raw.indexOf("@");
  const local = raw.slice(0, at);
  const domain = raw.slice(at + 1);
  if (!_allowedDomain(domain)) return null;
  if (!domain.split(".").every((label) => _LABEL.test(label))) return null;
  const match = _STUDENT.exec(local);
  return match ? `s${match[1]}` : null;
}

export function isValidRmitEmail(email: string): boolean {
  return deriveUsername(email) !== null;
}
