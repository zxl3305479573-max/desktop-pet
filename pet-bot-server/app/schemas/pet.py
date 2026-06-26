from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional


class PetCreate(BaseModel):
    name: str = Field(default="My Pet", max_length=128)


class PetResponse(BaseModel):
    id: str
    name: str
    status: str
    preview_front: Optional[str] = None
    error_message: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class PetDetailResponse(PetResponse):
    user_id: str
    source_photo_path: Optional[str] = None
    asset_bundle_path: Optional[str] = None
    skeleton_json: Optional[str] = None
    updated_at: datetime


class PetListResponse(BaseModel):
    pets: list[PetResponse]
    total: int
