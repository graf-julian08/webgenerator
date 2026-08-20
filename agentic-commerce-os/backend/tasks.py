"""
Agentic Commerce OS — Celery Tasks
Wraps builder agents as Celery tasks for parallel execution via Redis.
"""

from __future__ import annotations
import asyncio, json, logging
from typing import Any
from celery import Celery
from config import settings

logger = logging.getLogger("agentic.tasks")

celery_app = Celery("agentic_commerce", broker=settings.celery_broker_url, backend=settings.celery_result_backend)
celery_app.conf.update(
    task_serializer="json", result_serializer="json", accept_content=["json"],
    timezone="UTC", enable_utc=True, task_track_started=True,
    task_time_limit=600, task_soft_time_limit=540,
    worker_prefetch_multiplier=1, worker_concurrency=3,
)

def _run_async(coro):
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                return pool.submit(asyncio.run, coro).result()
        return loop.run_until_complete(coro)
    except RuntimeError:
        return asyncio.run(coro)

@celery_app.task(name="generate_nav_components", bind=True, max_retries=2)
def generate_nav_components(self, user_prompt: str, industry: str, brand_name: str, design_tokens: dict, crawler_data: dict) -> dict:
    from agents.builder_nav import run_builder_nav
    try:
        return _run_async(run_builder_nav(user_prompt, industry, brand_name, design_tokens, crawler_data))
    except Exception as exc:
        raise self.retry(exc=exc, countdown=30)

@celery_app.task(name="generate_commerce_components", bind=True, max_retries=2)
def generate_commerce_components(self, user_prompt: str, industry: str, brand_name: str, design_tokens: dict, crawler_data: dict) -> dict:
    from agents.builder_commerce import run_builder_commerce
    try:
        return _run_async(run_builder_commerce(user_prompt, industry, brand_name, design_tokens, crawler_data))
    except Exception as exc:
        raise self.retry(exc=exc, countdown=30)

@celery_app.task(name="generate_checkout_components", bind=True, max_retries=2)
def generate_checkout_components(self, user_prompt: str, industry: str, brand_name: str, design_tokens: dict, crawler_data: dict) -> dict:
    from agents.builder_checkout import run_builder_checkout
    try:
        return _run_async(run_builder_checkout(user_prompt, industry, brand_name, design_tokens, crawler_data))
    except Exception as exc:
        raise self.retry(exc=exc, countdown=30)

def run_builders_via_celery(user_prompt, industry, brand_name, design_tokens, crawler_data):
    from celery import group
    args = (user_prompt, industry, brand_name, design_tokens, crawler_data)
    job = group(generate_nav_components.s(*args), generate_commerce_components.s(*args), generate_checkout_components.s(*args))
    results = job.apply_async().get(timeout=600)
    return results[0] if len(results) > 0 else {}, results[1] if len(results) > 1 else {}, results[2] if len(results) > 2 else {}
