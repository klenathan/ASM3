#!/usr/bin/env python3
"""Build a Linux-compatible Lambda zip from the backend project."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / "build"
TARGET = BUILD / "lambda"
ARCHIVE = BUILD / "cloudpulse-lambda.zip"


def package_lambda() -> Path:
    shutil.rmtree(TARGET, ignore_errors=True)
    BUILD.mkdir(exist_ok=True)
    subprocess.run(
        [
            "uv",
            "pip",
            "install",
            "--target",
            str(TARGET),
            "--python-version",
            "3.12",
            "--python-platform",
            "x86_64-manylinux2014",
            str(ROOT / "backend"),
        ],
        check=True,
    )
    with ZipFile(ARCHIVE, "w", ZIP_DEFLATED) as archive:
        for path in TARGET.rglob("*"):
            if path.is_file() and "__pycache__" not in path.parts:
                archive.write(path, path.relative_to(TARGET))
    print(f"Built {ARCHIVE} ({ARCHIVE.stat().st_size / 1024 / 1024:.1f} MiB)")
    return ARCHIVE


if __name__ == "__main__":
    package_lambda()
