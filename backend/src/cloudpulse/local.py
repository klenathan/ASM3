from cloudpulse.api import create_api
from cloudpulse.handlers.analytics import app as analytics_app
from cloudpulse.handlers.observations import app as observations_app
from cloudpulse.models import utc_now

app = create_api("CloudPulse local API")
app.include_router(observations_app.router)
app.include_router(analytics_app.router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "cloudpulse", "time": utc_now()}
