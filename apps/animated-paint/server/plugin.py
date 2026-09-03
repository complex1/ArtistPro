from __future__ import annotations

import importlib.util
from pathlib import Path
from typing import Any

from fastapi import APIRouter, FastAPI, HTTPException, Query, Request
from fastapi.responses import Response

_store_spec = importlib.util.spec_from_file_location(
    "animated_paint_store",
    Path(__file__).with_name("store.py"),
)
if _store_spec is None or _store_spec.loader is None:
    raise RuntimeError("animated-paint store module is missing")
store = importlib.util.module_from_spec(_store_spec)
_store_spec.loader.exec_module(store)
StoreError = store.StoreError

router = APIRouter()


def _http_error(error: Exception) -> None:
    if isinstance(error, StoreError):
        raise HTTPException(status_code=error.status, detail=error.detail)
    raise error


@router.get("/projects")
def list_projects() -> list[dict[str, Any]]:
    return store.list_projects()


@router.post("/projects")
def create_project(record: dict[str, Any]) -> dict[str, Any]:
    try:
        return store.write_project(record)
    except StoreError as error:
        _http_error(error)
        raise


@router.get("/projects/{project_id}")
def get_project(project_id: str) -> dict[str, Any]:
    try:
        return store.read_project(project_id)
    except StoreError as error:
        _http_error(error)
        raise


@router.put("/projects/{project_id}")
def update_project(
    project_id: str,
    record: dict[str, Any],
) -> dict[str, Any]:
    record["id"] = project_id
    try:
        return store.write_project(record)
    except StoreError as error:
        _http_error(error)
        raise


@router.delete("/projects/{project_id}")
def remove_project(project_id: str) -> Response:
    try:
        store.delete_project(project_id)
    except StoreError as error:
        _http_error(error)
        raise
    return Response(status_code=204)


@router.put("/projects/{project_id}/assets/{name}")
async def put_asset(
    project_id: str,
    name: str,
    request: Request,
) -> dict[str, str]:
    try:
        store.write_asset(project_id, name, await request.body())
    except StoreError as error:
        _http_error(error)
        raise
    return {"name": name}


@router.get("/projects/{project_id}/assets/{name}")
def get_asset(project_id: str, name: str) -> Response:
    try:
        data = store.read_asset(project_id, name)
    except StoreError as error:
        _http_error(error)
        raise
    return Response(data, media_type="application/octet-stream")


@router.get("/brushes")
def list_brushes() -> dict[str, Any]:
    return store.list_brushes()


@router.put("/brushes/{brush_id}")
def put_brush(brush_id: str, brush: dict[str, Any]) -> dict[str, Any]:
    brush["id"] = brush_id
    try:
        return store.write_brush(brush)
    except StoreError as error:
        _http_error(error)
        raise


@router.delete("/brushes/{brush_id}")
def remove_brush(
    brush_id: str,
    hide_builtin: bool = Query(default=False, alias="hideBuiltin"),
) -> Response:
    try:
        store.delete_brush(brush_id, hide_builtin)
    except StoreError as error:
        _http_error(error)
        raise
    return Response(status_code=204)


def register(app: FastAPI) -> None:
    app.include_router(router, prefix="/v1/apps/animated-paint")
