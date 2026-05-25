"""FastAPI auth dependencies — importable from any router without circular imports.

Provides two FastAPI dependency functions:

- ``get_current_user`` — optional; returns ``User | None``.
- ``require_user`` — mandatory; returns ``User`` or raises 401.

Usage::

    from app.core.auth_deps import require_user

    @router.post("/articles")
    def create_thing(
        body: SomeSchema,
        user: User = Depends(require_user),
        db: Session = Depends(get_db),
    ):
        ...
"""

from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.core.security import get_optional_user_id
from app.db.session import get_db
from app.db.models import User

_auth_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_auth_scheme),
    db: Session = Depends(get_db),
) -> User | None:
    """Optional dependency — returns User if authenticated, None otherwise."""
    token = credentials.credentials if credentials else None
    user_id = get_optional_user_id(f"Bearer {token}" if token else None)
    if user_id:
        return db.query(User).filter(User.id == user_id, User.is_active == 1).first()
    return None


def require_user(
    current_user: User | None = Depends(get_current_user),
) -> User:
    """Require authentication — raises 401 if not authenticated."""
    if current_user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return current_user
