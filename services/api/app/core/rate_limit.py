"""In-memory token-bucket rate limiter.

Zero-dependency rate limiting middleware for FastAPI. Tracks request
counts per client IP with configurable per-endpoint limits. Entries
for inactive clients are periodically cleaned up to bound memory usage.

Configuration
-------------
Global default:  60 requests / minute
High-cost paths: /articles/{id}/chat  → 10 req/min  (LLM calls)
                 /uploads             →  5 req/min  (file uploads)
                 /articles/{id}/reprocess →  5 req/min  (pipeline runs)
                 /auth/login          → 10 req/min  (brute-force mitigation)
"""

import time
import threading
from collections import defaultdict
from typing import Optional

from fastapi import Request


# ── Bucket state ───────────────────────────────────────────────────────────

class _TokenBucket:
    """Single-client token bucket with refill-on-check."""

    __slots__ = ("tokens", "last_refill", "rate", "capacity")

    def __init__(self, rate: float, capacity: int) -> None:
        self.tokens = float(capacity)       # current token count
        self.last_refill = time.monotonic()  # last refill timestamp
        self.rate = rate                     # tokens / second
        self.capacity = capacity


# ── Endpoint-specific limits ──────────────────────────────────────────────

# (path_prefix, requests_per_minute)
_ENDPOINT_LIMITS: list[tuple[str, int]] = [
    ("/uploads", 5),
    ("/articles/{id}/chat", 10),
    ("/articles/{id}/reprocess", 5),
    ("/auth/login", 10),
]

# Global default when no endpoint-specific limit matches
_DEFAULT_RPM = 60

# Cleanup interval: how often to scan for stale buckets
_CLEANUP_INTERVAL_S = 300  # 5 minutes
# Stale threshold: remove buckets idle longer than this
_STALE_THRESHOLD_S = 600  # 10 minutes


def _resolve_limit(path: str) -> int:
    """Return requests-per-minute for *path*.

    Matches against known endpoint prefixes. For parameterised paths the
    raw request path is used (e.g. ``/articles/42/chat``) — we match on
    prefix and segment count to avoid false positives.
    """
    segments = path.rstrip("/").split("/")
    for prefix, rpm in _ENDPOINT_LIMITS:
        prefix_segments = prefix.rstrip("/").split("/")
        if len(segments) == len(prefix_segments):
            if all(
                seg == pseg or ("{" in pseg and "}" in pseg)
                for seg, pseg in zip(segments, prefix_segments)
            ):
                return rpm
    return _DEFAULT_RPM


# ── Limiter ────────────────────────────────────────────────────────────────

class RateLimiter:
    """In-memory token-bucket rate limiter.

    Thread-safe. Designed as a singleton attached to the FastAPI app state.
    """

    def __init__(self) -> None:
        self._buckets: dict[str, _TokenBucket] = {}
        self._lock = threading.Lock()
        self._last_cleanup = time.monotonic()

    # ── public API ─────────────────────────────────────────────────────

    def is_allowed(self, client_id: str, path: str) -> bool:
        """Check (and consume) a request for *client_id* on *path*.

        Returns ``True`` if the request is within limits, ``False`` if
        rate-limited (caller should return 429).
        """
        rpm = _resolve_limit(path)
        rate = rpm / 60.0   # tokens per second
        capacity = rpm       # bucket capacity = one minute worth

        now = time.monotonic()

        with self._lock:
            self._maybe_cleanup(now)

            bucket = self._buckets.get(client_id)
            if bucket is None:
                bucket = _TokenBucket(rate=rate, capacity=capacity)
                self._buckets[client_id] = bucket

            # Refill tokens based on elapsed time
            elapsed = now - bucket.last_refill
            bucket.tokens = min(bucket.capacity, bucket.tokens + elapsed * bucket.rate)
            bucket.last_refill = now

            if bucket.tokens >= 1.0:
                bucket.tokens -= 1.0
                return True
            return False

    def clear(self, client_id: str) -> None:
        """Reset bucket for *client_id* (e.g. after successful login)."""
        with self._lock:
            self._buckets.pop(client_id, None)

    # ── helpers ────────────────────────────────────────────────────────

    def _maybe_cleanup(self, now: float) -> None:
        """Periodically remove buckets for clients that haven't been seen
        recently, bounding memory usage."""
        if now - self._last_cleanup < _CLEANUP_INTERVAL_S:
            return
        self._last_cleanup = now
        stale = [
            cid
            for cid, b in self._buckets.items()
            if now - b.last_refill > _STALE_THRESHOLD_S
        ]
        for cid in stale:
            del self._buckets[cid]


# ── Client IP resolution ───────────────────────────────────────────────────

def _get_client_id(request: Request) -> str:
    """Resolve a stable client identifier from the request.

    Prefers ``X-Forwarded-For`` (first entry) when behind a proxy;
    falls back to ``client.host`` for direct connections.
    """
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    host = getattr(request.client, "host", None) if request.client else None
    return host or "unknown"


# ── FastAPI middleware ─────────────────────────────────────────────────────

# Paths that should never be rate-limited
_SKIP_PREFIXES = ("/health", "/storage/", "/images/", "/openapi.json", "/docs", "/redoc")


class RateLimitMiddleware:
    """ASGI middleware that rate-limits requests per client IP."""

    def __init__(self, app, limiter: RateLimiter | None = None):
        self.app = app
        self.limiter = limiter or RateLimiter()

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "/")

        # Skip non-API paths
        if any(path.startswith(p) for p in _SKIP_PREFIXES):
            await self.app(scope, receive, send)
            return

        # Resolve client IP from headers
        client_id = "unknown"
        for header_name, header_value in scope.get("headers", []):
            if header_name == b"x-forwarded-for":
                client_id = header_value.decode("latin-1").split(",")[0].strip()
                break
        if client_id == "unknown":
            client_id = (
                scope.get("client", ("unknown", 0))[0] if scope.get("client") else "unknown"
            )

        if not self.limiter.is_allowed(client_id, path):
            # 429 Too Many Requests
            await send({
                "type": "http.response.start",
                "status": 429,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"retry-after", b"60"),
                ],
            })
            await send({
                "type": "http.response.body",
                "body": b'{"detail":"Too many requests. Please slow down.","status":429}',
            })
            return

        await self.app(scope, receive, send)
