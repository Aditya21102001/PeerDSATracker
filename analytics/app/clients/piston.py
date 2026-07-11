"""Piston client -- runs untrusted user code in Piston's own sandbox, never ours.

Piston (https://github.com/enginedev/piston) executes code in an isolated jail and returns
stdout/stderr/exit-code. We proxy to a Piston instance rather than run anything locally, so no
user code ever touches this service's process or the Spring backend.

The execute endpoint needs an exact runtime `version`, which drifts as the instance is upgraded.
Rather than hard-code versions, we fetch `/runtimes` once, cache it for the process lifetime, and
resolve a language (or one of its aliases) to its current version. A failed lookup or a failed run
degrades to a structured error rather than raising, matching every other client here.
"""

from __future__ import annotations

import httpx

from app.config import settings
from app.schemas import ExecuteRequest, ExecuteResult

# language/alias -> (canonical language, version). Populated on first use, kept for the process
# lifetime; a cache miss simply refetches.
_runtimes: dict[str, tuple[str, str]] = {}

# Piston needs the public class name to match the file name; the rest it can name itself.
_FILENAMES = {"java": "Main.java"}


async def _load_runtimes(client: httpx.AsyncClient) -> None:
    response = await client.get(f"{settings.piston_url}/runtimes")
    response.raise_for_status()
    table: dict[str, tuple[str, str]] = {}
    for runtime in response.json():
        language = runtime["language"]
        version = runtime["version"]
        for key in [language, *runtime.get("aliases", [])]:
            # First entry wins, which on the public instance is the newest version.
            table.setdefault(key, (language, version))
    _runtimes.clear()
    _runtimes.update(table)


async def _resolve(client: httpx.AsyncClient, language: str) -> tuple[str, str]:
    if language not in _runtimes:
        await _load_runtimes(client)
    if language not in _runtimes:
        raise KeyError(language)
    return _runtimes[language]


async def execute(request: ExecuteRequest) -> ExecuteResult:
    unsupported = ExecuteResult(ran=False, language=request.language)

    try:
        async with httpx.AsyncClient(timeout=settings.execute_timeout_seconds) as client:
            try:
                language, version = await _resolve(client, request.language)
            except KeyError:
                return unsupported.model_copy(
                    update={"error": f"unsupported language: {request.language}"}
                )

            file: dict[str, str] = {"content": request.source}
            if name := _FILENAMES.get(language):
                file["name"] = name

            response = await client.post(
                f"{settings.piston_url}/execute",
                json={
                    "language": language,
                    "version": version,
                    "files": [file],
                    "stdin": request.stdin,
                    "compile_timeout": 10_000,
                    "run_timeout": 6_000,
                },
            )
            body = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        return unsupported.model_copy(update={"error": f"{type(exc).__name__}: {exc}"})

    # A 4xx from Piston (bad payload, rate limit) carries a `message`, not a run result.
    if "run" not in body:
        return unsupported.model_copy(
            update={"error": body.get("message", "execution service rejected the request")}
        )

    run = body["run"]
    compile_stage = body.get("compile") or {}

    return ExecuteResult(
        ran=True,
        language=body.get("language", language),
        version=body.get("version", version),
        stdout=run.get("stdout", ""),
        stderr=run.get("stderr", ""),
        # A compile failure never runs, so surface its diagnostics as the error to show.
        compile_output=compile_stage.get("stderr") or None,
        exit_code=run.get("code"),
        signal=run.get("signal"),
    )
