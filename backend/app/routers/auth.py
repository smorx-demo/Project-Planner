from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.user import User
from app.schemas.user import UserCreate, UserResponse, Token, LoginRequest
from app.services.auth_service import hash_password, verify_password, create_access_token
from app.dependencies import get_current_user
from app.envelope import ok, audit
from app.limiter import limiter

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", status_code=status.HTTP_201_CREATED)
@limiter.limit("20/minute")
async def register(request: Request, user_in: UserCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == user_in.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        name=user_in.name,
        email=user_in.email,
        password_hash=hash_password(user_in.password),
        role=user_in.role,
        department=user_in.department,
        job_title=user_in.job_title,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return ok(UserResponse.model_validate(user))


@router.post("/login")
@limiter.limit("20/minute")
async def login(request: Request, credentials: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == credentials.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(credentials.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Account is disabled")

    access_token = create_access_token({"sub": str(user.id)})
    await audit(
        db,
        user_id=user.id,
        action="LOGIN",
        entity_type="user",
        entity_id=str(user.id),
    )
    token_data = Token(access_token=access_token, user=UserResponse.model_validate(user))
    return ok(token_data)


@router.get("/me")
@limiter.limit("100/minute")
async def get_me(request: Request, current_user: User = Depends(get_current_user)):
    return ok(UserResponse.model_validate(current_user))


@router.post("/logout")
@limiter.limit("100/minute")
async def logout(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await audit(
        db,
        user_id=current_user.id,
        action="LOGOUT",
        entity_type="user",
        entity_id=str(current_user.id),
    )
    return ok({"message": "Logged out successfully"})
