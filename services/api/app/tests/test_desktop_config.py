import importlib
import sys
from pathlib import Path

import pytest


DESKTOP_PATH_MODULES = (
    "app.services.ai.prompts",
    "app.services.ai.base",
    "app.services.skills.registry",
    "app.routers.dev",
    "app.core.config",
)


def set_parent_module_attr(module_name: str, module) -> None:
    parent_name, _, attr = module_name.rpartition(".")
    parent = sys.modules.get(parent_name)
    if parent is None:
        return
    if module is None:
        if hasattr(parent, attr):
            delattr(parent, attr)
        return
    setattr(parent, attr, module)


@pytest.fixture(autouse=True)
def restore_desktop_path_modules():
    originals = {name: sys.modules.get(name) for name in DESKTOP_PATH_MODULES}
    yield
    for name, module in originals.items():
        if module is None:
            sys.modules.pop(name, None)
        else:
            sys.modules[name] = module
        set_parent_module_attr(name, module)


def load_config(monkeypatch, desktop_data_dir: Path):
    monkeypatch.setenv("ARTICLE_PROCESSOR_DESKTOP_DATA_DIR", str(desktop_data_dir))
    monkeypatch.setenv("DATABASE_URL", "sqlite:///./data/app.sqlite3")
    monkeypatch.setenv("STORAGE_DIR", "./storage")
    for module_name in DESKTOP_PATH_MODULES:
        sys.modules.pop(module_name, None)
        set_parent_module_attr(module_name, None)
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
    assert config.settings.images_path == desktop_data_dir / "storage" / "images"

    assert (desktop_data_dir / "data").is_dir()
    assert (desktop_data_dir / "storage" / "uploads").is_dir()
    assert (desktop_data_dir / "storage" / "markdown").is_dir()
    assert (desktop_data_dir / "storage" / "exports").is_dir()
    assert (desktop_data_dir / "storage" / "images").is_dir()


def test_desktop_settings_files_use_data_dir_on_first_launch(monkeypatch, tmp_path):
    desktop_data_dir = tmp_path / "ArticleProcessor"

    config = load_config(monkeypatch, desktop_data_dir)

    assert not (desktop_data_dir / ".env").exists()
    assert config.DOTENV_PATH == desktop_data_dir / ".env"


def test_desktop_dev_config_paths_use_data_dir(monkeypatch, tmp_path):
    desktop_data_dir = tmp_path / "ArticleProcessor"

    load_config(monkeypatch, desktop_data_dir)
    dev_router = importlib.import_module("app.routers.dev")
    ai_base = importlib.import_module("app.services.ai.base")
    prompts = importlib.import_module("app.services.ai.prompts")
    skills_registry = importlib.import_module("app.services.skills.registry")

    expected = desktop_data_dir / "data" / "dev_config.json"
    assert dev_router.DEV_CONFIG_PATH == expected
    assert ai_base.DEV_CONFIG_PATH == expected
    assert prompts.DEV_CONFIG_PATH == expected
    assert skills_registry.SKILLS_FILE == desktop_data_dir / "data" / "skills.json"
