"""Tests for the MinerU remote API parsing strategies (cloud + self-hosted)."""

import io
import json
import zipfile

import httpx
import pytest

from app.core import config
from app.routers import settings_page
from app.services.parsers import mineru_adapter
from app.services.parsers.mineru_adapter import MinerUAdapter


# ── Helpers ──────────────────────────────────────────────────────────────


class FakeResponse:
    def __init__(self, status_code=200, text="", content=b"", headers=None):
        self.status_code = status_code
        self.text = text
        self.content = content
        self.headers = headers or {}

    def json(self):
        return json.loads(self.text)


def _fake_client_cls(handler):
    """Build a fake httpx.Client class whose calls are served by *handler*."""

    class FakeClient:
        def __init__(self, *args, **kwargs):
            self.calls = []

        def post(self, url, **kwargs):
            self.calls.append(("post", url, kwargs))
            return handler("post", url, kwargs)

        def put(self, url, **kwargs):
            self.calls.append(("put", url, kwargs))
            return handler("put", url, kwargs)

        def get(self, url, **kwargs):
            self.calls.append(("get", url, kwargs))
            return handler("get", url, kwargs)

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    return FakeClient


def _make_result_zip(md_content="", images=None):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("content.md", md_content)
        for name, data in (images or {}).items():
            zf.writestr(f"images/{name}", data)
    return buf.getvalue()


def _fake_pdf(tmp_path, name="paper.pdf"):
    pdf = tmp_path / name
    pdf.write_bytes(b"%PDF-1.4 fake pdf bytes")
    return pdf


@pytest.fixture
def api_settings(monkeypatch, tmp_path):
    """Apply MinerU API settings + isolate image storage under tmp_path."""

    def apply(*, enabled=True, mode="cloud", key="test-key",
              base="https://mineru.net", timeout=60):
        monkeypatch.setattr(config.settings, "mineru_api_enabled", enabled)
        monkeypatch.setattr(config.settings, "mineru_api_mode", mode)
        monkeypatch.setattr(config.settings, "mineru_api_key", key)
        monkeypatch.setattr(config.settings, "mineru_api_base_url", base)
        monkeypatch.setattr(config.settings, "mineru_api_model", "pipeline")
        monkeypatch.setattr(config.settings, "mineru_api_enable_formula", True)
        monkeypatch.setattr(config.settings, "mineru_api_is_ocr", False)
        monkeypatch.setattr(config.settings, "mineru_api_language", "en")
        monkeypatch.setattr(config.settings, "mineru_api_timeout_seconds", timeout)
        monkeypatch.setattr(config.settings, "mineru_api_poll_interval", 0)
        monkeypatch.setattr(config.settings, "api_base_url", "http://localhost:8000")
        # Redirect storage under tmp_path: images_path/data_path are read-only
        # properties, so re-point storage_dir + the module-level _DATA_ROOT.
        monkeypatch.setattr(config.settings, "storage_dir", "./storage")
        monkeypatch.setattr(config, "_DATA_ROOT", tmp_path)
        monkeypatch.setattr(mineru_adapter, "HAS_MINERU_CLI", False)
        monkeypatch.setattr(mineru_adapter, "HAS_MINERU_DO_PARSE", False)
        monkeypatch.setattr(mineru_adapter, "HAS_LEGACY_MAGIC_PDF", False)

    return apply


# ── Cloud mode (mineru.net v4) ───────────────────────────────────────────


async def test_cloud_parse_success(monkeypatch, api_settings, tmp_path):
    api_settings()
    zipped = _make_result_zip(
        md_content="# Test Doc\n\nBody text\n\n![](images/foo.png)\n\n<!-- page 1 -->",
        images={"foo.png": b"PNGDATA"},
    )
    client_cls = _fake_client_cls(
        lambda method, url, kwargs: FakeResponse(
            text=json.dumps({
                "code": 0,
                "data": {
                    "batch_id": "b1",
                    "file_urls": ["https://upload.example/signed"],
                },
            })
        ) if method == "post" else FakeResponse()
        if method == "put" else FakeResponse(
            text=json.dumps({
                "code": 0,
                "data": {
                    "extract_result": {
                        "state": "done",
                        "full_zip_url": "https://cdn.example/result.zip",
                    },
                },
            })
        ) if url.endswith("extract-results/batch/b1") else FakeResponse(
            content=zipped
        ) if url == "https://cdn.example/result.zip" else FakeResponse()
    )
    monkeypatch.setattr(httpx, "Client", client_cls)

    result = await MinerUAdapter().parse(_fake_pdf(tmp_path))

    assert result.title == "Test Doc"
    assert result.page_count == 1
    assert "![](http://localhost:8000/images/foo.png)" in result.markdown
    assert result.metadata["parser"] == "mineru"
    assert result.metadata["engine"] == "api"
    assert result.metadata["image_count"] == 1
    assert (tmp_path / "storage" / "images").exists()


async def test_cloud_submit_payload_and_auth(monkeypatch, api_settings, tmp_path):
    api_settings()
    captured = {}

    def handler(method, url, kwargs):
        if method == "post":
            captured["headers"] = kwargs["headers"]
            captured["json"] = kwargs["json"]
            return FakeResponse(
                text=json.dumps({
                    "code": 0,
                    "data": {
                        "batch_id": "b1",
                        "file_urls": ["https://upload.example/signed"],
                    },
                })
            )
        if method == "put":
            return FakeResponse()
        if method == "get" and "extract-results" in url:
            return FakeResponse(
                text=json.dumps({
                    "code": 0,
                    "data": {
                        "extract_result": {
                            "state": "done",
                            "full_zip_url": "https://cdn.example/result.zip",
                        },
                    },
                })
            )
        if method == "get" and url == "https://cdn.example/result.zip":
            return FakeResponse(
                content=_make_result_zip(md_content="# T\n\ntext")
            )
        raise AssertionError(f"unexpected call: {method} {url}")

    monkeypatch.setattr(httpx, "Client", _fake_client_cls(handler))
    pdf = _fake_pdf(tmp_path, name="my-doc.pdf")

    await MinerUAdapter().parse(pdf)

    assert captured["headers"]["Authorization"] == "Bearer test-key"
    body = captured["json"]
    assert body["files"] == [{"name": "my-doc.pdf", "data_id": "my-doc"}]
    assert body["model_version"] == "pipeline"
    assert body["enable_formula"] is True
    assert body["is_ocr"] is False
    assert body["language"] == "en"


async def test_cloud_submit_401_raises(monkeypatch, api_settings, tmp_path):
    api_settings()
    monkeypatch.setattr(
        httpx, "Client",
        _fake_client_cls(lambda method, url, kwargs: FakeResponse(status_code=401)),
    )

    with pytest.raises(RuntimeError, match="MINERU_API_KEY"):
        await MinerUAdapter().parse(_fake_pdf(tmp_path))


async def test_cloud_failed_state_raises(monkeypatch, api_settings, tmp_path):
    api_settings()
    monkeypatch.setattr(
        httpx, "Client",
        _fake_client_cls(
            lambda method, url, kwargs: FakeResponse(
                text=json.dumps({"code": 0, "data": {"batch_id": "b1", "file_urls": ["https://u.example/x"]}})
            ) if method == "post" else FakeResponse()
            if method == "put" else FakeResponse(
                text=json.dumps({
                    "code": 0,
                    "data": {"extract_result": {"state": "failed", "msg": "boom"}},
                })
            )
        ),
    )

    with pytest.raises(RuntimeError, match="failed"):
        await MinerUAdapter().parse(_fake_pdf(tmp_path))


async def test_cloud_poll_timeout_raises(monkeypatch, api_settings, tmp_path):
    api_settings(timeout=1)
    monkeypatch.setattr(
        httpx, "Client",
        _fake_client_cls(
            lambda method, url, kwargs: FakeResponse(
                text=json.dumps({"code": 0, "data": {"batch_id": "b1", "file_urls": ["https://u.example/x"]}})
            ) if method == "post" else FakeResponse()
            if method == "put" else FakeResponse(
                text=json.dumps({
                    "code": 0,
                    "data": {"extract_result": {"state": "running"}},
                })
            )
        ),
    )

    with pytest.raises(RuntimeError, match="timed out"):
        await MinerUAdapter().parse(_fake_pdf(tmp_path))


# ── Self-hosted mode (mineru-api /tasks) ─────────────────────────────────


async def test_selfhosted_parse_success(monkeypatch, api_settings, tmp_path):
    api_settings(mode="selfhosted", key="", base="http://mineru-api:8000")
    zipped = _make_result_zip(
        md_content="# Self Hosted\n\n![](images/x.png)",
        images={"x.png": b"PNGDATA"},
    )

    def handler(method, url, kwargs):
        if method == "post" and url.endswith("/tasks"):
            assert "files" in kwargs, "self-hosted submit must be multipart"
            return FakeResponse(text=json.dumps({"task_id": "t1"}))
        if method == "get" and url.endswith("/tasks/t1"):
            return FakeResponse(text=json.dumps({"task": {"state": "done"}}))
        if method == "get" and url.endswith("/tasks/t1/result"):
            return FakeResponse(content=zipped)
        raise AssertionError(f"unexpected call: {method} {url}")

    monkeypatch.setattr(httpx, "Client", _fake_client_cls(handler))

    result = await MinerUAdapter().parse(_fake_pdf(tmp_path))

    assert result.title == "Self Hosted"
    assert "http://localhost:8000/images/x.png" in result.markdown
    assert result.metadata["engine"] == "api-selfhosted"
    assert result.metadata["image_count"] == 1


async def test_selfhosted_markdown_result(monkeypatch, api_settings, tmp_path):
    api_settings(mode="selfhosted", key="", base="http://mineru-api:8000")

    def handler(method, url, kwargs):
        if method == "post" and url.endswith("/tasks"):
            return FakeResponse(text=json.dumps({"task_id": "t1"}))
        if method == "get" and url.endswith("/tasks/t1"):
            return FakeResponse(text=json.dumps({"task": {"state": "done"}}))
        if method == "get" and url.endswith("/tasks/t1/result"):
            return FakeResponse(
                content="# Plain\n\nmarkdown only".encode("utf-8"),
                headers={"content-type": "text/markdown"},
            )
        raise AssertionError(f"unexpected call: {method} {url}")

    monkeypatch.setattr(httpx, "Client", _fake_client_cls(handler))

    result = await MinerUAdapter().parse(_fake_pdf(tmp_path))

    assert result.title == "Plain"
    assert result.metadata["engine"] == "api-selfhosted"


# ── Fallback behaviour ───────────────────────────────────────────────────


async def test_disabled_api_falls_through_to_local(monkeypatch, api_settings, tmp_path):
    api_settings(enabled=False)
    monkeypatch.setattr(httpx, "Client", None)

    with pytest.raises(RuntimeError, match="MinerU is not installed"):
        await MinerUAdapter().parse(_fake_pdf(tmp_path))


def test_is_available_reflects_api_config(api_settings):
    api_settings()
    assert MinerUAdapter().is_available is True

    api_settings(enabled=False)
    assert MinerUAdapter().is_available is False


# ── Settings round-trip ──────────────────────────────────────────────────


def test_settings_update_saves_mineru_api_config(monkeypatch, tmp_path):
    env_path = tmp_path / ".env"
    env_path.write_text("USE_MOCK_AI=true\n", encoding="utf-8")
    sentinel = object()
    monkeypatch.setattr(settings_page, "DOTENV_PATH", env_path)
    monkeypatch.setattr(settings_page, "reload_settings", lambda: None)
    monkeypatch.setattr(settings_page, "get_settings", lambda: sentinel)

    result = settings_page.update_settings(
        settings_page.SettingsUpdate(
            mineru_api_enabled=True,
            mineru_api_key="secret-key",
            mineru_api_mode="cloud",
            mineru_api_model="vlm",
            mineru_api_base_url="https://mineru.net",
            mineru_api_enable_formula=True,
            api_base_url="http://localhost:8000",
        )
    )

    assert result is sentinel
    saved = settings_page._read_env_file()
    assert saved["MINERU_API_ENABLED"] == "true"
    assert saved["MINERU_API_KEY"] == "secret-key"
    assert saved["MINERU_API_MODE"] == "cloud"
    assert saved["MINERU_API_MODEL"] == "vlm"
    assert saved["MINERU_API_BASE_URL"] == "https://mineru.net"
    assert saved["MINERU_API_ENABLE_FORMULA"] == "true"
    assert saved["API_BASE_URL"] == "http://localhost:8000"


def test_settings_update_masked_key_keeps_saved_value(monkeypatch, tmp_path):
    env_path = tmp_path / ".env"
    env_path.write_text("MINERU_API_KEY=real-secret\n", encoding="utf-8")
    monkeypatch.setattr(settings_page, "DOTENV_PATH", env_path)
    monkeypatch.setattr(settings_page, "reload_settings", lambda: None)
    monkeypatch.setattr(settings_page, "get_settings", lambda: object())

    settings_page.update_settings(settings_page.SettingsUpdate(mineru_api_key="********"))

    assert settings_page._read_env_file()["MINERU_API_KEY"] == "real-secret"


def test_settings_update_rejects_unknown_mineru_values(monkeypatch, tmp_path):
    env_path = tmp_path / ".env"
    env_path.write_text("", encoding="utf-8")
    monkeypatch.setattr(settings_page, "DOTENV_PATH", env_path)
    monkeypatch.setattr(settings_page, "reload_settings", lambda: None)
    monkeypatch.setattr(settings_page, "get_settings", lambda: object())

    from fastapi import HTTPException

    with pytest.raises(HTTPException):
        settings_page.update_settings(settings_page.SettingsUpdate(mineru_api_mode="bogus"))
    with pytest.raises(HTTPException):
        settings_page.update_settings(settings_page.SettingsUpdate(mineru_api_model="bogus"))


def test_build_response_masks_mineru_api_key():
    cfg = config.Settings(_env_file=None, mineru_api_key="supersecret1234")
    response = settings_page._build_response(cfg).model_dump()

    assert response["mineru_api_key"].endswith("1234")
    assert "supersecret" not in response["mineru_api_key"]
