from __future__ import annotations

import importlib.util
import json
from pathlib import Path
from typing import Any

from fastapi import FastAPI

from backend.host.data_root import repo_root


def iter_tool_dirs(root: Path | None = None) -> list[Path]:
    apps = (root or repo_root()) / "apps"
    if not apps.is_dir():
        return []
    return sorted(
        path
        for path in apps.iterdir()
        if path.is_dir() and (path / "tool.json").is_file()
    )


def load_manifests(root: Path | None = None) -> list[dict[str, Any]]:
    manifests: list[dict[str, Any]] = []
    for folder in iter_tool_dirs(root):
        data = json.loads((folder / "tool.json").read_text(encoding="utf-8"))
        if isinstance(data, dict):
            manifests.append(data)
    return manifests


def register_plugins(app: FastAPI, root: Path | None = None) -> None:
    base = root or repo_root()
    for folder in iter_tool_dirs(base):
        plugin_file = folder / "server" / "plugin.py"
        if not plugin_file.is_file():
            continue
        module_name = f"artist_tool_{folder.name.replace('-', '_')}"
        spec = importlib.util.spec_from_file_location(module_name, plugin_file)
        if spec is None or spec.loader is None:
            continue
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        register = getattr(module, "register", None)
        if callable(register):
            register(app)
