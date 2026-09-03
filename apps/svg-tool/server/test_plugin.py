from fastapi.testclient import TestClient

from backend.host.main import app


def test_svg_project_and_asset_round_trip(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("ARTIST_DATA_ROOT", str(tmp_path))
    client = TestClient(app)
    record = {
        "id": "proj_1",
        "createdAt": 1,
        "updatedAt": 1,
        "document": {
            "name": "Hero",
            "artboard": {"width": 1280, "height": 720},
        },
    }
    created = client.post("/v1/apps/svg-tool/projects", json=record)
    assert created.status_code == 200
    assert created.json()["document"]["name"] == "Hero"

    listed = client.get("/v1/apps/svg-tool/projects")
    assert listed.status_code == 200
    assert listed.json()[0]["id"] == "proj_1"
    assert listed.json()[0]["width"] == 1280

    fetched = client.get("/v1/apps/svg-tool/projects/proj_1")
    assert fetched.status_code == 200
    assert fetched.json()["id"] == "proj_1"

    record["document"]["name"] = "Hero v2"
    updated = client.put("/v1/apps/svg-tool/projects/proj_1", json=record)
    assert updated.status_code == 200
    assert updated.json()["document"]["name"] == "Hero v2"

    asset = client.put(
        "/v1/apps/svg-tool/projects/proj_1/assets/ref.png",
        content=b"png-bytes",
        headers={"Content-Type": "application/octet-stream"},
    )
    assert asset.status_code == 200
    downloaded = client.get("/v1/apps/svg-tool/projects/proj_1/assets/ref.png")
    assert downloaded.status_code == 200
    assert downloaded.content == b"png-bytes"

    traversal = client.put(
        "/v1/apps/svg-tool/projects/proj_1/assets/..png",
        content=b"nope",
        headers={"Content-Type": "application/octet-stream"},
    )
    assert traversal.status_code == 400

    deleted = client.delete("/v1/apps/svg-tool/projects/proj_1")
    assert deleted.status_code == 204
    missing = client.get("/v1/apps/svg-tool/projects/proj_1")
    assert missing.status_code == 404
