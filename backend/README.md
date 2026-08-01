# CloudPulse backend

FastAPI applications run locally through Uvicorn and deploy through Mangum as separate AWS Lambda handlers.

```sh
uv sync
uv run uvicorn cloudpulse.handlers.observations:app --reload --app-dir src --port 8000
```

Lambda entry points:

- `cloudpulse.handlers.health.handler`
- `cloudpulse.handlers.observations.handler`
- `cloudpulse.handlers.analytics.handler`

ECS worker entry point: `python -m cloudpulse.worker`.
