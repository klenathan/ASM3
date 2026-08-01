#!/usr/bin/env python3
"""Build a Linux-compatible Lambda zip from the backend project."""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / "build"
TARGET = BUILD / "lambda"
ARCHIVE = BUILD / "cloudpulse-lambda.zip"

SUPPORTED = {
    "x86_64-manylinux2014": "x86_64-linux-gnu",
    "aarch64-manylinux2014": "aarch64-linux-gnu",
}


def package_lambda(platform: str = "x86_64-manylinux2014") -> Path:
    """Build the Lambda archive for a target manylinux platform.

    ``platform`` is a PEP 425 ``--python-platform`` tag (e.g.
    ``x86_64-manylinux2014`` or ``aarch64-manylinux2014``). The native
    extension ABI must match the Lambda runtime that will execute the archive:
    x86_64 for a default (x86_64) AWS Lambda, aarch64 for an arm64 Lambda or a
    MiniStack emulator running on arm64 hardware.
    """
    if platform not in SUPPORTED:
        raise ValueError(f"Unsupported platform {platform!r}; expected one of {sorted(SUPPORTED)}")
    expected_tag = SUPPORTED[platform]
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
            platform,
            str(ROOT / "backend"),
        ],
        check=True,
    )
    _validate_linux_extensions(TARGET, expected_tag)
    with ZipFile(ARCHIVE, "w", ZIP_DEFLATED) as archive:
        for path in TARGET.rglob("*"):
            if path.is_file() and "__pycache__" not in path.parts:
                archive.write(path, path.relative_to(TARGET))
    print(f"Built {ARCHIVE} ({ARCHIVE.stat().st_size / 1024 / 1024:.1f} MiB) [{platform}]")
    return ARCHIVE


def _validate_linux_extensions(target: Path, expected_tag: str) -> None:
    """Fail loudly if a compiled native extension targets the wrong ABI.

    A package built on macOS/Windows (no --python-platform) or for the wrong
    architecture silently drops or mis-targets the native module, causing
    Runtime.ImportModuleError at deploy time such as
    "No module named 'pydantic_core._pydantic_core'". We check both: reject
    non-Linux ABIs and reject ABIs that do not match ``expected_tag``.
    """
    natives = [
        p
        for p in target.rglob("*")
        if p.suffix in {".so", ".abi3"} and "__pycache__" not in p.parts
    ]
    if not natives:
        return  # pure-Python dependency set; nothing to validate
    bad_platform = ("darwin", "macos", "win32", "win_amd64", "win_arm64")
    wrong = [p for p in natives if any(tok in p.name.lower() for tok in bad_platform)]
    if wrong:
        raise RuntimeError(
            "Native extension(s) built for a non-Linux platform; Lambda would fail to "
            "import. Ensure --python-platform resolves manylinux wheels. Offending "
            "files:\n" + "\n".join(str(p) for p in wrong)
        )
    mismatched = [p for p in natives if expected_tag not in p.name]
    if mismatched:
        raise RuntimeError(
            f"Native extension(s) do not match target ABI '{expected_tag}'; Lambda "
            f"would fail to import (e.g. 'pydantic_core._pydantic_core'). Offending "
            f"files:\n" + "\n".join(str(p) for p in mismatched)
        )


if __name__ == "__main__":
    platform = sys.argv[1] if len(sys.argv) > 1 else "x86_64-manylinux2014"
    package_lambda(platform)
