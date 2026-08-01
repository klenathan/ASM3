from __future__ import annotations

import re

from rmit_society.errors import ValidationError_

# RMIT-owned campus domains that a student email may use. The domain must be
# *equal to* or *beneath* one of these suffixes (boundary-safe). New campuses
# are added here deliberately after review; a wildcard after "rmit." would
# accept attacker-owned domains and is intentionally not permitted.
ALLOWED_CAMPUS_SUFFIXES: tuple[str, ...] = (
    "rmit.edu.au",
    "rmit.edu.vn",
    "rmit.eu",
)

# RMIT student emails are the letter 's' followed by the numeric student number
# (no suffix letters) then '@' under a campus domain, e.g. s1234567.
_STUDENT_PATTERN = re.compile(r"^s([0-9]{5,12})$")
_DOMAIN_LABEL_PATTERN = re.compile(r"^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$")

# Official RMIT study areas, mirrored from the "Study with us" navigation at
# https://www.rmit.edu.au/study-with-us (22 entries as of August 2026).
STUDY_AREAS: tuple[str, ...] = (
    "Architecture",
    "Art",
    "Aviation",
    "Biomedical sciences",
    "Building",
    "Business",
    "Communication",
    "Design",
    "Education",
    "Engineering",
    "Environment",
    "Fashion",
    "Game design",
    "Health",
    "Information technology",
    "Languages",
    "Law",
    "Media",
    "Property",
    "Psychology",
    "Science",
    "Social and community",
)
VALID_STUDY_AREAS: frozenset[str] = frozenset(STUDY_AREAS)

_FORMAT_HINT = (
    "Use your RMIT student email, for example s1234567@student.rmit.edu.au"
)
_DOMAIN_HINT = (
    "Use an approved RMIT campus email, for example s1234567@student.rmit.edu.au"
)


def is_allowed_campus_domain(domain: str) -> bool:
    """True when `domain` equals or sits beneath an allowed campus suffix."""
    return any(
        domain == suffix or domain.endswith("." + suffix)
        for suffix in ALLOWED_CAMPUS_SUFFIXES
    )


def _valid_domain(domain: str) -> bool:
    if not domain or not is_allowed_campus_domain(domain):
        return False
    return all(
        _DOMAIN_LABEL_PATTERN.match(label) for label in domain.split(".")
    )


def derive_username_from_email(email: str) -> str:
    """Normalize and validate an RMIT student email; return the `s<number>` username.

    Raises ValidationError_ with a user-facing message on any failure.
    """
    raw = (email or "").strip().lower()
    if not raw:
        raise ValidationError_("Enter your RMIT student email address")
    if raw.count("@") != 1:
        raise ValidationError_(_FORMAT_HINT)
    local, _, domain = raw.partition("@")
    if not _valid_domain(domain):
        raise ValidationError_(_DOMAIN_HINT)
    match = _STUDENT_PATTERN.match(local)
    if not match:
        raise ValidationError_(_FORMAT_HINT)
    return f"s{match.group(1)}"


def validate_study_area(major: str) -> str:
    value = (major or "").strip()
    if not value:
        raise ValidationError_("Choose your study area")
    if value not in VALID_STUDY_AREAS:
        raise ValidationError_("Choose a valid RMIT study area")
    return value


def validate_display_name(name: str) -> str:
    value = (name or "").strip()
    if not value:
        raise ValidationError_("Enter your name")
    if len(value) > 60:
        raise ValidationError_("Name must be 60 characters or fewer")
    return value
