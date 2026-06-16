from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional


class UploadResponse(BaseModel):
    pet_id: str
    job_id: str
    status: str  # "queued"


class JobStatusResponse(BaseModel):
    job_id: str
    pet_id: str
    status: str  # queued|running|awaiting_review|completed|failed|needs_better_photo
    stage_progress: int  # 0-5
    error_message: Optional[str] = None
    failed_stage: Optional[str] = None
    preview_front: Optional[str] = None  # populated when awaiting_review
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ConfirmRequest(BaseModel):
    action: str = Field(pattern="^(confirm|regenerate)$")
