"""Regression tests for method-aware request rate limits."""

import asyncio

from app.core.rate_limit import RateLimiter, _resolve_limit


def test_normal_reads_use_the_expanded_read_budget():
    assert _resolve_limit("GET", "/articles") == (300, "__read__")
    assert _resolve_limit("HEAD", "/dashboard/jobs") == (300, "__read__")
    assert _resolve_limit("POST", "/articles") == (60, "__default__")


def test_get_chat_history_uses_read_budget_while_post_chat_stays_limited():
    assert _resolve_limit("GET", "/articles/7/chat") == (300, "__read__")
    assert _resolve_limit("POST", "/articles/7/chat") == (10, "/articles/{id}/chat")


def test_normal_ui_read_burst_is_allowed():
    async def exercise():
        limiter = RateLimiter()
        results = [
            await limiter.is_allowed("127.0.0.1", "/articles", method="GET")
            for _ in range(100)
        ]
        assert all(allowed for allowed, _ in results)

    asyncio.run(exercise())


def test_expensive_post_limits_remain_strict():
    async def exercise():
        limiter = RateLimiter()
        limits = [
            ("/uploads", 5),
            ("/articles/chat", 10),
            ("/articles/7/chat", 10),
            ("/articles/7/reprocess", 5),
        ]

        for path, limit in limits:
            results = [
                await limiter.is_allowed("127.0.0.1", path, method="POST")
                for _ in range(limit + 1)
            ]
            assert [allowed for allowed, _ in results].count(True) == limit
            assert results[-1][1] is not None

    asyncio.run(exercise())
