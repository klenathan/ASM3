from typing import Any

from fastapi import HTTPException, status
from fastapi.concurrency import run_in_threadpool
from mangum import Mangum

from cloudpulse.analytics import (
    get_query_result,
    list_reports,
    run_analytics_task,
    start_summary_query,
)
from cloudpulse.api import create_api
from cloudpulse.models import AnalyticsRun, QueryResult, QueryStarted

app = create_api("CloudPulse analytics")


@app.post("/analytics/query", response_model=QueryStarted, status_code=status.HTTP_202_ACCEPTED)
async def query_summary() -> QueryStarted:
    return await run_in_threadpool(start_summary_query)


@app.get("/analytics/query/{query_execution_id}", response_model=QueryResult)
async def query_result(query_execution_id: str) -> QueryResult:
    return await run_in_threadpool(get_query_result, query_execution_id)


@app.post("/analytics/run", response_model=AnalyticsRun, status_code=status.HTTP_202_ACCEPTED)
async def run_container_analytics() -> AnalyticsRun:
    try:
        return await run_in_threadpool(run_analytics_task)
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@app.get("/analytics/reports", response_model=list[dict[str, Any]])
async def reports() -> list[dict[str, Any]]:
    return await run_in_threadpool(list_reports)


handler = Mangum(app, lifespan="off")
