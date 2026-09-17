from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.host.data_root import ensure_data_root
from backend.host.plugins import load_manifests, register_plugins

# CORS for the Vite renderer in Electron. Source:
# https://fastapi.tiangolo.com/tutorial/cors/
app = FastAPI(title="Artist Studio", version="0.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        # file:// renderer Origin is the literal string "null"
        "null",
    ],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_plugins(app)


@app.get("/health")
def health() -> dict[str, str]:
    ensure_data_root()
    return {"status": "ok"}


@app.get("/v1/tools")
def tools() -> dict[str, object]:
    return {"tools": load_manifests()}
