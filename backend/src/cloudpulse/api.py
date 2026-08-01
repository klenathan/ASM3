from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from cloudpulse.config import get_settings


def create_api(title: str) -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=title, version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    return app
