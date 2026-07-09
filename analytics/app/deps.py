from fastapi import Header, HTTPException, status

from app.config import settings


async def require_internal_token(x_internal_token: str | None = Header(default=None)) -> None:
    """Every non-health route is callable only by the Spring Boot backend."""
    if x_internal_token != settings.internal_token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid internal token")
