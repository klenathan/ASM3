"""Versioned moderation policy configuration."""

from dataclasses import dataclass


@dataclass(frozen=True)
class ModerationPolicy:
    version: str = "1"
    flag_threshold: float = 0.4
    reject_threshold: float = 0.85

    def __post_init__(self) -> None:
        if not 0 <= self.flag_threshold <= self.reject_threshold <= 1:
            raise ValueError("thresholds must satisfy 0 <= flag <= reject <= 1")
