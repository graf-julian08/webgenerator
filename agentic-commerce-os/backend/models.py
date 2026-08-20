"""
Agentic Commerce OS — State Models
LangGraph AgentState + Pydantic request/response models.
"""

from __future__ import annotations

import time
import uuid
from typing import Any, Optional

from pydantic import BaseModel, Field
from typing_extensions import TypedDict


# ═══════════════════════════════════════════════════════════════
# LANGGRAPH AGENT STATE — Flows between all 6 nodes
# ═══════════════════════════════════════════════════════════════


class AgentState(TypedDict, total=False):
    """Shared state that flows through the LangGraph workflow.

    Every node reads and writes to this dict. LangGraph merges updates
    via the reducer (default: last-write-wins for each key).
    """

    # ── Input (set once at start) ─────────────────────────────
    job_id: str
    user_prompt: str
    industry: str
    timestamp: str

    # ── Node 0: Scout output ──────────────────────────────────
    crawler_data: dict[str, Any]
    # Structure:
    # {
    #   "sites": [
    #     {
    #       "url": str,
    #       "domain": str,
    #       "typography": { "h1": {...}, "h2": {...}, "body": {...}, ... },
    #       "colors": { "backgrounds": [...], "texts": [...], "borders": [...] },
    #       "buttons": [...],
    #       "navigation": {...},
    #       "hero": {...},
    #       "layout_patterns": [...],
    #       "footer": {...},
    #       "architecture": {
    #         "header": {...}, "hero": {...}, "sections": [...],
    #         "footer": {...}, "metrics": {...}
    #       },
    #       "spacing_ratios": {
    #         "section_padding_to_viewport": float,
    #         "h1_to_body_ratio": float,
    #         "grid_gutter_px": int,
    #         "margin_multiplier": float,
    #       }
    #     }
    #   ]
    # }

    # ── Node 1: Art Director output ───────────────────────────
    design_tokens: dict[str, Any]
    # Structure:
    # {
    #   "tailwind_config": str,          # Complete tailwind.config.js content
    #   "tokens": {
    #     "colors": { "bg": str, "bgAlt": str, "text": str, ... },
    #     "typography": { "headingFont": str, "bodyFont": str, ... },
    #     "spacing": { ... },
    #     "borders": { ... },
    #   },
    #   "personality": str,
    #   "layout_dna": str,
    # }

    # ── Node 2: Builder Nav output ────────────────────────────
    nav_components: dict[str, str]
    # { "Header": "..tsx code..", "MegaMenu": "...", "MobileDrawer": "...",
    #   "SearchOverlay": "...", "Footer": "...", "TopBar": "..." }

    # ── Node 3: Builder Commerce output ───────────────────────
    commerce_components: dict[str, str]
    # { "HeroSection": "...", "CatalogFilter": "...", "ProductCard": "...",
    #   "ProductGrid": "...", "ProductDetailPage": "..." }

    # ── Node 4: Builder Checkout output ───────────────────────
    checkout_components: dict[str, str]
    # { "CartDrawer": "...", "EditableCart": "...", "CheckoutSteps": "...",
    #   "FloatingInput": "...", "ButtonPrimary": "...", "ButtonSecondary": "...",
    #   "ButtonGhost": "..." }

    # ── Node 5: Finisher output ───────────────────────────────
    master_view: str  # The assembled MasterView.jsx
    component_tree: dict[str, str]  # All individual component files
    output_dir: str  # Path to the generated output directory

    # ── Telemetry & Logging ───────────────────────────────────
    status_log: list[dict[str, Any]]
    # [ { "node": str, "status": "running"|"done"|"error",
    #     "message": str, "timestamp": float, "tokens_used": int } ]
    errors: list[str]
    total_tokens: int


# ═══════════════════════════════════════════════════════════════
# API REQUEST / RESPONSE MODELS
# ═══════════════════════════════════════════════════════════════


class GenerateRequest(BaseModel):
    """POST /api/generate request body."""

    prompt: str = Field(
        ...,
        min_length=3,
        max_length=2000,
        description="User prompt describing the shop to generate.",
        json_schema_extra={"examples": ["Auto-Shop für Elektro-Marke"]},
    )
    industry: str = Field(
        default="fashion",
        description="Industry vertical.",
        json_schema_extra={
            "examples": [
                "fashion",
                "automotive",
                "technology",
                "beauty",
                "furniture",
                "watches",
                "jewelry",
            ]
        },
    )


class GenerateResponse(BaseModel):
    """POST /api/generate response."""

    job_id: str
    status: str = "accepted"
    stream_url: str


class StatusEvent(BaseModel):
    """Single SSE event pushed to the frontend."""

    event: str  # "node_start", "node_progress", "node_done", "node_error", "final"
    node: str  # "scout", "art_director", "builder_nav", etc.
    message: str
    timestamp: float = Field(default_factory=time.time)
    data: Optional[dict[str, Any]] = None
    tokens_used: int = 0


class HealthResponse(BaseModel):
    status: str = "ok"
    version: str = "1.0.0"
    llm_provider: str = "nvidia"
