"""Tests that the local app exposes no user-account route surface."""

from app.main import app


def test_account_routes_are_not_registered():
    account_paths = [
        route.path
        for route in app.routes
        if getattr(route, "path", "").startswith("/auth")
    ]

    assert account_paths == []
