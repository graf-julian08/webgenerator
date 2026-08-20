"""
Node 3: BUILDER COMMERCE — Core Commerce Components
Generates: HeroSection, CatalogFilter, ProductCard, ProductGrid, ProductDetailPage
Runs as a Celery task in parallel with Nodes 2 & 4.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

import llm
from prompts import BUILDER_COMMERCE_SYSTEM, BUILDER_COMMERCE_USER_TEMPLATE

logger = logging.getLogger("agentic.builder_commerce")


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
        expected = ["HeroSection", "CatalogFilter", "ProductCard", "ProductGrid", "ProductDetailPage"]
        for i, block in enumerate(blocks):
            if i < len(expected):
                components[expected[i]] = block.strip()

    return components


async def run_builder_commerce(
    user_prompt: str,
    industry: str,
    brand_name: str,
    design_tokens: dict[str, Any],
    crawler_data: dict[str, Any],
) -> dict[str, str]:
    """Generate all core commerce components.

    Returns:
        {"HeroSection": "...", "CatalogFilter": "...", "ProductCard": "...",
         "ProductGrid": "...", "ProductDetailPage": "..."}
    """
    logger.info("Builder Commerce starting — generating 5 commerce components...")

    user_msg = BUILDER_COMMERCE_USER_TEMPLATE.format(
        design_tokens_json=json.dumps(design_tokens, indent=2, default=str),
        crawler_data_json=json.dumps(
            _compact_crawler(crawler_data), indent=2, default=str
        ),
        brand_name=brand_name,
        user_prompt=user_prompt,
        industry=industry,
    )

    raw = await llm.generate(
        system_prompt=BUILDER_COMMERCE_SYSTEM,
        user_prompt=user_msg,
        role="builder",
    )

    components = _parse_components(raw)

    expected = ["HeroSection", "CatalogFilter", "ProductCard", "ProductGrid", "ProductDetailPage"]
    for name in expected:
        if name not in components:
            logger.warning(f"Builder Commerce: Missing {name} — injecting fallback")
            components[name] = _fallback_component(name, brand_name)

    logger.info(
        f"Builder Commerce ✅ — {len(components)} components: "
        f"{', '.join(components.keys())}"
    )

    return components


def _compact_crawler(crawler_data: dict) -> dict:
    """Reduce crawler data to essential metrics for the commerce prompt."""
    sites = crawler_data.get("sites", [])
    compact = []
    for site in sites[:3]:
        compact.append({
            "domain": site.get("domain"),
            "hero": site.get("hero"),
            "spacing_ratios": site.get("spacing_ratios", {}),
            "buttons": site.get("buttons", [])[:3],
            "typography": {
                k: v for k, v in site.get("typography", {}).items()
                if k in ("h1", "h2", "body", "p")
            },
            "layouts": site.get("layout_patterns", [])[:3],
            "architecture": {
                "hero": site.get("architecture", {}).get("hero", {}),
                "sections": site.get("architecture", {}).get("sections", [])[:5],
            },
        })
    return {"sites": compact}


def _fallback_component(name: str, brand_name: str) -> str:
    """Minimal fallback component."""
    if name == "HeroSection":
        return f'''"use client";

import Image from "next/image";

export default function HeroSection() {{
  return (
    <section style={{{{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden" }}}}>
      <Image
        src="https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1920&q=80"
        alt="Hero"
        fill
        sizes="100vw"
        style={{{{ objectFit: "cover" }}}}
        priority
      />
      <div style={{{{ position: "absolute", bottom: "clamp(40px, 8vh, 120px)",
        left: "clamp(24px, 5vw, 80px)", zIndex: 2, color: "#FFFFFF" }}}}>
        <p style={{{{ fontSize: "10px", textTransform: "uppercase",
          letterSpacing: "0.2em", marginBottom: "16px",
          opacity: 0.8 }}}}>The New Collection</p>
        <h1 style={{{{ fontSize: "clamp(32px, 5vw, 64px)", fontWeight: 300,
          fontFamily: "var(--font-heading)", lineHeight: 1.1,
          margin: 0 }}}}>Discover</h1>
        <a href="#" style={{{{ display: "inline-block", marginTop: "24px",
          fontSize: "11px", textTransform: "uppercase",
          letterSpacing: "0.15em", color: "#FFFFFF",
          borderBottom: "1px solid rgba(255,255,255,0.6)",
          paddingBottom: "4px", textDecoration: "none" }}}}>Explore</a>
      </div>
    </section>
  );
}}
'''
    return f'''"use client";

export default function {name}() {{
  return (
    <section style={{{{ padding: "clamp(60px, 10vh, 120px) clamp(24px, 5vw, 80px)",
      fontFamily: "var(--font-body)" }}}}>
      <p style={{{{ fontSize: "10px", textTransform: "uppercase",
        letterSpacing: "0.2em", color: "var(--text-muted)",
        marginBottom: "24px" }}}}>{brand_name}</p>
      <h2 style={{{{ fontSize: "clamp(20px, 3vw, 36px)", fontWeight: 300,
        fontFamily: "var(--font-heading)" }}}}>{name}</h2>
    </section>
  );
}}
'''
