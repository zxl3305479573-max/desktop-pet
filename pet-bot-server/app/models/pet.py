import uuid
import enum
from datetime import datetime
from sqlalchemy import String, DateTime, Text, Enum as SAEnum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class PetStatus(str, enum.Enum):
    UPLOADED = "uploaded"
    GENERATING = "generating"
    AWAITING_REVIEW = "awaiting_review"
    READY = "ready"
    FAILED = "failed"


class Pet(Base):
    __tablename__ = "pets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), default="My Pet")
    status: Mapped[PetStatus] = mapped_column(SAEnum(PetStatus), default=PetStatus.UPLOADED)
    source_photo_path: Mapped[str] = mapped_column(String(512), nullable=True)
    asset_bundle_path: Mapped[str] = mapped_column(String(512), nullable=True)
    preview_front: Mapped[str] = mapped_column(String(512), nullable=True)
    skeleton_json: Mapped[str] = mapped_column(Text, nullable=True)
    rig_quality: Mapped[str] = mapped_column(String(32), nullable=True)
    error_message: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
