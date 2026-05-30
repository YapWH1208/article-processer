"""Tests for URL import SSRF redirect handling."""

import pytest


def test_safe_redirect_handler_rejects_private_redirect_targets():
    try:
        from app.routers.imports import SafeRedirectHandler, UnsafeUrlError
    except ImportError as exc:
        raise AssertionError("safe redirect handler is missing") from exc

    handler = SafeRedirectHandler()

    with pytest.raises(UnsafeUrlError):
        handler.redirect_request(
            req=None,
            fp=None,
            code=302,
            msg="Found",
            headers={},
            newurl="http://127.0.0.1/internal.pdf",
        )
