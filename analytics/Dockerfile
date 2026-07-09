# Render has a native Python runtime, so this container is about parity rather than
# necessity: the same image runs locally and on Render, and the Python version is
# pinned here instead of in a dashboard variable.
#
# python:3.13-slim, not -alpine. uvicorn[standard] pulls uvloop and httptools, which
# are C extensions. Alpine's musl libc has no manylinux wheels, so pip would compile
# them from source and the build would crawl.
FROM python:3.13-slim

WORKDIR /app

# Dependencies first: this layer stays cached whenever only app/ changes.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Never buffer stdout, or Render's log stream lags behind the process.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

RUN useradd --create-home --shell /usr/sbin/nologin appuser && chown -R appuser /app
USER appuser

EXPOSE 8000

# Render injects PORT. Shell form expands it; exec makes uvicorn PID 1 so it receives
# SIGTERM and shuts down gracefully. --host 0.0.0.0 is required: uvicorn defaults to
# loopback, which Render cannot reach.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
