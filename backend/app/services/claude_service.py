import json
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.ai_interaction import AIInteraction, AIInteractionType

logger = logging.getLogger(__name__)

PREDICTION_PROMPTS: dict[str, str] = {
    "delay_risk": (
        "Analyse the current status of all activities. Which activities are at risk "
        "of delay or already delayed? For each, explain why and what the impact is "
        "on the downstream activities and Dispatch date. Be specific."
    ),
    "recovery_plan": (
        "The project has delays. Create a practical recovery plan. For each delayed "
        "activity, suggest: (1) specific actions to accelerate, (2) which person "
        "should lead the recovery, (3) whether any activities can run in parallel "
        "to save time. Quantify the days that could be recovered."
    ),
    "critical_path": (
        "Identify the critical path activities — those where any delay directly "
        "impacts the Dispatch date with zero float. List them in order. For each, "
        "state the float (slack in days). Highlight which activities are currently "
        "on the critical path AND already delayed."
    ),
    "resource_conflicts": (
        "Analyse all resource assignments. Are any people double-booked? "
        "Are any departments overloaded? Who is assigned to the most tasks "
        "simultaneously? Suggest reallocation if needed."
    ),
    "dispatch_forecast": (
        "Based on current actual progress vs plan, calculate the forecast Dispatch "
        "date. Show your working: start from the current delayed activities, cascade "
        "their delay through the remaining activity chain, and give a final date. "
        "Compare to the planned Dispatch date and state the total slip in days."
    ),
    "health_summary": (
        "Write a management summary of this project's current health. "
        "Use clear bullet points under these headings: "
        "**Overall Status**, **Key Risks**, **What Is Going Well**, **Immediate Actions**. "
        "Keep each bullet concise (one line). Use plain language suitable for a senior manager."
    ),
}

PERSON_INSIGHT_PROMPTS: dict[str, str] = {
    "performance_summary": (
        "Summarise this person's performance pattern based on their task history. "
        "What are their strengths? Where do they consistently fall behind? "
        "Be specific and constructive."
    ),
    "coaching_tips": (
        "Based on this person's delay patterns and task history, suggest 3–5 "
        "actionable coaching tips to help them improve delivery. Be specific: "
        "name the types of activities where they struggle and how to address it."
    ),
    "workload_assessment": (
        "Assess this person's current workload. Are they overloaded? "
        "Is it safe to assign more tasks to them right now? "
        "What is their utilisation rate and what does it mean practically?"
    ),
}


class ClaudeService:
    MODEL = "claude-sonnet-4-6"
    MAX_TOKENS = 1500

    def __init__(self):
        self._client = None

    @property
    def client(self):
        if self._client is None:
            if not settings.ANTHROPIC_API_KEY:
                raise RuntimeError(
                    "ANTHROPIC_API_KEY is not set. Add it to backend/.env to enable AI features."
                )
            import anthropic
            self._client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        return self._client

    # ── Core chat ─────────────────────────────────────────────────────────────

    async def chat(
        self,
        messages: list[dict],
        system_prompt: str,
        stream: bool = False,
    ) -> str | AsyncGenerator:
        if not stream:
            start = time.monotonic()
            response = await self.client.messages.create(
                model=self.MODEL,
                max_tokens=self.MAX_TOKENS,
                system=system_prompt,
                messages=messages,
            )
            duration_ms = int((time.monotonic() - start) * 1000)
            text = response.content[0].text
            tokens = response.usage.input_tokens + response.usage.output_tokens
            return text, tokens, duration_ms
        else:
            return self._stream_response(messages, system_prompt)

    async def _stream_response(
        self, messages: list[dict], system_prompt: str
    ) -> AsyncGenerator[str, None]:
        async with self.client.messages.stream(
            model=self.MODEL,
            max_tokens=self.MAX_TOKENS,
            system=system_prompt,
            messages=messages,
        ) as stream:
            async for text in stream.text_stream:
                yield text

    # ── Prediction ────────────────────────────────────────────────────────────

    async def get_prediction(
        self, project_id: str, prediction_type: str, db: AsyncSession
    ) -> tuple[str, int, int]:
        from app.services.ai_context_service import ai_context_service

        if prediction_type not in PREDICTION_PROMPTS:
            raise ValueError(f"Unknown prediction_type: {prediction_type}")

        system = await ai_context_service.build_project_context(project_id, db)
        prompt = PREDICTION_PROMPTS[prediction_type]
        result = await self.chat(
            [{"role": "user", "content": prompt}], system, stream=False
        )
        return result  # (text, tokens, duration_ms)

    # ── Person insight ────────────────────────────────────────────────────────

    async def get_person_insight(
        self, person_id: str, insight_type: str, db: AsyncSession
    ) -> tuple[str, int, int]:
        from app.services.ai_context_service import ai_context_service

        if insight_type not in PERSON_INSIGHT_PROMPTS:
            raise ValueError(f"Unknown insight_type: {insight_type}")

        system = await ai_context_service.build_person_context(person_id, db)
        prompt = PERSON_INSIGHT_PROMPTS[insight_type]
        return await self.chat(
            [{"role": "user", "content": prompt}], system, stream=False
        )

    # ── Logging ───────────────────────────────────────────────────────────────

    @staticmethod
    async def log_interaction(
        *,
        user_id: uuid.UUID,
        interaction_type: AIInteractionType,
        response_text: str,
        messages: list[dict],
        tokens_used: int = 0,
        duration_ms: int = 0,
        project_id: uuid.UUID | None = None,
        prediction_type: str | None = None,
    ) -> None:
        try:
            async with AsyncSessionLocal() as db:
                record = AIInteraction(
                    user_id=user_id,
                    project_id=project_id,
                    interaction_type=interaction_type,
                    prediction_type=prediction_type,
                    messages_json=messages,
                    response_text=response_text,
                    tokens_used=tokens_used,
                    duration_ms=duration_ms,
                )
                db.add(record)
                await db.commit()
        except Exception as exc:
            logger.error("Failed to log AI interaction: %s", exc)


claude_service = ClaudeService()
