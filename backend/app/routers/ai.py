import asyncio
import uuid
from datetime import datetime, timezone
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.limiter import limiter
from app.models.ai_interaction import AIInteractionType
from app.routers.auth import get_current_user
from app.models.user import User
from app.services.claude_service import claude_service

router = APIRouter(prefix="/ai", tags=["ai"])

# Module-level cache: project_id → (timestamp, summary_text)
_summary_cache: dict[str, tuple[datetime, str]] = {}
_SUMMARY_TTL_SECONDS = 600  # 10 minutes


# ── Request / Response schemas ────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    project_id: str | None = None
    messages: list[dict] | None = None  # full conversation history (optional)


class PredictRequest(BaseModel):
    project_id: str
    prediction_type: str


class PersonInsightRequest(BaseModel):
    person_id: str
    insight_type: str


# ── Helper ────────────────────────────────────────────────────────────────────

def _build_messages(req: ChatRequest) -> list[dict]:
    if req.messages:
        return req.messages
    return [{"role": "user", "content": req.message}]


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/chat")
@limiter.limit("20/minute")
async def chat(
    request: Request,
    body: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.services.ai_context_service import ai_context_service

    try:
        if body.project_id:
            system_prompt = await ai_context_service.build_project_context(body.project_id, db)
        else:
            system_prompt = await ai_context_service.build_dashboard_context(str(current_user.id), db)

        messages = _build_messages(body)
        text, tokens, duration_ms = await claude_service.chat(messages, system_prompt, stream=False)

        asyncio.create_task(
            claude_service.log_interaction(
                user_id=current_user.id,
                interaction_type=AIInteractionType.CHAT,
                response_text=text,
                messages=messages,
                tokens_used=tokens,
                duration_ms=duration_ms,
                project_id=uuid.UUID(body.project_id) if body.project_id else None,
            )
        )

        return {"success": True, "data": {"response": text, "tokens_used": tokens}}

    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI service error: {exc}")


@router.post("/chat/stream")
@limiter.limit("10/minute")
async def chat_stream(
    request: Request,
    body: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.services.ai_context_service import ai_context_service

    try:
        if body.project_id:
            system_prompt = await ai_context_service.build_project_context(body.project_id, db)
        else:
            system_prompt = await ai_context_service.build_dashboard_context(str(current_user.id), db)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    messages = _build_messages(body)

    async def event_generator() -> AsyncGenerator[str, None]:
        collected: list[str] = []
        try:
            async for token in claude_service._stream_response(messages, system_prompt):
                collected.append(token)
                yield f"data: {token}\n\n"
        except Exception as exc:
            yield f"data: [ERROR] {exc}\n\n"
        finally:
            yield "data: [DONE]\n\n"
            full_text = "".join(collected)
            if full_text:
                asyncio.create_task(
                    claude_service.log_interaction(
                        user_id=current_user.id,
                        interaction_type=AIInteractionType.CHAT,
                        response_text=full_text,
                        messages=messages,
                        project_id=uuid.UUID(body.project_id) if body.project_id else None,
                    )
                )

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/predict")
@limiter.limit("10/minute")
async def predict(
    request: Request,
    body: PredictRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        text, tokens, duration_ms = await claude_service.get_prediction(
            body.project_id, body.prediction_type, db
        )

        asyncio.create_task(
            claude_service.log_interaction(
                user_id=current_user.id,
                interaction_type=AIInteractionType.PREDICTION,
                response_text=text,
                messages=[{"role": "user", "content": body.prediction_type}],
                tokens_used=tokens,
                duration_ms=duration_ms,
                project_id=uuid.UUID(body.project_id),
                prediction_type=body.prediction_type,
            )
        )

        return {
            "success": True,
            "data": {
                "prediction": text,
                "prediction_type": body.prediction_type,
                "tokens_used": tokens,
            },
        }

    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI service error: {exc}")


@router.post("/person-insight")
@limiter.limit("10/minute")
async def person_insight(
    request: Request,
    body: PersonInsightRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        text, tokens, duration_ms = await claude_service.get_person_insight(
            body.person_id, body.insight_type, db
        )

        asyncio.create_task(
            claude_service.log_interaction(
                user_id=current_user.id,
                interaction_type=AIInteractionType.PERSON_INSIGHT,
                response_text=text,
                messages=[{"role": "user", "content": body.insight_type}],
                tokens_used=tokens,
                duration_ms=duration_ms,
                prediction_type=body.insight_type,
            )
        )

        return {
            "success": True,
            "data": {
                "insight": text,
                "insight_type": body.insight_type,
                "tokens_used": tokens,
            },
        }

    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI service error: {exc}")


@router.get("/quick-summary/{project_id}")
@limiter.limit("30/minute")
async def quick_summary(
    request: Request,
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cache_key = project_id
    now = datetime.now(timezone.utc)

    cached = _summary_cache.get(cache_key)
    if cached:
        cached_at, cached_text = cached
        age = (now - cached_at).total_seconds()
        if age < _SUMMARY_TTL_SECONDS:
            return {"success": True, "data": {"summary": cached_text, "cached": True}}

    try:
        text, tokens, duration_ms = await claude_service.get_prediction(
            project_id, "health_summary", db
        )
        _summary_cache[cache_key] = (now, text)

        asyncio.create_task(
            claude_service.log_interaction(
                user_id=current_user.id,
                interaction_type=AIInteractionType.PREDICTION,
                response_text=text,
                messages=[{"role": "user", "content": "health_summary"}],
                tokens_used=tokens,
                duration_ms=duration_ms,
                project_id=uuid.UUID(project_id),
                prediction_type="health_summary",
            )
        )

        return {"success": True, "data": {"summary": text, "cached": False}}

    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI service error: {exc}")
