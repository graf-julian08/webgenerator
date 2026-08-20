# AI Website Builder Architecture

## System Overview

The AI Website Builder is a Next.js-based system that generates high-end e-commerce websites with 20+ pages. It uses a component-based approach with a template engine to dynamically generate websites based on user prompts.

## Core Components

1. **Component Library** - Pre-built, reusable UI components organized by type
2. **Template Engine** - Dynamic layout system that assembles components
3. **Design System** - Consistent design tokens for colors, typography, and spacing
4. **Prompt Pipeline** - System that translates user prompts into websites
5. **Quality Control** - Mechanisms to ensure high-end design standards

## Architecture Layers

### 1. Data Layer
- Component Vault (pre-built components)
- Design Tokens (colors, typography, spacing)
- Content Management (product data, page structure)

### 2. Logic Layer
- Template Engine (assembles components into pages)
- Layout System (grid management, responsive design)
- Quality Control (ensures design standards)

### 3. Presentation Layer
- Component Library (React components)
- Page Renderer (assembles pages from components)
- Responsive Framework (TailwindCSS-based)

## Workflow

1. User provides a prompt describing desired website
2. AI processes prompt and selects appropriate components
3. Template engine assembles components into layout
4. Quality control ensures design standards
5. Website is generated and deployed

## Technical Stack

- **Frontend**: Next.js, React, TailwindCSS
- **Backend**: Optional Supabase for data persistence
- **AI Integration**: Kimi API for content generation
- **Animation**: Framer Motion for smooth transitions
- **Quality Control**: Anti-slop detection and enforcement

## File Structure

```
webgenerator/
├── component_vault/          # Pre-built components
├── generated-site/           # Output website
│   ├── app/                   # Next.js app directory
│   │   ├── components/       # UI components
│   │   ├── pages/             # Generated pages
│   │   └── lib/                # Utility functions
├── data/                      # Scraped website data
└── docs/                     # Documentation