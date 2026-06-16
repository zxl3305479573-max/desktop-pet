from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.config import settings
from app.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="可视化伴侣", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static file serving for generated assets
app.mount("/assets", StaticFiles(directory=settings.asset_dir), name="assets")


@app.get("/health")
def health():
    return {"status": "ok", "app": settings.app_name}


# Routers
from app.routers import auth, pets, generation
app.include_router(auth.router)
app.include_router(pets.router)
app.include_router(generation.router)
