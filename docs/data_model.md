# Data Model for Multi-Page Shop System

## Overview

The data model for the AI website builder defines the structure for storing and managing e-commerce website data.

## Core Entities

### 1. Site
Represents a complete website with the following properties:
- id: Unique identifier for the site
- name: Name of the website
- pages: Array of pages that make up the site
- components: Reusable components that can be used across pages
- metadata: Information about the site generation

### 2. Page
Represents a single page in the website:
- id: Unique identifier for the page
- title: Title of the page
- path: URL path for the page
- components: Components used on this page
- metadata: Page-specific metadata

### 3. Component
Represents a UI component:
- id: Unique identifier for the component
- type: Type of component (hero, product grid, etc.)
- content: Content of the component
- styles: Styling information for the component

## Data Flow

1. User provides prompt
2. AI processes prompt to determine site structure
3. System generates components based on prompt
4. Components are assembled into pages
5. Pages are assembled into a complete site

## Database Schema

The data model uses a simple structure:

- Sites have many Pages
- Pages have many Components
- Components are defined by type and content
- Content is structured data that can be rendered