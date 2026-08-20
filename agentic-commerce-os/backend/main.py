"""
Agentic Commerce OS — FastAPI Application
POST /api/generate → starts workflow, returns job_id
GET /api/stream/{job_id} → SSE endpoint streaming agent status + final output
GET /api/health → health check
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from config import settings
from models import GenerateRequest, GenerateResponse, HealthResponse

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("agentic.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Agentic Commerce OS starting...")
    logger.info(f"LLM Provider: {settings.llm_provider}")
    logger.info(f"Redis: {settings.redis_url}")
    yield
    logger.info("Agentic Commerce OS shutting down.")


app = FastAPI(
    title="Agentic Commerce OS",
    description="Multi-agent luxury e-commerce component generator",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Active workflow tasks
_active_jobs: dict[str, asyncio.Task] = {}


@app.get("/api/health", response_model=HealthResponse)
async def health():
    return HealthResponse(
        status="ok",
        version="1.0.0",
        llm_provider=settings.llm_provider,
    )


@app.post("/api/generate", response_model=GenerateResponse)
async def generate(req: GenerateRequest):
    """Start a new generation workflow."""
    job_id = str(uuid.uuid4())[:8]
    logger.info(f"New job {job_id}: prompt='{req.prompt[:60]}...', industry={req.industry}")

    # Start workflow in background
    from workflow import run_workflow

    task = asyncio.create_task(run_workflow(req.prompt, req.industry, job_id))
    _active_jobs[job_id] = task

    # Clean up when done
    def _cleanup(t):
        _active_jobs.pop(job_id, None)

    task.add_done_callback(_cleanup)

    return GenerateResponse(
        job_id=job_id,
        status="accepted",
        stream_url=f"/api/stream/{job_id}",
    )


@app.get("/api/stream/{job_id}")
async def stream(job_id: str):
    """SSE endpoint — streams agent status events in real time."""
    from workflow import get_event_queue, cleanup_queue

    queue = get_event_queue(job_id)

    async def event_generator():
        try:
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=300.0)
                except asyncio.TimeoutError:
                    yield f"event: keepalive\ndata: {{}}\n\n"
                    continue

                event_type = event.get("event", "status")
                data = json.dumps(event, default=str)
                yield f"event: {event_type}\ndata: {data}\n\n"

                if event_type == "final" or event_type == "node_error":
                    if event.get("node") == "finisher" or event_type == "final":
                        yield f"event: done\ndata: {{}}\n\n"
                        break

        finally:
            cleanup_queue(job_id)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/jobs/{job_id}/files")
async def get_job_files(job_id: str):
    """Get the generated files for a completed job."""
    import os

    base = settings.output_base_dir
    matching = [d for d in os.listdir(base) if d.startswith(f"job_{job_id}")]
    if not matching:
        raise HTTPException(404, f"No output found for job {job_id}")

    output_dir = os.path.join(base, sorted(matching)[-1])
    files = {}

    for root, _, filenames in os.walk(output_dir):
        for fname in filenames:
            filepath = os.path.join(root, fname)
            relpath = os.path.relpath(filepath, output_dir)
            with open(filepath, "r", encoding="utf-8", errors="replace") as f:
                files[relpath] = f.read()

    return {"job_id": job_id, "output_dir": output_dir, "files": files}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=True,
        log_level="info",
    )
