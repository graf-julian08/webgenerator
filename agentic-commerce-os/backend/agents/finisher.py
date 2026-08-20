"""
Node 5: THE FINISHER — QA & Assembly
Collects all components from Builders 2/3/4, cleans code, injects states,
assembles into a deployable file tree in an isolated output directory.
"""

from __future__ import annotations

import json
import logging
import os
import re
import time
from typing import Any

import llm
from config import settings
from prompts import FINISHER_SYSTEM, FINISHER_USER_TEMPLATE, FORBIDDEN_CLASSES

logger = logging.getLogger("agentic.finisher")


async def run_finisher(
    brand_name: str,
    design_tokens: dict[str, Any],
    nav_components: dict[str, str],
    commerce_components: dict[str, str],
    checkout_components: dict[str, str],
    job_id: str,
) -> tuple[str, dict[str, str], str]:
    """Assemble, clean, and output the final file tree.

    Returns:
        (master_view_code, component_tree_dict, output_dir_path)
    """
    logger.info("Finisher starting — QA & Assembly...")

    # ── Step 1: Clean all components ──────────────────────────
    all_components: dict[str, str] = {}
    all_components.update(nav_components)
    all_components.update(commerce_components)
    all_components.update(checkout_components)

    cleaned_components: dict[str, str] = {}
    qa_report = {
        "total_components": len(all_components),
        "generic_classes_removed": [],
        "states_injected": [],
        "warnings": [],
    }

    for name, code in all_components.items():
        cleaned, removed = _clean_component(code, name)
        cleaned = _ensure_use_client(cleaned)
        cleaned = _ensure_default_export(cleaned, name)
        cleaned_components[name] = cleaned
        qa_report["generic_classes_removed"].extend(removed)

    logger.info(
        f"Finisher: Cleaned {len(cleaned_components)} components, "
        f"removed {len(qa_report['generic_classes_removed'])} generic classes"
    )

    # ── Step 2: Generate infrastructure files ─────────────────
    tokens = design_tokens.get("tokens", design_tokens)
    colors = tokens.get("colors", {})
    typo = tokens.get("typography", {})

    globals_css = _generate_globals_css(colors, typo)
    layout_tsx = _generate_layout_tsx(brand_name)
    page_tsx = _generate_page_tsx(cleaned_components)
    tailwind_config = design_tokens.get(
        "tailwind_config", _generate_tailwind_config(tokens)
    )

    # ── Step 3: Build file tree ───────────────────────────────
    file_tree: dict[str, str] = {
        "app/globals.css": globals_css,
        "app/layout.tsx": layout_tsx,
        "app/page.tsx": page_tsx,
        "tailwind.config.js": tailwind_config,
        "postcss.config.js": 'module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } };',
        "tsconfig.json": json.dumps({
            "compilerOptions": {
                "target": "es5", "lib": ["dom", "es2017"], "jsx": "preserve",
                "module": "esnext", "moduleResolution": "bundler",
                "strict": False, "noEmit": True, "esModuleInterop": True,
                "resolveJsonModule": True, "isolatedModules": True,
                "incremental": True, "plugins": [{"name": "next"}],
                "paths": {"@/*": ["./*"]},
            },
            "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
            "exclude": ["node_modules"],
        }, indent=2),
        "next.config.js": (
            "/** @type {import('next').NextConfig} */\n"
            "module.exports = { images: { remotePatterns: "
            "[{ protocol: 'https', hostname: '**' }] } };\n"
        ),
        "package.json": json.dumps({
            "name": brand_name.lower().replace(" ", "-").replace("'", ""),
            "version": "1.0.0", "private": True,
            "scripts": {
                "dev": "next dev", "build": "next build", "start": "next start",
            },
            "dependencies": {
                "next": "^14.2.0", "react": "^18.3.0", "react-dom": "^18.3.0",
                "framer-motion": "^11.0.0",
            },
            "devDependencies": {
                "@types/node": "^20", "@types/react": "^18", "typescript": "^5",
                "tailwindcss": "^3.4", "postcss": "^8", "autoprefixer": "^10",
            },
        }, indent=2),
    }

    # Add all components
    for name, code in cleaned_components.items():
        file_tree[f"app/components/{name}.tsx"] = code

    # ── Step 4: Write to disk ─────────────────────────────────
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    output_dir = os.path.join(settings.output_base_dir, f"job_{job_id}_{timestamp}")

    for filepath, content in file_tree.items():
        full_path = os.path.join(output_dir, filepath)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        with open(full_path, "w", encoding="utf-8") as f:
            f.write(content)

    logger.info(
        f"Finisher ✅ — {len(file_tree)} files written to {output_dir}"
    )

    # ── Step 5: Build MasterView ──────────────────────────────
    master_view = page_tsx  # The page.tsx IS the master view

    return master_view, file_tree, output_dir


# ═══════════════════════════════════════════════════════════════
# CLEANING FUNCTIONS
# ═══════════════════════════════════════════════════════════════


def _clean_component(code: str, name: str) -> tuple[str, list[str]]:
    """Remove forbidden Tailwind classes and clean up code."""
    cleaned = code
    removed = []

    for forbidden in FORBIDDEN_CLASSES:
        if forbidden in cleaned:
            removed.append(f"{name}: {forbidden}")
            # Replace with empty string in className contexts
            pattern = re.compile(
                r'(?<=\s)' + re.escape(forbidden) + r'[\w-]*(?=[\s"\'])',
            )
            cleaned = pattern.sub("", cleaned)

    # Clean up doubled spaces in classNames
    cleaned = re.sub(r'className="([^"]*)"', lambda m: f'className="{" ".join(m.group(1).split())}"', cleaned)

    # Remove empty classNames
    cleaned = re.sub(r'\s*className=""\s*', " ", cleaned)

    return cleaned, removed


def _ensure_use_client(code: str) -> str:
    """Ensure 'use client' is present if component uses hooks or motion."""
    needs_client = any(
        kw in code for kw in ["useState", "useEffect", "useRef", "motion", "onClick"]
    )
    has_client = '"use client"' in code or "'use client'" in code

    if needs_client and not has_client:
        code = '"use client";\n\n' + code

    return code


def _ensure_default_export(code: str, name: str) -> str:
    """Ensure component has a default export."""
    if "export default" not in code:
        code += f"\n\nexport default function {name}() {{ return <div>{name}</div>; }}\n"
    return code


# ═══════════════════════════════════════════════════════════════
# FILE GENERATORS
# ═══════════════════════════════════════════════════════════════


def _generate_globals_css(colors: dict, typo: dict) -> str:
    heading_font = typo.get("headingFont", "Cormorant Garamond")
    body_font = typo.get("bodyFont", "Montserrat")
    h_fallback = "serif" if heading_font in (
        "Cormorant Garamond", "Playfair Display", "DM Serif Display",
        "Fraunces", "Bodoni Moda"
    ) else "sans-serif"

    return f"""@tailwind base;
@tailwind components;
@tailwind utilities;

@import url('https://fonts.googleapis.com/css2?family={heading_font.replace(" ", "+")}:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400&family={body_font.replace(" ", "+")}:wght@300;400;500;600&display=swap');

:root {{
  --bg-primary: {colors.get("bg", "#FFFFFF")};
  --bg-alt: {colors.get("bgAlt", "#FAFAFA")};
  --text-primary: {colors.get("text", "#0A0A0A")};
  --text-muted: {colors.get("textMuted", "#86868B")};
  --accent: {colors.get("accent", "#0A0A0A")};
  --border: {colors.get("border", "#E5E5E5")};
  --footer-bg: {colors.get("footerBg", "#0A0A0A")};
  --font-heading: '{heading_font}', {h_fallback};
  --font-body: '{body_font}', sans-serif;
}}

*, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}

html, body {{
  overflow-x: hidden;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: var(--font-body);
  font-size: {typo.get("bodySize", "16px")};
  line-height: {typo.get("bodyLineHeight", "1.7")};
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}}

::selection {{
  background: var(--accent);
  color: var(--bg-primary);
}}

a {{ color: inherit; text-decoration: none; }}
button {{ cursor: pointer; border: none; background: none; font: inherit; }}
img {{ max-width: 100%; height: auto; display: block; }}
"""


def _generate_layout_tsx(brand_name: str) -> str:
    safe_name = brand_name.replace("'", "\\'")
    return f"""import './globals.css';
import Header from './components/Header';
import Footer from './components/Footer';

export const metadata = {{
  title: '{safe_name}',
  description: '{safe_name} — Official Online Store',
}};

export default function RootLayout({{ children }}: {{ children: React.ReactNode }}) {{
  return (
    <html lang="en">
      <body>
        <Header />
        <main>{{children}}</main>
        <Footer />
      </body>
    </html>
  );
}}
"""


def _generate_page_tsx(components: dict[str, str]) -> str:
    """Generate page.tsx importing all section components."""
    # Determine which components go in the main page
    # Header and Footer are in layout.tsx
    exclude = {"Header", "Footer", "TopBar", "MegaMenu", "MobileDrawer",
               "SearchOverlay", "CartDrawer", "EditableCart", "CheckoutSteps",
               "FloatingInput", "ButtonPrimary", "ButtonSecondary", "ButtonGhost"}

    page_components = [
        name for name in components.keys() if name not in exclude
    ]

    # Ensure HeroSection is first
    if "HeroSection" in page_components:
        page_components.remove("HeroSection")
        page_components.insert(0, "HeroSection")

    imports = "\n".join(
        f"import {name} from './components/{name}';"
        for name in page_components
    )

    renders = "\n      ".join(f"<{name} />" for name in page_components)

    return f"""{imports}

export default function Home() {{
  return (
    <>
      {renders}
    </>
  );
}}
"""


def _generate_tailwind_config(tokens: dict) -> str:
    colors = tokens.get("colors", {})
    typo = tokens.get("typography", {})

    return f"""/** @type {{import('tailwindcss').Config}} */
module.exports = {{
  content: ['./app/**/*.{{ts,tsx}}'],
  theme: {{
    extend: {{
      colors: {{
        bg: '{colors.get("bg", "#FFFFFF")}',
        'bg-alt': '{colors.get("bgAlt", "#FAFAFA")}',
        text: '{colors.get("text", "#0A0A0A")}',
        'text-muted': '{colors.get("textMuted", "#86868B")}',
        accent: '{colors.get("accent", "#0A0A0A")}',
        border: '{colors.get("border", "#E5E5E5")}',
      }},
      fontFamily: {{
        heading: ['var(--font-heading)'],
        body: ['var(--font-body)'],
      }},
    }},
  }},
  plugins: [],
}};
"""
