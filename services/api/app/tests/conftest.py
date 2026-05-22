"""Pytest configuration."""

import pytest


def pytest_configure(config):
    """Configure pytest-asyncio to not use strict mode for non-async tests."""
    config.option.asyncio_mode = "auto"
