"""Security utilities — input sanitization, prompt protection."""

import re
import hashlib
from pathlib import Path


def sanitize_filename(filename: str) -> str:
    """Remove path traversal characters and normalize."""
    # Strip any path components
    name = Path(filename).name
    # Remove null bytes and other dangerous characters
    name = re.sub(r'[\x00-\x1f\x7f-\x9f]', '', name)
    # Remove any leading dots that could hide files
    name = name.lstrip('.')
    if not name:
        name = "unnamed"
    return name


def compute_file_hash(content: bytes) -> str:
    """Compute SHA-256 hash of file content."""
    return hashlib.sha256(content).hexdigest()


def validate_upload_filename(filename: str) -> bool:
    """Check that filename has an allowed extension."""
    allowed = {'.pdf', '.zip', '.html', '.htm', '.md', '.txt', '.markdown'}
    ext = Path(filename).suffix.lower()
    return ext in allowed


def protect_prompt_from_injection(document_text: str) -> str:
    """Wrap document text to protect against prompt injection.
    
    The document is wrapped in XML-like tags and the model is instructed
    not to follow instructions found within. This is a defense-in-depth
    measure — the real protection is in the system prompt itself.
    """
    # Truncate extremely long documents in prompts
    max_len = 50_000
    if len(document_text) > max_len:
        document_text = document_text[:max_len] + "\n\n[... document truncated ...]"
    
    return f"<document>\n{document_text}\n</document>"


def is_safe_path(base_dir: Path, target_path: Path) -> bool:
    """Check that target_path is within base_dir (prevents path traversal)."""
    try:
        resolved = base_dir.resolve()
        target = (resolved / target_path).resolve()
        return str(target).startswith(str(resolved))
    except (ValueError, OSError):
        return False


# ── Authentication utilities ──────────────────────────────────────────────

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

# Try importing JWT libraries (optional — auth works without them)
try:
    from jose import jwt, JWTError
    HAS_JOSE = True
except ImportError:
    HAS_JOSE = False
    jwt = None  # type: ignore
    JWTError = Exception  # type: ignore

try:
    from passlib.context import CryptContext
    HAS_PASSLIB = True
except ImportError:
    HAS_PASSLIB = False
    CryptContext = None  # type: ignore

# JWT configuration
JWT_SECRET = secrets.token_hex(32)  # Generated on first import — use env var in production
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 72

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto") if HAS_PASSLIB else None


def hash_password(password: str) -> str:
    """Hash a password using bcrypt (via passlib) or sha256 fallback."""
    if _pwd_context:
        return _pwd_context.hash(password)
    # Fallback: salted SHA-256 (less secure, but works without passlib)
    salt = secrets.token_hex(16)
    return f"sha256${salt}${hashlib.sha256((salt + password).encode()).hexdigest()}"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    if _pwd_context and hashed_password.startswith("$2"):
        return _pwd_context.verify(plain_password, hashed_password)
    # Fallback: verify sha256 format
    if hashed_password.startswith("sha256$"):
        parts = hashed_password.split("$")
        if len(parts) == 3:
            _, salt, stored_hash = parts
            computed = hashlib.sha256((salt + plain_password).encode()).hexdigest()
            return secrets.compare_digest(computed, stored_hash)
    return False


def create_access_token(user_id: int, email: str) -> str:
    """Create a JWT access token."""
    if not HAS_JOSE:
        # Fallback: simple signed token
        payload = f"{user_id}:{email}:{datetime.now(timezone.utc).timestamp()}"
        sig = hashlib.sha256((payload + JWT_SECRET).encode()).hexdigest()[:16]
        return f"simpletok${payload}${sig}"

    expire = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    to_encode = {
        "sub": str(user_id),
        "email": email,
        "exp": expire,
    }
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> Optional[dict]:
    """Decode and validate a JWT access token. Returns payload or None."""
    if not token:
        return None

    # Handle simple token fallback
    if token.startswith("simpletok$"):
        try:
            parts = token[len("simpletok$"):].rsplit("$", 1)
            if len(parts) != 2:
                return None
            payload, sig = parts
            expected_sig = hashlib.sha256((payload + JWT_SECRET).encode()).hexdigest()[:16]
            if not secrets.compare_digest(sig, expected_sig):
                return None
            user_id_str, email, _ = payload.split(":", 2)
            return {"sub": user_id_str, "email": email}
        except Exception:
            return None

    if not HAS_JOSE:
        return None

    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except JWTError:
        return None


def get_optional_user_id(token: Optional[str]) -> Optional[int]:
    """Extract user_id from token if present and valid. Returns None if not authenticated."""
    if not token:
        return None
    token = token.replace("Bearer ", "")
    payload = decode_access_token(token)
    if payload and payload.get("sub"):
        try:
            return int(payload["sub"])
        except (ValueError, TypeError):
            return None
    return None
