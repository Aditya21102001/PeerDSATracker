"""Wandbox client -- robust public sandbox fallback for executing untrusted code.

Wandbox (https://wandbox.org) executes code in isolated containers across a vast
array of compilers without requiring API keys or local docker setups. This serves
as an automatic high-availability fallback whenever the local/Render Piston sandbox
is unreachable or restricted.
"""

from __future__ import annotations

import re
import httpx

from app.schemas import ExecuteRequest, ExecuteResult

_COMPILERS: dict[str, str] = {
    "c++": "gcc-head",
    "cpp": "gcc-head",
    "c": "gcc-13.2.0-c",
    "java": "openjdk-jdk-21+35",
    "python": "cpython-3.12.7",
    "py": "cpython-3.12.7",
    "python3": "cpython-3.12.7",
    "javascript": "nodejs-20.17.0",
    "js": "nodejs-20.17.0",
    "go": "go-1.23.2",
    "golang": "go-1.23.2",
}


async def execute(request: ExecuteRequest) -> ExecuteResult:
    canonical = request.language.lower().strip()
    compiler = _COMPILERS.get(canonical)

    if not compiler:
        return ExecuteResult(
            ran=False,
            language=request.language,
            error=f"unsupported language: {request.language}",
        )

    code = request.source or ""
    # Wandbox compiles the single Java file as prog.java; non-public class avoids file-class naming mismatch
    if canonical == "java":
        code = re.sub(r"\bpublic\s+class\b", "class", code)

    payload = {
        "compiler": compiler,
        "code": code,
        "stdin": request.stdin or "",
    }

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post("https://wandbox.org/api/compile.json", json=payload)
            resp.raise_for_status()
            data = resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        return ExecuteResult(
            ran=False,
            language=request.language,
            error=f"Wandbox execution failed: {type(exc).__name__}: {exc}",
        )

    status_str = str(data.get("status", "0"))
    try:
        exit_code = int(status_str)
    except ValueError:
        exit_code = 1

    compiler_error = data.get("compiler_error") or ""
    compiler_output = compiler_error.strip() or None

    return ExecuteResult(
        ran=True,
        language=request.language,
        version="wandbox",
        stdout=data.get("program_output", ""),
        stderr=data.get("program_error", ""),
        compile_output=compiler_output,
        exit_code=exit_code,
        signal=data.get("signal") or None,
    )
