"""Backward-compatible alias for the canonical combined app.

Local development used to run ``rmit_society.local:app``. The combined server
now lives in :mod:`rmit_society.server`; this module keeps the old import path
working:
    uv run uvicorn rmit_society.local:app --app-dir src --port 8000
"""

from rmit_society.server import app

__all__ = ["app"]
