from pydantic import BaseModel
from uuid import UUID
from datetime import datetime
from typing import Optional


class PersonBase(BaseModel):
    name: str
    employee_id: str
    department: str
    role: str
    skills: list[str] = []
    is_active: bool = True
    max_concurrent_tasks: int = 3
    avg_delay_days: float = 0.0
    performance_score: float = 100.0
    on_time_rate: float = 100.0
    leave_schedule: list[dict] = []


class PersonCreate(PersonBase):
    pass


class PersonUpdate(BaseModel):
    name: Optional[str] = None
    employee_id: Optional[str] = None
    department: Optional[str] = None
    role: Optional[str] = None
    skills: Optional[list[str]] = None
    is_active: Optional[bool] = None
    max_concurrent_tasks: Optional[int] = None
    avg_delay_days: Optional[float] = None
    performance_score: Optional[float] = None
    on_time_rate: Optional[float] = None


class PersonResponse(PersonBase):
    id: UUID
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
