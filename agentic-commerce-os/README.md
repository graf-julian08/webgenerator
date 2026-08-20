# Agentic Commerce OS

**Multi-agent luxury e-commerce component generator.**

6 specialized AI agents collaborate to generate Prada/Louis Vuitton-level
e-commerce storefronts from a single text prompt.

## Architecture

```
User Prompt → FastAPI → LangGraph Workflow
                          │
                    ┌─────┴─────┐
                    │  Node 0   │  The Scout (Playwright)
                    │  Crawler  │  → Extracts layout DNA from 3 luxury sites
                    └─────┬─────┘
                    ┌─────┴─────┐
                    │  Node 1   │  The Art Director
                    │  Design   │  → Generates design tokens + tailwind config
                    └─────┬─────┘
              ┌───────────┼───────────┐
        ┌─────┴─────┐┌────┴────┐┌─────┴─────┐
        │  Node 2   ││ Node 3  ││  Node 4   │  3 Builders (PARALLEL)
        │  Nav/Glbl ││Commerce ││ Checkout  │  → 18 React components
        └─────┬─────┘└────┬────┘└─────┬─────┘
              └───────────┼───────────┘
                    ┌─────┴─────┐
                    │  Node 5   │  The Finisher
                    │  QA/Asm   │  → Cleans, wires, outputs file tree
                    └───────────┘
                          │
                    SSE Stream → Next.js Frontend
```

## Quick Start

```bash
# 1. Install dependencies
make install

# 2. Start Redis
make redis

# 3. Start Celery worker (separate terminal)
make celery

# 4. Start FastAPI backend (separate terminal)
make backend

# 5. Start Next.js frontend (separate terminal)
make frontend

# Open http://localhost:3000
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js, React, Tailwind CSS, Framer Motion, WebContainers API |
| Backend | Python, FastAPI, LangGraph, SSE |
| Workers | Celery + Redis |
| Crawler | Playwright (headless Chromium) |
| LLM | NVIDIA API (default) / Ollama (fallback) |

## Generated Components

### Node 2: Navigation & Global (6 components)
- TopBar, Header, MegaMenu, MobileDrawer, SearchOverlay, Footer

### Node 3: Core Commerce (5 components)
- HeroSection, CatalogFilter, ProductCard, ProductGrid, ProductDetailPage

### Node 4: Checkout & Atoms (7 components)
- CartDrawer, EditableCart, CheckoutSteps, FloatingInput, ButtonPrimary, ButtonSecondary, ButtonGhost

## Configuration

Copy `backend/.env` and set your API keys:

```env
LLM_PROVIDER=nvidia
NVIDIA_API_KEY=your-key-here
REDIS_URL=redis://localhost:6379/0
```

## API Endpoints

- `POST /api/generate` — Start generation (returns job_id)
- `GET /api/stream/{job_id}` — SSE stream of agent events
- `GET /api/jobs/{job_id}/files` — Get generated files
- `GET /api/health` — Health check
