"""Institution registration invariants."""
from rmit_society.identity.domain import (
    ALLOWED_CAMPUS_SUFFIXES,
    STUDY_AREAS,
    VALID_STUDY_AREAS,
    derive_username_from_email,
    is_allowed_campus_domain,
    validate_display_name,
    validate_study_area,
)

__all__ = [
    "ALLOWED_CAMPUS_SUFFIXES",
    "STUDY_AREAS",
    "VALID_STUDY_AREAS",
    "derive_username_from_email",
    "is_allowed_campus_domain",
    "validate_display_name",
    "validate_study_area",
]
