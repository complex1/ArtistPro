from fastapi.testclient import TestClient

from backend.host.main import app


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
    paint = next(tool for tool in tools if tool["id"] == "animated-paint")
    assert paint["status"] == "ready"
    assert paint["apiPrefix"] == "/v1/apps/animated-paint"
    cel = next(tool for tool in tools if tool["id"] == "cel")
    assert cel["status"] == "ready"
    assert cel["apiPrefix"] == "/v1/apps/cel"
