"""Composition root for API and worker dependencies."""
from __future__ import annotations

from dataclasses import dataclass

from rmit_society.repositories.factory import get_repository
from rmit_society.repositories.interfaces import Repository


@dataclass(frozen=True)
class Container:
    repository: Repository

def build_container() -> Container:
    return Container(repository=get_repository())

def get_container() -> Container:
    return build_container()

__all__ = ["Container", "build_container", "get_container"]
