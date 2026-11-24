from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes.disciplines import router as disciplines_router
from app.api.routes.experiments import router as experiments_router
from app.api.routes.health import router as health_router
from app.api.routes.literature import router as literature_router
from app.core.config import (
    get_cors_origins,
    get_literature_settings,
    get_rate_limit_settings,
    get_trusted_proxy_ips,
)
from app.db.session import init_db
from app.services.literature import CrossrefService, LiteratureError
from app.services.rate_limit import build_rate_limiter


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    literature_settings = get_literature_settings()
    client = httpx.AsyncClient(
        timeout=httpx.Timeout(
            connect=literature_settings.connect_timeout,
            read=literature_settings.read_timeout,
            write=literature_settings.read_timeout,
            pool=literature_settings.connect_timeout,
        ),
        limits=httpx.Limits(
            max_connections=literature_settings.max_connections,
            max_keepalive_connections=literature_settings.max_connections,
        ),
        follow_redirects=False,
        trust_env=False,
    )
    rate_limit_settings = get_rate_limit_settings()
    app.state.literature_service = CrossrefService(client, literature_settings)
    app.state.rate_limiter = build_rate_limiter(rate_limit_settings)
    app.state.rate_limit_config = rate_limit_settings.config
    app.state.trusted_proxy_ips = get_trusted_proxy_ips()
    try:
        yield
    finally:
        await client.aclose()


app = FastAPI(
    title="EnviroLab Copilot API",
    description="Deterministic research services for EnviroLab Copilot.",
    version="0.1.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Accept", "Content-Type"],
)

app.include_router(health_router, prefix="/api")
app.include_router(disciplines_router, prefix="/api")
app.include_router(experiments_router, prefix="/api")
app.include_router(literature_router, prefix="/api")


@app.exception_handler(LiteratureError)
async def literature_error_handler(
    request: Request,
    error: LiteratureError,
) -> JSONResponse:
    headers = {}
    if error.retry_after is not None:
        headers["Retry-After"] = str(error.retry_after)
    return JSONResponse(
        status_code=error.status_code,
        content={
            "error": {
                "code": error.code,
                "message": error.message,
                "retry_after": error.retry_after,
            }
        },
        headers=headers,
    )


@app.exception_handler(RequestValidationError)
async def literature_validation_handler(
    request: Request,
    error: RequestValidationError,
):
    if request.url.path.startswith("/api/literature/"):
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "invalid_request",
                    "message": "请求参数不合法，请检查关键词、模式和分页范围。",
                    "retry_after": None,
                }
            },
        )
    return await request_validation_exception_handler(request, error)


@app.get("/", include_in_schema=False)
def root() -> dict[str, str]:
    return {
        "service": "envirolab-copilot-api",
        "status": "ok",
        "health": "/api/health",
    }
