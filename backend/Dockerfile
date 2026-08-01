FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app
COPY pyproject.toml README.md ./
COPY src ./src
RUN pip install --no-cache-dir .

RUN useradd --create-home appuser
USER appuser

EXPOSE 8000

# Run the unified backend as a persistent server (EC2 in dev/prod, container
# anywhere). uvicorn is already a declared dependency of the package.
CMD ["uvicorn", "rmit_society.server:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
