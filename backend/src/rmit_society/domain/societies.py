"""Compatibility exports; use rmit_society.spaces.models for new code."""
from rmit_society.spaces.models.membership import SocietyMembership
from rmit_society.spaces.models.space import Society, SocietyCreate, SocietyUpdate

__all__ = ["Society", "SocietyCreate", "SocietyUpdate", "SocietyMembership"]
