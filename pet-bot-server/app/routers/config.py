"""Runtime API config endpoint — allows the frontend to push user preferences."""
from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.config import runtime_config
from app.providers.registry import invalidate_provider_cache

router = APIRouter(prefix="/api/v1", tags=["config"])


class ConfigUpdate(BaseModel):
    api_key: str | None = Field(default=None, description="OpenAI-compatible API key")
    api_base_url: str | None = Field(default=None, description="OpenAI-compatible base URL")
    model: str | None = Field(default=None, description="Image generation model name")


class ConfigResponse(BaseModel):
    api_key: str | None
    api_base_url: str | None
    model: str | None


@router.put("/config", response_model=ConfigResponse)
def update_config(body: ConfigUpdate):
    runtime_config.update(
        api_key=body.api_key,
        api_base_url=body.api_base_url,
        model=body.model,
    )
    # Force next get_provider() call to build a fresh client with new config
    invalidate_provider_cache()
    return ConfigResponse(**runtime_config.as_dict())


@router.get("/config", response_model=ConfigResponse)
def get_config():
    return ConfigResponse(**runtime_config.as_dict())
