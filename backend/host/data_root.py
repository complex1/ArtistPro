from __future__ import annotations

import os
from pathlib import Path


def repo_root() -> Path:
    env = os.environ.get("ARTIST_REPO_ROOT")
    if env:
        return Path(env).expanduser().resolve()
    return Path(__file__).resolve().parents[2]


def resolve_data_root() -> Path:
    env = os.environ.get("ARTIST_DATA_ROOT")
    if env:
        return Path(env).expanduser().resolve()
    return Path.home() / ".artist-studio"


def ensure_data_root() -> Path:
    root = resolve_data_root()
    root.mkdir(parents=True, exist_ok=True)
    return root
