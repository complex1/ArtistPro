from __future__ import annotations

import json
import re
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


def _projects_root() -> Path:
    return resolve_data_root() / "svg-tool" / "projects"


def _require_id(project_id: str) -> str:
    if not SAFE_ID.match(project_id):
        raise StoreError(400, "invalid project id")
    return project_id


def _require_asset(name: str) -> str:
    if not SAFE_ASSET.match(name) or ".." in name:
        raise StoreError(400, "invalid asset name")
    return name


def project_dir(project_id: str) -> Path:
    return _projects_root() / _require_id(project_id)


def list_projects() -> list[dict[str, Any]]:
    root = _projects_root()
    if not root.is_dir():
        return []
    summaries: list[dict[str, Any]] = []
    for folder in root.iterdir():
        record_path = folder / "project.json"
        if not record_path.is_file():
            continue
        try:
            record = json.loads(record_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        document = record.get("document") if isinstance(record, dict) else None
        artboard = document.get("artboard") if isinstance(document, dict) else {}
        summaries.append(
            {
                "id": record.get("id", folder.name),
                "name": document.get("name", "Untitled") if isinstance(document, dict) else "Untitled",
                "createdAt": record.get("createdAt", 0),
                "updatedAt": record.get("updatedAt", 0),
                "width": artboard.get("width", 0) if isinstance(artboard, dict) else 0,
                "height": artboard.get("height", 0) if isinstance(artboard, dict) else 0,
            }
        )
    summaries.sort(key=lambda item: item.get("updatedAt") or 0, reverse=True)
    return summaries


def read_project(project_id: str) -> dict[str, Any]:
    path = project_dir(project_id) / "project.json"
    if not path.is_file():
        raise StoreError(404, "project not found")
    return json.loads(path.read_text(encoding="utf-8"))


def write_project(record: dict[str, Any]) -> dict[str, Any]:
    project_id = record.get("id")
    if not isinstance(project_id, str):
        raise StoreError(400, "project id required")
    folder = project_dir(project_id)
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "assets").mkdir(exist_ok=True)
    now = int(time.time() * 1000)
    if not isinstance(record.get("createdAt"), (int, float)):
        record["createdAt"] = now
    record["updatedAt"] = now
    (folder / "project.json").write_text(
        json.dumps(record, ensure_ascii=False),
        encoding="utf-8",
    )
    return record


def delete_project(project_id: str) -> None:
    folder = project_dir(project_id)
    if not folder.exists():
        raise StoreError(404, "project not found")
    for child in sorted(folder.rglob("*"), reverse=True):
        if child.is_file():
            child.unlink()
        elif child.is_dir():
            child.rmdir()
    folder.rmdir()


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
