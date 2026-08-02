import { DomainError } from "../../../shared/domain/errors.js";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function assertRegistrationEmail(
  email: string,
  allowedDomains: readonly string[],
): string {
  const normalizedEmail = normalizeEmail(email);
  const atIndex = normalizedEmail.lastIndexOf("@");
  const domain = atIndex > 0 ? normalizedEmail.slice(atIndex + 1) : "";
  const normalizedDomains = allowedDomains
    .map((allowedDomain) => allowedDomain.trim().toLowerCase())
    .filter((allowedDomain) => allowedDomain.length > 0);

  if (
    normalizedEmail.length === 0 ||
    atIndex <= 0 ||
    normalizedEmail.indexOf("@") !== atIndex ||
    domain.length === 0 ||
    /\s/.test(normalizedEmail)
  ) {
    throw new DomainError("INVALID_EMAIL", "Enter a valid email address");
  }

  if (normalizedDomains.length === 0) {
    throw new DomainError(
      "REGISTRATION_CLOSED",
      "Registration is unavailable until approved RMIT domains are configured",
    );
  }

  if (!normalizedDomains.includes(domain)) {
    throw new DomainError(
      "EMAIL_DOMAIN_NOT_ALLOWED",
      "Registration requires an approved RMIT email address",
    );
  }

  return normalizedEmail;
}

export function assertPasswordPolicy(password: string): void {
  if (password.length < 8 || password.length > 128) {
    throw new DomainError(
      "INVALID_PASSWORD",
      "Password must contain between 8 and 128 characters",
    );
  }
}

export function normalizeDisplayName(displayName: string): string {
  const normalizedDisplayName = displayName.trim();

  if (normalizedDisplayName.length === 0 || normalizedDisplayName.length > 80) {
    throw new DomainError(
      "INVALID_DISPLAY_NAME",
      "Display name must contain between 1 and 80 characters",
    );
  }

  return normalizedDisplayName;
}

export function normalizeBio(bio: string | null | undefined): string | null {
  if (bio === null || bio === undefined) return null;

  const normalizedBio = bio.trim();
  if (normalizedBio.length > 500) {
    throw new DomainError("INVALID_BIO", "Bio must not exceed 500 characters");
  }

  return normalizedBio.length > 0 ? normalizedBio : null;
}
