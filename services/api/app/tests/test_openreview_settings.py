"""Tests for local, secret-safe OpenReview import settings."""

import pytest
from pydantic import ValidationError

from app.core import config
from app.routers import settings_page


def test_normal_settings_response_never_returns_openreview_secrets():
    cfg = config.Settings(
        _env_file=None,
        openreview_username="user@example.com",
        openreview_password="password-secret",
        openreview_access_token="token-secret",
    )

    response = settings_page._build_response(cfg).model_dump()

    assert response["openreview_username"] == "user@example.com"
    assert response["openreview_password_configured"] is True
    assert response["openreview_access_token_configured"] is True
    assert "openreview_password" not in response
    assert "openreview_access_token" not in response
    assert "password-secret" not in repr(response)
    assert "token-secret" not in repr(response)


def test_settings_update_saves_and_clears_openreview_auth(monkeypatch, tmp_path):
    env_path = tmp_path / ".env"
    env_path.write_text("USE_MOCK_AI=true\n", encoding="utf-8")
    sentinel_response = object()
    monkeypatch.setattr(settings_page, "DOTENV_PATH", env_path)
    monkeypatch.setattr(settings_page, "reload_settings", lambda: None)
    monkeypatch.setattr(settings_page, "get_settings", lambda: sentinel_response)

    result = settings_page.update_settings(
        settings_page.SettingsUpdate(
            openreview_username="  user@example.com  ",
            openreview_password="password-secret",
            openreview_access_token="  token-secret  ",
        )
    )

    assert result is sentinel_response
    assert settings_page._read_env_file() | {} == {
        "USE_MOCK_AI": "true",
        "OPENREVIEW_USERNAME": "user@example.com",
        "OPENREVIEW_PASSWORD": "password-secret",
        "OPENREVIEW_ACCESS_TOKEN": "token-secret",
    }

    settings_page.update_settings(
        settings_page.SettingsUpdate(
            openreview_password="",
            openreview_access_token="",
        )
    )

    saved = settings_page._read_env_file()
    assert saved["OPENREVIEW_PASSWORD"] == ""
    assert saved["OPENREVIEW_ACCESS_TOKEN"] == ""


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("openreview_username", "user@example.com\nINJECTED=value"),
        ("openreview_password", "secret\rINJECTED=value"),
        ("openreview_access_token", "token\nINJECTED=value"),
    ],
)
def test_openreview_settings_reject_multiline_env_injection(field, value):
    with pytest.raises(ValidationError, match="single-line"):
        settings_page.SettingsUpdate(**{field: value})


def test_reload_settings_preserves_imported_singleton_identity(monkeypatch):
    imported_reference = config.settings
    previous_values = (
        imported_reference.openreview_username,
        imported_reference.openreview_password,
        imported_reference.openreview_access_token,
    )
    monkeypatch.setenv("OPENREVIEW_USERNAME", "reload@example.com")
    monkeypatch.setenv("OPENREVIEW_PASSWORD", "reload-password")
    monkeypatch.setenv("OPENREVIEW_ACCESS_TOKEN", "reload-token")

    try:
        config.reload_settings()

        assert config.settings is imported_reference
        assert imported_reference.openreview_username == "reload@example.com"
        assert imported_reference.openreview_password == "reload-password"
        assert imported_reference.openreview_access_token == "reload-token"
    finally:
        (
            imported_reference.openreview_username,
            imported_reference.openreview_password,
            imported_reference.openreview_access_token,
        ) = previous_values
