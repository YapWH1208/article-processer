"""Auth router — user registration, login, and token management."""

import logging
from fastapi import APIRouter, Depends, HTTPException, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr, Field

from app.db.session import get_db
from app.db.models import User
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    decode_access_token,
    get_optional_user_id,
)

logger = logging.getLogger(__name__)
router = APIRouter()
security = HTTPBearer(auto_error=False)


# ── Schemas ──────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=256)
    password: str = Field(..., min_length=8, max_length=128)
    display_name: str | None = None


class LoginRequest(BaseModel):
    email: str
    password: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    email: str
    display_name: str | None = None


class UserResponse(BaseModel):
    id: int
    email: str
    display_name: str | None = None
    is_active: bool
    created_at: str | None = None


# ── Helpers ──────────────────────────────────────────────────────────────

def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
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


# ── Endpoints ────────────────────────────────────────────────────────────

@router.post("/register", response_model=AuthResponse)
def register(request: RegisterRequest, db: Session = Depends(get_db)):
    """Register a new user account."""
    # Check for existing user
    existing = db.query(User).filter(User.email == request.email).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    # Create user
    user = User(
        email=request.email,
        password_hash=hash_password(request.password),
        display_name=request.display_name or request.email.split("@")[0],
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Generate token
    token = create_access_token(user.id, user.email)

    return AuthResponse(
        access_token=token,
        user_id=user.id,
        email=user.email,
        display_name=user.display_name,
    )


@router.post("/login", response_model=AuthResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    """Login and receive an access token."""
    user = db.query(User).filter(User.email == request.email).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not verify_password(request.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    token = create_access_token(user.id, user.email)

    return AuthResponse(
        access_token=token,
        user_id=user.id,
        email=user.email,
        display_name=user.display_name,
    )


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(require_user)):
    """Get the current authenticated user's profile."""
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        display_name=current_user.display_name,
        is_active=bool(current_user.is_active),
        created_at=current_user.created_at.isoformat() if current_user.created_at else None,
    )


@router.get("/verify")
def verify_token(current_user: User = Depends(require_user)):
    """Verify that a token is valid. Returns 200 if valid, 401 if not."""
    return {"valid": True, "user_id": current_user.id}
