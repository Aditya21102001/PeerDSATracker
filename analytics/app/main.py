"""PeerDSATracker analytics + sync microservice.

Deliberately stateless and DB-less. Spring Boot owns the database; this service
takes rows in, returns computed rows out, and talks to external platforms.
Keeping a single DB writer means transactions, retries and idempotency live in
exactly one place.

Run:  uvicorn app.main:app --reload --port 8000
"""

from fastapi import Depends, FastAPI

from app.clients import codeforces, leetcode
from app.deps import require_internal_token
from app.schemas import (
    CodeforcesStats,
    FetchRequest,
    LeetCodeStats,
    ReviseNextRequest,
    ReviseNextResponse,
    WeaknessRequest,
    WeaknessResponse,
)
from app.services import revision, weakness

app = FastAPI(title="PeerDSATracker Analytics", version="0.1.0")

# Everything except /health is callable only by the Spring Boot backend.
internal = [Depends(require_internal_token)]


@app.get("/health")
async def health() -> dict[str, str]:
    """Unauthenticated liveness probe."""
    return {"status": "ok"}


@app.get("/internal/ping", dependencies=internal)
async def internal_ping() -> dict[str, str]:
    """Proves the shared-secret handshake with Spring Boot works."""
    return {"status": "authenticated"}


# ------------------------------------------------------------- external I/O

@app.post("/fetch/leetcode", response_model=LeetCodeStats, dependencies=internal)
async def fetch_leetcode(request: FetchRequest) -> LeetCodeStats:
    """Best-effort. LeetCode has no official API; failures return found=false."""
    return await leetcode.fetch(request.handle)


@app.post("/fetch/codeforces", response_model=CodeforcesStats, dependencies=internal)
async def fetch_codeforces(request: FetchRequest) -> CodeforcesStats:
    return await codeforces.fetch(request.handle)


# --------------------------------------------------------------- pure compute

@app.post("/analytics/weakness", response_model=WeaknessResponse, dependencies=internal)
async def analytics_weakness(request: WeaknessRequest) -> WeaknessResponse:
    return weakness.analyse(request)


@app.post("/analytics/revise-next", response_model=ReviseNextResponse, dependencies=internal)
async def analytics_revise_next(request: ReviseNextRequest) -> ReviseNextResponse:
    return revision.recommend(request)
