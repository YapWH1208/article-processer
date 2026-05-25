"""Tests for provider construction from developer config entries."""

import app.services.ai.anthropic_provider as anthropic_provider_module
from app.services.ai.base import _build_provider_from_entry
from app.services.ai.mock_provider import MockLLMProvider
from app.services.ai.openai_provider import CustomOpenAIProvider, OpenAIProvider


def test_openai_provider_entry_uses_configured_key_and_model():
    provider = _build_provider_from_entry({
        "type": "openai",
        "api_key": "test-key",
        "model": "gpt-test",
        "protocol": "openai",
    })

    assert isinstance(provider, OpenAIProvider)
    assert provider.model == "gpt-test"
    assert provider._provider_name == "openai"


def test_deepseek_provider_entry_uses_openai_compatible_client():
    provider = _build_provider_from_entry({
        "type": "DeepSeek",
        "api_key": "test-key",
        "base_url": "https://api.deepseek.com",
        "model": "deepseek-v4-pro",
        "protocol": "openai",
    })

    assert isinstance(provider, CustomOpenAIProvider)
    assert provider.model == "deepseek-v4-pro"
    assert provider._provider_name == "deepseek"


def test_cloud_provider_entry_without_key_falls_back_to_mock():
    provider = _build_provider_from_entry({
        "type": "openrouter",
        "api_key": "",
        "model": "openai/gpt-test",
        "protocol": "openai",
    })

    assert isinstance(provider, MockLLMProvider)


def test_anthropic_preset_without_base_url_uses_native_with_env_key(monkeypatch):
    class FakeAnthropicProvider:
        def __init__(self, api_key=None, model=None, provider_name="anthropic"):
            self.api_key = api_key
            self.model = model
            self.provider_name = provider_name

    class FakeCustomAnthropicProvider:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

    monkeypatch.setattr(anthropic_provider_module, "AnthropicProvider", FakeAnthropicProvider)
    monkeypatch.setattr(anthropic_provider_module, "CustomAnthropicProvider", FakeCustomAnthropicProvider)
    monkeypatch.setattr("app.services.ai.base.settings.anthropic_api_key", "env-anthropic-key")
    monkeypatch.setattr("app.services.ai.base.settings.anthropic_model", "claude-env-model")

    provider = _build_provider_from_entry({
        "type": "anthropic",
        "api_key": "",
        "base_url": "",
        "model": "",
        "protocol": "anthropic",
    })

    assert isinstance(provider, FakeAnthropicProvider)
    assert provider.api_key == "env-anthropic-key"
    assert provider.model == "claude-sonnet-4-20250514"
