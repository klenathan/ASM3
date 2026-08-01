from __future__ import annotations

from contextlib import AbstractContextManager
from typing import Protocol


class UnitOfWork(Protocol):
    def __enter__(self) -> UnitOfWork: ...
    def __exit__(self, *args: object) -> None: ...

class NoopUnitOfWork(AbstractContextManager[None]):
    """Boundary placeholder; concrete adapters can replace it at composition."""
    def __exit__(self, *args: object) -> None:
        return None

__all__ = ["UnitOfWork", "NoopUnitOfWork"]
