from pathlib import Path

from backend.host.data_root import resolve_data_root, repo_root


def test_data_root_uses_env(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("ARTIST_DATA_ROOT", str(tmp_path / "studio"))
    assert resolve_data_root() == tmp_path / "studio"


def test_repo_root_uses_env(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("ARTIST_REPO_ROOT", str(tmp_path))
    assert repo_root() == tmp_path
