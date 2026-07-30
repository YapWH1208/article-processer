import asyncio

from app.core.rate_limit import RateLimiter, _resolve_limit


def test_get_article_chat_history_uses_normal_read_budget() -> None:
    assert _resolve_limit("GET", "/articles/7/chat") == (120, "__default__")
    assert _resolve_limit("POST", "/articles/7/chat") == (10, "/articles/{id}/chat")


def test_normal_article_page_reads_do_not_trip_the_chat_budget() -> None:
    async def exercise() -> None:
        limiter = RateLimiter()
        results = [
            await limiter.is_allowed("127.0.0.1", "/articles/7/chat", method="GET")
            for _ in range(20)
        ]
        assert all(allowed for allowed, _ in results)

    asyncio.run(exercise())


def test_post_chat_remains_rate_limited() -> None:
    async def exercise() -> None:
        limiter = RateLimiter()
        results = [
            await limiter.is_allowed("127.0.0.1", "/articles/7/chat", method="POST")
            for _ in range(11)
        ]
        assert [allowed for allowed, _ in results].count(True) == 10
        assert results[-1][1] is not None

    asyncio.run(exercise())
