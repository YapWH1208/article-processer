import importlib
import sys
import tomllib
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[4]
API_ROOT = REPO_ROOT / "services" / "api"


def test_desktop_launcher_exports_fastapi_app(monkeypatch, tmp_path):
    monkeypatch.setenv("ARTICLE_PROCESSOR_DESKTOP_DATA_DIR", str(tmp_path / "data-root"))
    sys.modules.pop("app.desktop_launcher", None)

    launcher = importlib.import_module("app.desktop_launcher")

    app = launcher.create_app()
    assert app.title == "Article Processor API"
    assert callable(launcher.main)


def test_pyinstaller_spec_is_stable_for_ci():
    spec_path = API_ROOT / "app" / "desktop_app.spec"

    contents = spec_path.read_text(encoding="utf-8")

    assert "__file__" not in contents
    assert "article-processor-api" in contents
    assert "app.desktop_launcher" in contents
    assert "app/db/migrations" in contents.replace("\\", "/")


def test_desktop_optional_dependencies_include_pyinstaller():
    pyproject = tomllib.loads((API_ROOT / "pyproject.toml").read_text(encoding="utf-8"))

    desktop_deps = pyproject["project"]["optional-dependencies"]["desktop"]

    assert any(dep.lower().startswith("pyinstaller") for dep in desktop_deps)
