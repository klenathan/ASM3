FROM python:3.12-alpine AS builder

ENV UV_NO_CACHE=1 \
    UV_PYTHON_DOWNLOADS=never

WORKDIR /app
RUN pip install --no-cache-dir "uv==0.11.19"

# Cache production dependencies independently from application source changes.
COPY pyproject.toml uv.lock README.md ./
RUN uv sync --frozen --no-dev --no-install-project

COPY src ./src
RUN uv sync --frozen --no-dev --no-editable

FROM python:3.12-alpine AS runtime

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app
COPY --from=builder /app/.venv /app/.venv

RUN addgroup -S app && adduser -S -D -H -G app app
USER app

EXPOSE 8000

# Run the unified backend as a persistent ECS Fargate service.
CMD ["uvicorn", "rmit_society.server:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
