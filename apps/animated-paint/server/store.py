from __future__ import annotations

import json
import re
import shutil
import time
from pathlib import Path
from typing import Any

from backend.host.data_root import resolve_data_root

SAFE_ID = re.compile(r"^[A-Za-z0-9_-]+$")
SAFE_ASSET = re.compile(r"^[A-Za-z0-9._-]+$")


class StoreError(Exception):
    def __init__(self, status: int, detail: str) -> None:
        super().__init__(detail)
        self.status = status
        self.detail = detail


def _tool_root() -> Path:
    return resolve_data_root() / "animated-paint"


def _require_id(value: str) -> str:
    if not SAFE_ID.fullmatch(value):
        raise StoreError(400, "invalid id")
    return value


def _require_asset(name: str) -> str:
    if not SAFE_ASSET.fullmatch(name) or ".." in name:
        raise StoreError(400, "invalid asset name")
    return name


def project_dir(project_id: str) -> Path:
    return _tool_root() / "projects" / _require_id(project_id)


def list_projects() -> list[dict[str, Any]]:
    root = _tool_root() / "projects"
    if not root.is_dir():
        return []
    summaries: list[dict[str, Any]] = []
    for folder in root.iterdir():
        path = folder / "project.json"
        if not path.is_file():
            continue
        try:
            record = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        document = record.get("document", {})
        summaries.append(
            {
                "id": record.get("id", folder.name),
                "name": document.get("name", "Untitled"),
                "createdAt": record.get("createdAt", 0),
                "updatedAt": record.get("updatedAt", 0),
                "width": document.get("width", 0),
                "height": document.get("height", 0),
            }
        )
    return sorted(summaries, key=lambda item: item["updatedAt"], reverse=True)


def read_project(project_id: str) -> dict[str, Any]:
    path = project_dir(project_id) / "project.json"
    if not path.is_file():
        raise StoreError(404, "project not found")
    return json.loads(path.read_text(encoding="utf-8"))


def write_project(record: dict[str, Any]) -> dict[str, Any]:
    project_id = record.get("id")
    document = record.get("document")
    if not isinstance(project_id, str):
        raise StoreError(400, "project id required")
    if not isinstance(document, dict) or document.get("version") != 2:
        raise StoreError(400, "paint document version 2 required")
    folder = project_dir(project_id)
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "assets").mkdir(exist_ok=True)
    now = int(time.time() * 1000)
    record["createdAt"] = record.get("createdAt", now)
    record["updatedAt"] = now
    (folder / "project.json").write_text(
        json.dumps(record, ensure_ascii=False),
        encoding="utf-8",
    )
    return record


def delete_project(project_id: str) -> None:
    folder = project_dir(project_id)
    if not folder.is_dir():
        raise StoreError(404, "project not found")
    shutil.rmtree(folder)


def write_asset(project_id: str, name: str, data: bytes) -> None:
    folder = project_dir(project_id)
    if not (folder / "project.json").is_file():
        raise StoreError(404, "project not found")
    assets = folder / "assets"
    assets.mkdir(exist_ok=True)
    (assets / _require_asset(name)).write_bytes(data)


def read_asset(project_id: str, name: str) -> bytes:
    path = project_dir(project_id) / "assets" / _require_asset(name)
    if not path.is_file():
        raise StoreError(404, "asset not found")
    return path.read_bytes()


def list_brushes() -> dict[str, Any]:
    root = _tool_root() / "brushes"
    custom: list[dict[str, Any]] = []
    if root.is_dir():
        for path in root.glob("*.json"):
            if path.name == "hidden.json":
                continue
            try:
                brush = json.loads(path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                continue
            if isinstance(brush, dict):
                custom.append(brush)
    hidden_path = root / "hidden.json"
    try:
        hidden = json.loads(hidden_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        hidden = []
    return {
        "custom": custom,
        "hidden": [value for value in hidden if isinstance(value, str)],
    }


def write_brush(brush: dict[str, Any]) -> dict[str, Any]:
    brush_id = brush.get("id")
    if not isinstance(brush_id, str):
        raise StoreError(400, "brush id required")
    root = _tool_root() / "brushes"
    root.mkdir(parents=True, exist_ok=True)
    (root / f"{_require_id(brush_id)}.json").write_text(
        json.dumps(brush, ensure_ascii=False),
        encoding="utf-8",
    )
    hidden = set(list_brushes()["hidden"])
    if brush_id in hidden:
        hidden.remove(brush_id)
        write_hidden(hidden)
    return brush


def delete_brush(brush_id: str, hide_builtin: bool) -> None:
    root = _tool_root() / "brushes"
    path = root / f"{_require_id(brush_id)}.json"
    path.unlink(missing_ok=True)
    if hide_builtin:
        hidden = set(list_brushes()["hidden"])
        hidden.add(brush_id)
        write_hidden(hidden)


def write_hidden(hidden: set[str]) -> None:
    root = _tool_root() / "brushes"
    root.mkdir(parents=True, exist_ok=True)
    (root / "hidden.json").write_text(
        json.dumps(sorted(hidden)),
        encoding="utf-8",
    )
