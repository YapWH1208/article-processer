"""Token cost estimation helpers for LLM usage accounting."""

# Approximate per-token pricing in USD (per 1M tokens). Prompt / completion.
_MODEL_PRICING: dict[str, tuple[float, float]] = {
    # OpenAI
    "gpt-4.1-mini": (0.15, 0.60),
    "gpt-4.1": (2.00, 8.00),
    "gpt-4o": (2.50, 10.00),
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-4-turbo": (10.00, 30.00),
    # Anthropic
    "claude-sonnet-4-20250514": (3.00, 15.00),
    "claude-3.5-sonnet": (3.00, 15.00),
    "claude-3-opus": (15.00, 75.00),
    "claude-3-haiku": (0.25, 1.25),
    # DeepSeek
    "deepseek-chat": (0.14, 0.28),
    "deepseek-reasoner": (0.55, 2.19),
    # OpenRouter defaults
    "openai/gpt-4.1-mini": (0.15, 0.60),
    # GLM
    "glm-4-plus": (1.00, 1.00),
    # MiniMax
    "MiniMax-Text-01": (0.20, 1.10),
    # Kimi
    "moonshot-v1-8k": (0.60, 0.60),
}
_DEFAULT_PRICING = (1.00, 4.00)  # conservative fallback


def compute_token_cost(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    """Estimate API cost in USD from token counts and known model pricing."""
    prompt_price, completion_price = _MODEL_PRICING.get(model, _DEFAULT_PRICING)
    return round((prompt_tokens / 1_000_000) * prompt_price + (completion_tokens / 1_000_000) * completion_price, 6)
