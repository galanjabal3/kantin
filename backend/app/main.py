import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.ratelimit import limiter
from app.core.migrations import run_migrations
from app.api import auth, admin, seller, customer
import app.models

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(_: FastAPI):
    run_migrations()
    yield


app = FastAPI(
    title=settings.APP_NAME,
    description="Multi-tenant food ordering platform",
    version="1.0.0",
    lifespan=lifespan,
)

app.state.limiter = limiter

app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "Authorization", "Accept"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(admin.router, prefix="/api/admin", tags=["Admin"])
app.include_router(seller.router, prefix="/api/seller", tags=["Seller"])
app.include_router(customer.router, prefix="/api/r", tags=["Customer"])


@app.get("/health")
def health_check():
    return {"status": "ok", "app": settings.APP_NAME}
