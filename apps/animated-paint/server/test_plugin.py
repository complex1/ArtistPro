from fastapi.testclient import TestClient

from backend.host.main import app


def paint_record() -> dict:
    return {
        "id": "paint_1",
        "createdAt": 1,
        "updatedAt": 1,
        "document": {
            "id": "doc_1",
            "version": 2,
            "name": "Living ink",
            "width": 800,
            "height": 600,
            "background": "#ffffff",
            "layers": [],
        },
    }


def test_paint_project_asset_and_brush_round_trip(
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setenv("ARTIST_DATA_ROOT", str(tmp_path))
    client = TestClient(app)

    created = client.post(
        "/v1/apps/animated-paint/projects",
        json=paint_record(),
    )
    assert created.status_code == 200
    assert created.json()["document"]["name"] == "Living ink"

    listed = client.get("/v1/apps/animated-paint/projects")
    assert listed.json()[0] == {
        "id": "paint_1",
        "name": "Living ink",
        "createdAt": 1,
        "updatedAt": created.json()["updatedAt"],
        "width": 800,
        "height": 600,
    }

    updated_record = paint_record()
    updated_record["document"]["name"] = "Living ink v2"
    updated = client.put(
        "/v1/apps/animated-paint/projects/paint_1",
        json=updated_record,
    )
    assert updated.status_code == 200
    assert updated.json()["document"]["name"] == "Living ink v2"

    asset = client.put(
        "/v1/apps/animated-paint/projects/paint_1/assets/preview.png",
        content=b"preview",
    )
    assert asset.status_code == 200
    assert client.get(
        "/v1/apps/animated-paint/projects/paint_1/assets/preview.png"
    ).content == b"preview"

    brush = {
        "id": "custom_1",
        "version": 2,
        "name": "Custom",
        "category": "Custom",
    }
    saved_brush = client.put(
        "/v1/apps/animated-paint/brushes/custom_1",
        json=brush,
    )
    assert saved_brush.status_code == 200
    assert client.get("/v1/apps/animated-paint/brushes").json()["custom"] == [
        brush
    ]
    assert client.delete(
        "/v1/apps/animated-paint/brushes/custom_1"
    ).status_code == 204

    assert client.delete(
        "/v1/apps/animated-paint/projects/paint_1"
    ).status_code == 204
    assert client.get(
        "/v1/apps/animated-paint/projects/paint_1"
    ).status_code == 404


def test_rejects_wrong_document_version(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("ARTIST_DATA_ROOT", str(tmp_path))
    client = TestClient(app)
    record = paint_record()
    record["document"]["version"] = 1
    response = client.post(
        "/v1/apps/animated-paint/projects",
        json=record,
    )
    assert response.status_code == 400
