"""
Node 1: THE ART DIRECTOR — Design System Generator
Takes user prompt + crawler DNA → produces design tokens + tailwind config.
"""

from __future__ import annotations

import json
import logging
from typing import Any

import llm
from prompts import ART_DIRECTOR_SYSTEM, ART_DIRECTOR_USER_TEMPLATE

logger = logging.getLogger("agentic.art_director")


async def run_art_director(
    user_prompt: str,
    industry: str,
    crawler_data: dict[str, Any],
) -> dict[str, Any]:
    """Generate design tokens from crawler DNA + user prompt.

    Returns:
        {
            "tailwind_config": str,
            "tokens": { colors, typography, spacing, borders },
            "personality": str,
            "layout_dna": str,
            "micro_details": [str, ...],
        }
    """
    logger.info("Art Director starting — synthesizing design system...")

    # Format crawler data for the prompt (compact, key metrics only)
    crawler_summary = _format_crawler_for_prompt(crawler_data)

    user_msg = ART_DIRECTOR_USER_TEMPLATE.format(
        user_prompt=user_prompt,
        industry=industry,
        crawler_data_json=crawler_summary,
    )

    raw = await llm.generate(
        system_prompt=ART_DIRECTOR_SYSTEM,
        user_prompt=user_msg,
        role="blueprint",
    )

    try:
        result = llm.extract_json(raw)
    except ValueError:
        logger.warning("Art Director JSON parse failed — using fallback design system")
        result = _fallback_design_system(industry)

    # Validate required fields
    if "tokens" not in result:
        result["tokens"] = _fallback_design_system(industry)["tokens"]
    if "tailwind_config" not in result:
        result["tailwind_config"] = _generate_tailwind_config(result["tokens"])

    logger.info(
        f"Art Director ✅ — personality: {result.get('personality', 'N/A')}, "
        f"heading font: {result.get('tokens', {}).get('typography', {}).get('headingFont', 'N/A')}"
    )

    return result


def _format_crawler_for_prompt(crawler_data: dict) -> str:
    """Format crawler data as compact JSON for the LLM prompt."""
    sites = crawler_data.get("sites", [])
    summaries = []

    for site in sites[:3]:
        summary = {
            "domain": site.get("domain", "unknown"),
            "typography": {},
            "colors": {
                "backgrounds": site.get("colors", {}).get("backgrounds", [])[:6],
                "texts": site.get("colors", {}).get("texts", [])[:6],
            },
            "spacing_ratios": site.get("spacing_ratios", {}),
            "navigation": site.get("navigation"),
            "hero": site.get("hero"),
            "footer": site.get("footer"),
            "buttons": site.get("buttons", [])[:3],
            "fonts": site.get("fonts", [])[:6],
            "layouts": site.get("layout_patterns", [])[:4],
            "architecture": {
                "header": site.get("architecture", {}).get("header", {}),
                "hero": site.get("architecture", {}).get("hero", {}),
                "footer": site.get("architecture", {}).get("footer", {}),
            },
        }

        # Add typography if available
        for tag in ["h1", "h2", "h3", "body", "p", "a"]:
            if tag in site.get("typography", {}):
                summary["typography"][tag] = site["typography"][tag]

        summaries.append(summary)

    return json.dumps(summaries, indent=2, default=str)


def _generate_tailwind_config(tokens: dict) -> str:
    """Generate tailwind.config.js from tokens."""
    colors = tokens.get("colors", {})
    typo = tokens.get("typography", {})
    spacing = tokens.get("spacing", {})

    return f"""/** @type {{import('tailwindcss').Config}} */
module.exports = {{
  content: ['./app/**/*.{{ts,tsx}}', './components/**/*.{{ts,tsx}}'],
  theme: {{
    extend: {{
      colors: {{
        bg: '{colors.get("bg", "#FFFFFF")}',
        'bg-alt': '{colors.get("bgAlt", "#FAFAFA")}',
        text: '{colors.get("text", "#0A0A0A")}',
        'text-muted': '{colors.get("textMuted", "#86868B")}',
        accent: '{colors.get("accent", "#0A0A0A")}',
        border: '{colors.get("border", "#E5E5E5")}',
        'footer-bg': '{colors.get("footerBg", "#0A0A0A")}',
      }},
      fontFamily: {{
        heading: ['{typo.get("headingFont", "Cormorant Garamond")}', 'serif'],
        body: ['{typo.get("bodyFont", "Montserrat")}', 'sans-serif'],
      }},
      spacing: {{
        'section': '{spacing.get("sectionPadding", "clamp(80px, 12vh, 160px)")}',
        'gutter': '{spacing.get("gridGutter", "24px")}',
      }},
    }},
  }},
  plugins: [],
}};"""


def _fallback_design_system(industry: str) -> dict:
    """Hardcoded fallback if LLM fails."""
    return {
        "tailwind_config": _generate_tailwind_config({
            "colors": {"bg": "#FFFFFF", "bgAlt": "#FAFAFA", "text": "#0A0A0A",
                       "textMuted": "#86868B", "accent": "#0A0A0A", "border": "#E5E5E5",
                       "footerBg": "#0A0A0A"},
            "typography": {"headingFont": "Cormorant Garamond", "bodyFont": "Montserrat"},
            "spacing": {"sectionPadding": "clamp(80px, 12vh, 160px)", "gridGutter": "24px"},
        }),
        "tokens": {
            "colors": {
                "bg": "#FFFFFF", "bgAlt": "#FAFAFA", "text": "#0A0A0A",
                "textMuted": "#86868B", "accent": "#0A0A0A", "border": "#E5E5E5",
                "footerBg": "#0A0A0A",
            },
            "typography": {
                "headingFont": "Cormorant Garamond", "bodyFont": "Montserrat",
                "h1Size": "clamp(32px, 5vw, 64px)", "h2Size": "clamp(24px, 3vw, 42px)",
                "bodySize": "16px", "labelSize": "10px",
                "headingWeight": "300", "headingTracking": "-0.02em",
                "labelTracking": "0.2em", "bodyLineHeight": "1.7",
            },
            "spacing": {
                "sectionPadding": "clamp(80px, 12vh, 160px)",
                "gridGutter": "24px", "containerMaxWidth": "1440px",
                "headerHeight": "64px",
            },
            "borders": {
                "radius": "0px", "width": "1px", "separatorOpacity": "0.15",
            },
        },
        "personality": "silent-authority",
        "layout_dna": "Asymmetric with radical whitespace, text overlays on images",
        "micro_details": [
            "Add 'Est. 2026' micro-copy next to logo in 8px uppercase tracking 0.3em",
            "Use 1px hairline separators at 15% opacity between sections",
            "Blend font weights in headlines: regular + italic for emphasis",
            "Section numbering (01, 02, 03) in 8px margin text",
            "Hover: sibling nav items dim to opacity 0.4",
        ],
    }
