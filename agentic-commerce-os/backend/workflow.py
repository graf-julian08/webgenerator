"""
Agentic Commerce OS — LangGraph Workflow
6-node state graph: Scout → Art Director → [Builders ×3 parallel] → Finisher
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
import uuid
from typing import Any

from langgraph.graph import StateGraph, END

from config import settings
from models import AgentState

logger = logging.getLogger("agentic.workflow")


# ═══════════════════════════════════════════════════════════════
# STATUS HELPER — Push events to the SSE queue
# ═══════════════════════════════════════════════════════════════

# Global dict of job_id → asyncio.Queue for SSE streaming
_event_queues: dict[str, asyncio.Queue] = {}


def get_event_queue(job_id: str) -> asyncio.Queue:
    """Get or create the SSE event queue for a job."""
    if job_id not in _event_queues:
        _event_queues[job_id] = asyncio.Queue()
    return _event_queues[job_id]


def cleanup_queue(job_id: str) -> None:
    """Remove event queue after job completes."""
    _event_queues.pop(job_id, None)


async def _push_event(
    job_id: str, event: str, node: str, message: str,
    data: dict | None = None, tokens: int = 0,
) -> None:
    """Push a status event to the SSE queue."""
    q = get_event_queue(job_id)
    await q.put({
        "event": event,
        "node": node,
        "message": message,
        "timestamp": time.time(),
        "data": data,
        "tokens_used": tokens,
    })


def _add_log(state: dict, node: str, status: str, message: str) -> list:
    """Append to the status log in state."""
    log = list(state.get("status_log", []))
    log.append({
        "node": node, "status": status,
        "message": message, "timestamp": time.time(),
    })
    return log


# ═══════════════════════════════════════════════════════════════
# NODE FUNCTIONS
# ═══════════════════════════════════════════════════════════════


async def node_scout(state: AgentState) -> dict:
    """Node 0: The Scout — Playwright crawler."""
    from agents.scout import run_scout

    job_id = state["job_id"]
    industry = state["industry"]

    await _push_event(job_id, "node_start", "scout", "Crawling reference sites...")

    urls = settings.get_scout_urls(industry)
    logger.info(f"Scout: Crawling {len(urls)} URLs for industry '{industry}'")

    try:
        crawler_data = await run_scout(urls)
        site_count = len(crawler_data.get("sites", []))

        await _push_event(
            job_id, "node_done", "scout",
            f"Extracted design DNA from {site_count} sites",
            data={"site_count": site_count},
        )

        return {
            "crawler_data": crawler_data,
            "status_log": _add_log(state, "scout", "done", f"Extracted {site_count} sites"),
        }

    except Exception as e:
        logger.error(f"Scout failed: {e}")
        await _push_event(job_id, "node_error", "scout", str(e))
        return {
            "crawler_data": {"sites": []},
            "errors": list(state.get("errors", [])) + [f"Scout: {e}"],
            "status_log": _add_log(state, "scout", "error", str(e)),
        }


async def node_art_director(state: AgentState) -> dict:
    """Node 1: The Art Director — Design system generator."""
    from agents.art_director import run_art_director

    job_id = state["job_id"]
    await _push_event(job_id, "node_start", "art_director", "Synthesizing design system...")

    try:
        design_tokens = await run_art_director(
            user_prompt=state["user_prompt"],
            industry=state["industry"],
            crawler_data=state["crawler_data"],
        )

        personality = design_tokens.get("personality", "unknown")
        heading_font = design_tokens.get("tokens", {}).get("typography", {}).get("headingFont", "N/A")

        await _push_event(
            job_id, "node_done", "art_director",
            f"Design system ready — {personality}, {heading_font}",
            data={"personality": personality, "heading_font": heading_font},
        )

        return {
            "design_tokens": design_tokens,
            "status_log": _add_log(state, "art_director", "done", f"{personality}"),
        }

    except Exception as e:
        logger.error(f"Art Director failed: {e}")
        await _push_event(job_id, "node_error", "art_director", str(e))

        from agents.art_director import _fallback_design_system
        return {
            "design_tokens": _fallback_design_system(state["industry"]),
            "errors": list(state.get("errors", [])) + [f"Art Director: {e}"],
            "status_log": _add_log(state, "art_director", "error", str(e)),
        }


async def node_builders_parallel(state: AgentState) -> dict:
    """Nodes 2, 3, 4: Three builders running in parallel.

    Uses asyncio.gather for true parallel execution.
    When Celery is available, these become Celery tasks instead.
    """
    from agents.builder_nav import run_builder_nav
    from agents.builder_commerce import run_builder_commerce
    from agents.builder_checkout import run_builder_checkout

    job_id = state["job_id"]
    user_prompt = state["user_prompt"]
    industry = state["industry"]
    design_tokens = state["design_tokens"]
    crawler_data = state["crawler_data"]

    # Extract brand name from prompt
    brand_match = re.search(
        r"(?:Brand\s*Name|Name)\s*[:\s]+\s*([A-ZÀ-ÿ][A-Za-zÀ-ÿéèêë\s&'.]+)", user_prompt, re.I
    )
    brand_name = (
        brand_match.group(1).strip() if brand_match
        else industry.capitalize() + " Atelier"
    )

    await _push_event(
        job_id, "node_start", "builders",
        "3 Builder agents working in parallel...",
    )

    # Run all 3 builders concurrently
    nav_task = run_builder_nav(user_prompt, industry, brand_name, design_tokens, crawler_data)
    commerce_task = run_builder_commerce(user_prompt, industry, brand_name, design_tokens, crawler_data)
    checkout_task = run_builder_checkout(user_prompt, industry, brand_name, design_tokens, crawler_data)

    results = await asyncio.gather(nav_task, commerce_task, checkout_task, return_exceptions=True)

    nav_components = results[0] if not isinstance(results[0], Exception) else {}
    commerce_components = results[1] if not isinstance(results[1], Exception) else {}
    checkout_components = results[2] if not isinstance(results[2], Exception) else {}

    errors = list(state.get("errors", []))
    for i, (name, res) in enumerate(zip(
        ["builder_nav", "builder_commerce", "builder_checkout"], results
    )):
        if isinstance(res, Exception):
            errors.append(f"{name}: {res}")
            await _push_event(job_id, "node_error", name, str(res))
        else:
            count = len(res)
            await _push_event(
                job_id, "node_done", name,
                f"{count} components generated",
                data={"component_count": count, "components": list(res.keys())},
            )

    total = len(nav_components) + len(commerce_components) + len(checkout_components)
    await _push_event(
        job_id, "node_done", "builders",
        f"All builders complete — {total} total components",
    )

    log = _add_log(state, "builders", "done", f"{total} components")

    return {
        "nav_components": nav_components,
        "commerce_components": commerce_components,
        "checkout_components": checkout_components,
        "errors": errors,
        "status_log": log,
    }


async def node_finisher(state: AgentState) -> dict:
    """Node 5: The Finisher — QA & Assembly."""
    from agents.finisher import run_finisher

    job_id = state["job_id"]
    await _push_event(job_id, "node_start", "finisher", "Assembling & QA...")

    # Extract brand name
    user_prompt = state["user_prompt"]
    industry = state["industry"]
    brand_match = re.search(
        r"(?:Brand\s*Name|Name)\s*[:\s]+\s*([A-ZÀ-ÿ][A-Za-zÀ-ÿéèêë\s&'.]+)", user_prompt, re.I
    )
    brand_name = (
        brand_match.group(1).strip() if brand_match
        else industry.capitalize() + " Atelier"
    )

    try:
        master_view, component_tree, output_dir = await run_finisher(
            brand_name=brand_name,
            design_tokens=state["design_tokens"],
            nav_components=state.get("nav_components", {}),
            commerce_components=state.get("commerce_components", {}),
            checkout_components=state.get("checkout_components", {}),
            job_id=job_id,
        )

        file_count = len(component_tree)
        await _push_event(
            job_id, "final", "finisher",
            f"Complete! {file_count} files generated",
            data={
                "output_dir": output_dir,
                "file_count": file_count,
                "files": list(component_tree.keys()),
                "master_view": master_view,
            },
        )

        from llm import token_usage
        return {
            "master_view": master_view,
            "component_tree": component_tree,
            "output_dir": output_dir,
            "total_tokens": token_usage.total,
            "status_log": _add_log(state, "finisher", "done", f"{file_count} files"),
        }

    except Exception as e:
        logger.error(f"Finisher failed: {e}")
        await _push_event(job_id, "node_error", "finisher", str(e))
        return {
            "errors": list(state.get("errors", [])) + [f"Finisher: {e}"],
            "status_log": _add_log(state, "finisher", "error", str(e)),
        }


# ═══════════════════════════════════════════════════════════════
# BUILD THE GRAPH
# ═══════════════════════════════════════════════════════════════


def build_workflow() -> StateGraph:
    """Construct the LangGraph state graph with 4 sequential steps.

    Flow: scout → art_director → builders_parallel → finisher → END
    """
    graph = StateGraph(AgentState)

    # Add nodes
    graph.add_node("scout", node_scout)
    graph.add_node("art_director", node_art_director)
    graph.add_node("builders", node_builders_parallel)
    graph.add_node("finisher", node_finisher)

    # Define edges (sequential flow)
    graph.set_entry_point("scout")
    graph.add_edge("scout", "art_director")
    graph.add_edge("art_director", "builders")
    graph.add_edge("builders", "finisher")
    graph.add_edge("finisher", END)

    return graph.compile()


# Pre-compile the workflow
workflow = build_workflow()


async def run_workflow(user_prompt: str, industry: str, job_id: str) -> AgentState:
    """Execute the full 6-node workflow."""
    initial_state: AgentState = {
        "job_id": job_id,
        "user_prompt": user_prompt,
        "industry": industry,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "crawler_data": {},
        "design_tokens": {},
        "nav_components": {},
        "commerce_components": {},
        "checkout_components": {},
        "master_view": "",
        "component_tree": {},
        "output_dir": "",
        "status_log": [],
        "errors": [],
        "total_tokens": 0,
    }

    logger.info(f"Workflow starting — job {job_id}")
    result = await workflow.ainvoke(initial_state)
    logger.info(f"Workflow complete — job {job_id}")

    return result
