import importlib
import sys
from pathlib import Path


def load_config(monkeypatch, desktop_data_dir: Path):
    monkeypatch.setenv("ARTICLE_PROCESSOR_DESKTOP_DATA_DIR", str(desktop_data_dir))
    monkeypatch.setenv("DATABASE_URL", "sqlite:///./data/app.sqlite3")
    monkeypatch.setenv("STORAGE_DIR", "./storage")
    sys.modules.pop("app.core.config", None)
    return importlib.import_module("app.core.config")


def test_desktop_data_dir_relocates_mutable_paths(monkeypatch, tmp_path):
    desktop_data_dir = tmp_path / "ArticleProcessor"

    config = load_config(monkeypatch, desktop_data_dir)

    repo_root = Path(__file__).resolve().parents[4]
    assert config.settings.project_root == repo_root
    assert config.settings.data_path == desktop_data_dir
    assert config.settings.database_url == (
        f"sqlite:///{desktop_data_dir / 'data' / 'app.sqlite3'}"
    )
    assert config.settings.storage_path == desktop_data_dir / "storage"
    assert config.settings.uploads_path == desktop_data_dir / "storage" / "uploads"
    assert config.settings.markdown_path == desktop_data_dir / "storage" / "markdown"
    assert config.settings.exports_path == desktop_data_dir / "storage" / "exports"

    assert (desktop_data_dir / "data").is_dir()
    assert (desktop_data_dir / "storage" / "uploads").is_dir()
    assert (desktop_data_dir / "storage" / "markdown").is_dir()
    assert (desktop_data_dir / "storage" / "exports").is_dir()
    assert (desktop_data_dir / "storage" / "images").is_dir()
