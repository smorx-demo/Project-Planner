from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.services.status_service import check_db_connection
from app.envelope import ok
from app.limiter import limiter

router = APIRouter(tags=["health"])


@router.get("/health")
@limiter.limit("100/minute")
async def health_check(request: Request, db: AsyncSession = Depends(get_db)):
    db_ok = await check_db_connection(db)
    return ok({
        "status": "ok",
        "db": "connected" if db_ok else "disconnected",
    })
