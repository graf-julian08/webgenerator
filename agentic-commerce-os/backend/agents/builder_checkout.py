"""
Node 4: BUILDER CHECKOUT — Checkout Flow & UI Atoms
Generates: CartDrawer, EditableCart, CheckoutSteps, FloatingInput,
           ButtonPrimary, ButtonSecondary, ButtonGhost
Runs as a Celery task in parallel with Nodes 2 & 3.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

import llm
from prompts import BUILDER_CHECKOUT_SYSTEM, BUILDER_CHECKOUT_USER_TEMPLATE

logger = logging.getLogger("agentic.builder_checkout")


def _parse_components(raw: str) -> dict[str, str]:
    """Parse ===COMPONENT:Name=== / ===END=== delimited output."""
    components = {}
    pattern = r"===COMPONENT:(\w+)===\s*\n([\s\S]*?)===END==="
    matches = re.findall(pattern, raw)

    for name, code in matches:
        cleaned = code.strip()
        md = re.match(r"```(?:tsx?|jsx?)\n([\s\S]*?)```", cleaned)
        if md:
            cleaned = md.group(1).strip()
        cleaned = re.sub(r"^```\w*\n?", "", cleaned)
        cleaned = re.sub(r"\n?```\s*$", "", cleaned)
        components[name] = cleaned

    if not matches:
        blocks = re.findall(r"```(?:tsx?|jsx?)\n([\s\S]*?)```", raw)
        expected = [
            "CartDrawer", "EditableCart", "CheckoutSteps",
            "FloatingInput", "ButtonPrimary", "ButtonSecondary", "ButtonGhost",
        ]
        for i, block in enumerate(blocks):
            if i < len(expected):
                components[expected[i]] = block.strip()

    return components


async def run_builder_checkout(
    user_prompt: str,
    industry: str,
    brand_name: str,
    design_tokens: dict[str, Any],
    crawler_data: dict[str, Any],
) -> dict[str, str]:
    """Generate all checkout and UI atom components.

    Returns:
        {"CartDrawer": "...", "EditableCart": "...", "CheckoutSteps": "...",
         "FloatingInput": "...", "ButtonPrimary": "...", "ButtonSecondary": "...",
         "ButtonGhost": "..."}
    """
    logger.info("Builder Checkout starting — generating 7 checkout/atom components...")

    user_msg = BUILDER_CHECKOUT_USER_TEMPLATE.format(
        design_tokens_json=json.dumps(design_tokens, indent=2, default=str),
        crawler_data_json=json.dumps(
            _compact_crawler(crawler_data), indent=2, default=str
        ),
        brand_name=brand_name,
        user_prompt=user_prompt,
        industry=industry,
    )

    raw = await llm.generate(
        system_prompt=BUILDER_CHECKOUT_SYSTEM,
        user_prompt=user_msg,
        role="builder",
    )

    components = _parse_components(raw)

    expected = [
        "CartDrawer", "EditableCart", "CheckoutSteps",
        "FloatingInput", "ButtonPrimary", "ButtonSecondary", "ButtonGhost",
    ]
    for name in expected:
        if name not in components:
            logger.warning(f"Builder Checkout: Missing {name} — injecting fallback")
            components[name] = _fallback_component(name)

    logger.info(
        f"Builder Checkout ✅ — {len(components)} components: "
        f"{', '.join(components.keys())}"
    )

    return components


def _compact_crawler(crawler_data: dict) -> dict:
    """Reduce crawler data for checkout prompt."""
    sites = crawler_data.get("sites", [])
    compact = []
    for site in sites[:2]:
        compact.append({
            "domain": site.get("domain"),
            "buttons": site.get("buttons", [])[:4],
            "typography": {
                k: v for k, v in site.get("typography", {}).items()
                if k in ("body", "p", "small")
            },
            "colors": {
                "backgrounds": site.get("colors", {}).get("backgrounds", [])[:4],
                "texts": site.get("colors", {}).get("texts", [])[:4],
            },
            "spacing_ratios": site.get("spacing_ratios", {}),
        })
    return {"sites": compact}


def _fallback_component(name: str) -> str:
    """Minimal fallback for checkout components."""
    return f'''"use client";

import {{ useState }} from "react";

interface {name}Props {{
  className?: string;
}}

export default function {name}({{ className = "" }}: {name}Props) {{
  const [isActive, setIsActive] = useState(false);

  return (
    <div
      className={{className}}
      style={{{{
        fontFamily: "var(--font-body)",
        fontSize: "14px",
        color: "var(--text-primary)",
        padding: "16px",
      }}}}
    >
      <span style={{{{
        fontSize: "10px",
        textTransform: "uppercase",
        letterSpacing: "0.15em",
        color: "var(--text-muted)",
      }}}}>
        {name}
      </span>
    </div>
  );
}}
'''
