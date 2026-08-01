"""Shared identifiers and tenant primitives."""
from typing import NewType

UserId = NewType("UserId", str)
InstitutionId = NewType("InstitutionId", str)
SpaceId = NewType("SpaceId", str)
ContentId = NewType("ContentId", str)

__all__ = ["UserId", "InstitutionId", "SpaceId", "ContentId"]
