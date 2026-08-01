"""Stable cursor page value type."""
from __future__ import annotations

from typing import TypeVar

from pydantic import BaseModel

T = TypeVar("T")
class Page[T](BaseModel):
    items: list[T]
    next_cursor: str | None = None

__all__ = ["Page"]
