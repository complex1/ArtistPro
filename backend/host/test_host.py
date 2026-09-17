from fastapi.testclient import TestClient

from backend.host.main import app


def test_cors_allows_file_origin() -> None:
    client = TestClient(app)
    response = client.options(
        "/health",
        headers={
            "Origin": "null",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "null"


def test_health(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("ARTIST_DATA_ROOT", str(tmp_path))
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert tmp_path.is_dir()


def test_lists_tool_manifests() -> None:
    client = TestClient(app)
    response = client.get("/v1/tools")
    assert response.status_code == 200
    tools = response.json()["tools"]
    ids = {tool["id"] for tool in tools}
    assert "svg-tool" in ids
    assert "animated-paint" in ids
    assert "cel" in ids
    assert "live-character" in ids
    assert "drawing-canvas" in ids
    assert "frame-by-frame" in ids
    paint = next(tool for tool in tools if tool["id"] == "animated-paint")
    assert paint["status"] == "ready"
    assert paint["apiPrefix"] == "/v1/apps/animated-paint"
    cel = next(tool for tool in tools if tool["id"] == "cel")
    assert cel["status"] == "ready"
    assert cel["apiPrefix"] == "/v1/apps/cel"

    character = next(tool for tool in tools if tool["id"] == "live-character")
    assert character["status"] == "ready"
    assert character["route"] == "/live-character"
    assert "apiPrefix" not in character

    drawing = next(tool for tool in tools if tool["id"] == "drawing-canvas")
    assert drawing["status"] == "ready"
    assert drawing["route"] == "/drawing-canvas"
    assert "apiPrefix" not in drawing
