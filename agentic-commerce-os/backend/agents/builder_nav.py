"""
Node 2: BUILDER NAV — Navigation & Global Components
Generates: TopBar, Header, MegaMenu, MobileDrawer, SearchOverlay, Footer
Runs as a Celery task in parallel with Nodes 3 & 4.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

import llm
from prompts import BUILDER_NAV_SYSTEM, BUILDER_NAV_USER_TEMPLATE

logger = logging.getLogger("agentic.builder_nav")


def _parse_components(raw: str) -> dict[str, str]:
    """Parse ===COMPONENT:Name=== / ===END=== delimited output."""
    components = {}
    pattern = r"===COMPONENT:(\w+)===\s*\n([\s\S]*?)===END==="
    matches = re.findall(pattern, raw)

    for name, code in matches:
        cleaned = code.strip()
        # Remove markdown fences if present
        md = re.match(r"```(?:tsx?|jsx?)\n([\s\S]*?)```", cleaned)
        if md:
            cleaned = md.group(1).strip()
        cleaned = re.sub(r"^```\w*\n?", "", cleaned)
        cleaned = re.sub(r"\n?```\s*$", "", cleaned)
        components[name] = cleaned

    if not matches:
        # Fallback: try to find code blocks with component names in comments
        blocks = re.findall(r"```(?:tsx?|jsx?)\n([\s\S]*?)```", raw)
        expected = ["TopBar", "Header", "MegaMenu", "MobileDrawer", "SearchOverlay", "Footer"]
        for i, block in enumerate(blocks):
            if i < len(expected):
                components[expected[i]] = block.strip()

    return components


async def run_builder_nav(
    user_prompt: str,
    industry: str,
    brand_name: str,
    design_tokens: dict[str, Any],
    crawler_data: dict[str, Any],
) -> dict[str, str]:
    """Generate all navigation/global components.

    Returns:
        {"TopBar": "...tsx...", "Header": "...", "MegaMenu": "...",
         "MobileDrawer": "...", "SearchOverlay": "...", "Footer": "..."}
    """
    logger.info("Builder Nav starting — generating 6 navigation components...")

    user_msg = BUILDER_NAV_USER_TEMPLATE.format(
        design_tokens_json=json.dumps(design_tokens, indent=2, default=str),
        crawler_data_json=json.dumps(
            _compact_crawler(crawler_data), indent=2, default=str
        ),
        brand_name=brand_name,
        user_prompt=user_prompt,
        industry=industry,
    )

    raw = await llm.generate(
        system_prompt=BUILDER_NAV_SYSTEM,
        user_prompt=user_msg,
        role="builder",
    )

    components = _parse_components(raw)

    expected = ["TopBar", "Header", "MegaMenu", "MobileDrawer", "SearchOverlay", "Footer"]
    for name in expected:
        if name not in components:
            logger.warning(f"Builder Nav: Missing {name} — injecting fallback")
            components[name] = _fallback_component(name, brand_name)

    logger.info(
        f"Builder Nav ✅ — {len(components)} components: "
        f"{', '.join(components.keys())}"
    )

    return components


def _compact_crawler(crawler_data: dict) -> dict:
    """Reduce crawler data to essential metrics for the prompt."""
    sites = crawler_data.get("sites", [])
    compact = []
    for site in sites[:3]:
        compact.append({
            "domain": site.get("domain"),
            "navigation": site.get("navigation"),
            "hero": site.get("hero"),
            "footer": site.get("footer"),
            "spacing_ratios": site.get("spacing_ratios", {}),
            "architecture": {
                "header": site.get("architecture", {}).get("header", {}),
                "footer": site.get("architecture", {}).get("footer", {}),
            },
        })
    return {"sites": compact}


def _fallback_component(name: str, brand_name: str) -> str:
    """Minimal fallback component if LLM fails to generate one."""
    return f'''"use client";

import {{ useState }} from "react";

export default function {name}() {{
  return (
    <div style={{{{ minHeight: "60px", display: "flex", alignItems: "center",
      justifyContent: "center", borderBottom: "1px solid var(--border)",
      fontFamily: "var(--font-body)", fontSize: "11px",
      letterSpacing: "0.15em", textTransform: "uppercase",
      color: "var(--text-muted)" }}}}>
      {name} — {brand_name}
    </div>
  );
}}
'''
