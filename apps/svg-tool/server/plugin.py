from __future__ import annotations

import importlib.util
from pathlib import Path
from typing import Any

from fastapi import APIRouter, FastAPI, HTTPException, Request
from fastapi.responses import Response

_store_spec = importlib.util.spec_from_file_location(
    "svg_tool_store",
    Path(__file__).with_name("store.py"),
)
if _store_spec is None or _store_spec.loader is None:
    raise RuntimeError("svg-tool store module is missing")
store_mod = importlib.util.module_from_spec(_store_spec)
_store_spec.loader.exec_module(store_mod)
StoreError = store_mod.StoreError

router = APIRouter()


def _raise(error: Exception) -> None:
    if isinstance(error, StoreError):
        raise HTTPException(status_code=error.status, detail=error.detail)
    raise error


@router.get("/projects")
def list_projects() -> list[dict[str, Any]]:
    return store_mod.list_projects()


@router.post("/projects")
def create_project(record: dict[str, Any]) -> dict[str, Any]:
    try:
        return store_mod.write_project(record)
    except StoreError as error:
        _raise(error)
        raise


@router.get("/projects/{project_id}")
def get_project(project_id: str) -> dict[str, Any]:
    try:
        return store_mod.read_project(project_id)
    except StoreError as error:
        _raise(error)
        raise


@router.put("/projects/{project_id}")
def update_project(project_id: str, record: dict[str, Any]) -> dict[str, Any]:
    record["id"] = project_id
    try:
        return store_mod.write_project(record)
    except StoreError as error:
        _raise(error)
        raise


@router.delete("/projects/{project_id}")
def remove_project(project_id: str) -> Response:
    try:
        store_mod.delete_project(project_id)
    except StoreError as error:
        _raise(error)
        raise
    return Response(status_code=204)


@router.put("/projects/{project_id}/assets/{name}")
async def put_asset(project_id: str, name: str, request: Request) -> dict[str, str]:
    data = await request.body()
    try:
        store_mod.write_asset(project_id, name, data)
    except StoreError as error:
        _raise(error)
        raise
    return {"name": name}


@router.get("/projects/{project_id}/assets/{name}")
def get_asset(project_id: str, name: str) -> Response:
    try:
        data = store_mod.read_asset(project_id, name)
    except StoreError as error:
        _raise(error)
        raise
    return Response(content=data, media_type="application/octet-stream")


def register(app: FastAPI) -> None:
    app.include_router(router, prefix="/v1/apps/svg-tool")
