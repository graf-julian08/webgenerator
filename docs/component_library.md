# Component Library Structure

## Available Components

### Hero Components
- hero_001 to hero_015

### Navigation Components
- navbar_001 to navbar_015

### Product Grid Components
- product_grid_001 to product_grid_012

### Story/Content Components
- story_001 to story_011

### Footer Components
- footer_001 to footer_014

## Component Library Organization

Components are organized in the component_vault directory by type:

```
component_vault/
├── hero/
├── navbar/
├── product_grid/
├── story/
├── footer/
└── design_tokens.json
```

Each component type has its own directory with pre-built components that can be assembled.

## Component Properties

Each component in the library has the following properties:
1. Type: hero, navbar, product_grid, story, footer
2. File: Component file name
3. Source: Website where the component was sourced from
4. Timestamp: When the component was created
5. Chars: Character count of the component

## Design Tokens

Design tokens are stored in `component_vault/design_tokens.json` and include:
- Colors: Primary, secondary, background, surface, accent, border
- Typography: Font families, sizes, and weights
- Spacing: Consistent spacing system