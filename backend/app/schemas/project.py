from pydantic import BaseModel
from uuid import UUID
from datetime import datetime
from typing import Optional
from app.models.project import ProjectStatus


class ProjectBase(BaseModel):
    name: str
    po_number: Optional[str] = None
    part_number: Optional[str] = None
    customer_name: Optional[str] = None
    product_description: Optional[str] = None
    scope_of_supply: Optional[str] = None
    status: ProjectStatus = ProjectStatus.ACTIVE


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    po_number: Optional[str] = None
    part_number: Optional[str] = None
    customer_name: Optional[str] = None
    product_description: Optional[str] = None
    scope_of_supply: Optional[str] = None
    status: Optional[ProjectStatus] = None


class ProjectResponse(ProjectBase):
    id: UUID
    created_by_id: Optional[UUID] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
