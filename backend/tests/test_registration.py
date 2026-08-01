from __future__ import annotations

import pytest

from rmit_society.domain.registration import (
    ALLOWED_CAMPUS_SUFFIXES,
    STUDY_AREAS,
    VALID_STUDY_AREAS,
    derive_username_from_email,
    validate_display_name,
    validate_study_area,
)
from rmit_society.errors import ValidationError_


@pytest.mark.parametrize(
    ("email", "expected"),
    [
        ("s1234567@student.rmit.edu.au", "s1234567"),
        ("S1234567@STUDENT.RMIT.EDU.AU", "s1234567"),
        ("s1234567@rmit.edu.au", "s1234567"),
        ("s1234567@student.rmit.edu.vn", "s1234567"),
        ("s3999999@my.rmit.edu.vn", "s3999999"),
        ("s12345@student.rmit.eu", "s12345"),
        ("  s123456789012@rmit.edu.au  ", "s123456789012"),
    ],
)
def test_derives_username_from_valid_rmit_email(email: str, expected: str) -> None:
    assert derive_username_from_email(email) == expected


@pytest.mark.parametrize(
    "email",
    [
        "",
        "   ",
        "alex@student.rmit.edu.au",
        "alex+tag@student.rmit.edu.au",
        "s1234567",
        "s1234567@example.com",
        "s1234567@rmit.example",
        "s1234567@rmit.edu.au.example.com",
        "s1234567@notrmit.edu.au",
        "s1234567@rmit.evil.edu.au",
        "1234567@rmit.edu.au",
        "sabc@rmit.edu.au",
        "s123@rmit.edu.au",
        "s1234567@rmit.edu.au.",
        "s1234567@rm-it.edu.au",
        "s1234567@rmit..edu.au",
        "s1234567@rmit.edu.au@x.com",
        "第一@student.rmit.edu.au",
    ],
)
def test_rejects_invalid_rmit_email(email: str) -> None:
    with pytest.raises(ValidationError_):
        derive_username_from_email(email)


def test_campus_suffixes_are_stable() -> None:
    assert "rmit.edu.au" in ALLOWED_CAMPUS_SUFFIXES
    assert "rmit.edu.vn" in ALLOWED_CAMPUS_SUFFIXES
    assert "rmit.eu" in ALLOWED_CAMPUS_SUFFIXES
    # Every suffix belongs to RMIT-controlled domains.
    assert all(s in ("rmit.edu.au", "rmit.edu.vn", "rmit.eu") for s in ALLOWED_CAMPUS_SUFFIXES)


def test_study_areas_are_complete_and_unique() -> None:
    assert len(STUDY_AREAS) == 22
    assert len(set(STUDY_AREAS)) == len(STUDY_AREAS)
    assert "Information technology" in VALID_STUDY_AREAS
    assert "Engineering" in VALID_STUDY_AREAS
    assert "Social and community" in VALID_STUDY_AREAS


def test_validate_study_area_accepts_every_official_area() -> None:
    for area in STUDY_AREAS:
        assert validate_study_area(area) == area


@pytest.mark.parametrize("major", ["", "   ", "Not a real major", "Computer Science"])
def test_validate_study_area_rejects_invalid(major: str) -> None:
    with pytest.raises(ValidationError_):
        validate_study_area(major)


def test_validate_display_name_trims_and_limits() -> None:
    assert validate_display_name("  Alex Tran  ") == "Alex Tran"
    with pytest.raises(ValidationError_):
        validate_display_name("")
    with pytest.raises(ValidationError_):
        validate_display_name("   ")
    with pytest.raises(ValidationError_):
        validate_display_name("x" * 61)
