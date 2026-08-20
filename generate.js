import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const sqlite3 = require('sqlite3');
import { open } from 'sqlite';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';
import dotenv from 'dotenv';
import { callQwenBlueprint } from './multi_model_strategy.js';
import { fetchIndustryImages, fetchIndustryVideo } from './fetch_media.js';
import { fetchGithubDesignSystems } from './fetch_github_systems.js';

dotenv.config();


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DB_PATH = join(__dirname, 'design_references.sqlite');
const DATA_DIR = join(__dirname, 'data', 'sites');

// ─── Screenshot Loader für multimodale API ─────────────────────
async function loadScreenshots(references, maxScreenshots = 3) {
    const screenshots = [];
    for (const ref of references.slice(0, maxScreenshots)) {
        try {
            const screenshotPath = join(DATA_DIR, ref.domain, 'screenshot.webp');
            const buffer = await fs.readFile(screenshotPath);
            const base64 = buffer.toString('base64');
            screenshots.push({
                domain: ref.domain,
                base64,
                mimeType: 'image/webp',
            });
        } catch (_) {
            // Screenshot nicht vorhanden — skip
        }
    }
    return screenshots;
}

// ─── DB Connection (Singleton) ─────────────────────────────────
let _db = null;
async function getDb() {
    if (!_db) {
        _db = await open({ filename: DB_PATH, driver: sqlite3.Database });
        await _db.exec('PRAGMA journal_mode = WAL');
    }
    return _db;
}

// ═══════════════════════════════════════════════════════════════
// WEB SEARCH — Live Design-Trend-Recherche via Tavily API
// ═══════════════════════════════════════════════════════════════

const TAVILY_API_KEY = process.env.TAVILY_API_KEY || '';

async function searchDesignTrends(industry) {
    if (!TAVILY_API_KEY) {
        console.log('   ⚠️  Kein TAVILY_API_KEY gesetzt – überspringe Live-Recherche.');
        return null;
    }

    const queries = [
        `best ${industry} website design awwwards site of the day 2025 2026`,
        `${industry} luxury website layout trends editorial design inspiration`,
    ];

    const allResults = [];

    for (const query of queries) {
        try {
            const res = await fetch('https://api.tavily.com/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    api_key: TAVILY_API_KEY,
                    query,
                    search_depth: 'basic',
                    max_results: 5,
                    include_answer: true,
                    include_domains: [
                        'awwwards.com', 'siteinspire.com', 'thefwa.com',
                        'cssdesignawards.com', 'bestwebsite.gallery',
                        'mindsparklemag.com', 'webdesignclip.com'
                    ],
                }),
            });

            if (!res.ok) {
                console.log(`   ⚠️  Tavily-Fehler (${res.status}) für: "${query.slice(0, 50)}..."`);
                continue;
            }

            const data = await res.json();

            if (data.answer) {
                allResults.push({ type: 'summary', content: data.answer, query });
            }

            if (data.results) {
                for (const r of data.results.slice(0, 3)) {
                    allResults.push({
                        type: 'result',
                        title: r.title,
                        url: r.url,
                        content: (r.content || '').slice(0, 300),
                    });
                }
            }
        } catch (err) {
            console.log(`   ⚠️  Tavily-Netzwerkfehler: ${err.message}`);
        }
    }

    return allResults.length > 0 ? allResults : null;
}

function formatTrendResults(results) {
    if (!results || results.length === 0) return '';

    const summaries = results.filter(r => r.type === 'summary');
    const sites = results.filter(r => r.type === 'result');

    let out = `\n══════════════════════════════════════════════════════════════
LIVE DESIGN-RECHERCHE (Awwwards, SiteInspire, FWA — ${new Date().toISOString().split('T')[0]})
══════════════════════════════════════════════════════════════\n`;

    if (summaries.length > 0) {
        out += `\nAKTUELLE TRENDS:\n`;
        for (const s of summaries) {
            out += `${s.content}\n\n`;
        }
    }

    if (sites.length > 0) {
        out += `AWARD-WINNING REFERENZEN:\n`;
        for (const s of sites) {
            out += `  • ${s.title} (${s.url})\n    ${s.content}\n\n`;
        }
    }

    out += `INSTRUKTION: Nutze diese aktuellen Trends als zusätzliche Inspiration.
Die oben genannten Award-Websites zeigen, was gerade als best-in-class gilt.
Adaptiere deren Layout-Prinzipien und Design-Sprache für den User-Request.\n`;

    return out;
}

// ═══════════════════════════════════════════════════════════════
// 1. SMART RETRIEVAL — SQLite Design Tokens
// ═══════════════════════════════════════════════════════════════

async function getReferences(industryOrTag, limit = 5) {
    const db = await getDb();
    const term = `%${industryOrTag}%`;

    const references = await db.all(`
        SELECT 
            s.id, s.domain, s.title, s.description, s.industry,
            s.style_tags, s.quality_score, s.tokens_json,
            s.markdown_content, s.screenshot_path,
            (CASE WHEN s.industry LIKE ? THEN 50 ELSE 0 END) +
            (CASE WHEN s.style_tags LIKE ? THEN 30 ELSE 0 END) +
            s.quality_score AS relevance
        FROM sites s
        WHERE s.industry LIKE ? OR s.style_tags LIKE ?
        ORDER BY relevance DESC, s.quality_score DESC
        LIMIT ?
    `, [term, term, term, term, limit]);

    for (const ref of references) {
        ref.typography = await db.all(
            'SELECT element, font_family, font_size, font_weight, line_height, letter_spacing, color, text_transform FROM typography WHERE site_id = ?',
            [ref.id]
        );
        ref.colors = await db.all(
            'SELECT role, value FROM colors WHERE site_id = ?',
            [ref.id]
        );
        ref.buttons = await db.all(
            'SELECT label, background_color, color, padding, border_radius, border, box_shadow, font_family, font_size, font_weight, text_transform, letter_spacing FROM buttons WHERE site_id = ?',
            [ref.id]
        );
        ref.fontsList = await db.all(
            'SELECT DISTINCT family, weight, style FROM fonts WHERE site_id = ?',
            [ref.id]
        );
        ref.nav = await db.get('SELECT * FROM navigation WHERE site_id = ?', [ref.id]);
        ref.heroData = await db.get('SELECT * FROM hero WHERE site_id = ?', [ref.id]);
        ref.footerData = await db.get('SELECT * FROM footer WHERE site_id = ?', [ref.id]);
        ref.layouts = await db.all(
            'SELECT display, grid_template_columns, flex_direction, gap, max_width, align_items, justify_content FROM layout_patterns WHERE site_id = ?',
            [ref.id]
        );
        ref.architecture = await db.get(
            'SELECT header_type, header_is_transparent, header_logo_position, header_has_hamburger, hero_type, hero_is_fullscreen, hero_has_video, hero_text_position, hero_headline_words, hero_cta_count, section_order, section_count, footer_type, footer_is_dark, footer_column_count, footer_has_newsletter, footer_has_social FROM page_architecture WHERE site_id = ?',
            [ref.id]
        );
        ref.sections = await db.all(
            'SELECT section_index, section_type, height_vh, image_count, card_count FROM page_sections WHERE site_id = ? ORDER BY section_index',
            [ref.id]
        );
    }

    return references;
}

// ═══════════════════════════════════════════════════════════════
// 2. TOKEN FORMATTER
// ═══════════════════════════════════════════════════════════════

function formatReference(ref, index) {
    const colors = ref.colors || [];
    const bgColors = colors.filter(c => c.role === 'background').map(c => c.value);
    const textColors = colors.filter(c => c.role === 'text').map(c => c.value);
    const borderColors = colors.filter(c => c.role === 'border').map(c => c.value);

    const typoMap = {};
    if (ref.typography) {
        for (const t of ref.typography) typoMap[t.element] = t;
    }

    const buttons = ref.buttons || [];
    const primaryBtn = buttons.find(b => b.label && b.label.trim().length > 0 && b.label.trim().length < 30) || buttons[0] || { label: 'Explore' };
    const secondaryBtn = buttons.find(b => b !== primaryBtn && b.label?.trim().length > 0) || null;

    const contentPreview = (ref.markdown_content || '')
        .replace(/!\[.*?\]\(.*?\)/g, '[IMAGE]')
        .replace(/\[.*?\]\(.*?\)/g, (match) => match.replace(/\(.*?\)/, ''))
        .slice(0, 600)
        .trim();

    return `
━━━ REFERENZ ${index + 1}: ${ref.domain} ━━━━━━━━━━━━━━━━━━━━━━━
Qualität: ${ref.quality_score}/100 | Industrie: ${ref.industry} | Tags: ${ref.style_tags}
Titel: ${ref.title}

FARBPALETTE:
  Backgrounds: ${bgColors.slice(0, 6).join(' | ') || 'N/A'}
  Texte:       ${textColors.slice(0, 6).join(' | ') || 'N/A'}
  Borders:     ${borderColors.slice(0, 4).join(' | ') || 'N/A'}

TYPOGRAFIE:
  H1:   ${typoMap.h1?.font_family || 'N/A'} | ${typoMap.h1?.font_size || 'N/A'} | weight: ${typoMap.h1?.font_weight || 'N/A'} | line-height: ${typoMap.h1?.line_height || 'N/A'} | spacing: ${typoMap.h1?.letter_spacing || 'N/A'} | transform: ${typoMap.h1?.text_transform || 'none'}
  H2:   ${typoMap.h2?.font_family || 'N/A'} | ${typoMap.h2?.font_size || 'N/A'} | weight: ${typoMap.h2?.font_weight || 'N/A'}
  Body: ${typoMap.body?.font_family || typoMap.p?.font_family || 'N/A'} | ${typoMap.body?.font_size || typoMap.p?.font_size || 'N/A'} | color: ${typoMap.body?.color || typoMap.p?.color || 'N/A'}

FONTS: ${(ref.fontsList || []).map(f => `${f.family} (${f.weight})`).join(', ') || 'System-Fonts'}

BUTTONS:
  Primary:   bg: ${primaryBtn?.background_color || 'N/A'} | color: ${primaryBtn?.color || 'N/A'} | padding: ${primaryBtn?.padding || 'N/A'} | radius: ${primaryBtn?.border_radius || '0px'}${secondaryBtn ? `\n  Secondary: bg: ${secondaryBtn.background_color || 'N/A'} | color: ${secondaryBtn.color || 'N/A'} | radius: ${secondaryBtn.border_radius || '0px'}` : ''}

NAVIGATION:
  bg: ${ref.nav?.background_color || 'N/A'} | position: ${ref.nav?.position || 'N/A'}
  Links: ${ref.nav?.link_font_family || 'N/A'} | ${ref.nav?.link_font_size || 'N/A'} | transform: ${ref.nav?.link_text_transform || 'none'}

LAYOUT PATTERNS:
  ${(ref.layouts || []).map(l => `${l.display} | columns: ${l.grid_template_columns || 'N/A'} | gap: ${l.gap || 'N/A'} | max-width: ${l.max_width || 'N/A'}`).join('\n  ') || 'N/A'}
${ref.architecture ? `
PAGE ARCHITECTURE:
  Header: ${ref.architecture.header_type || 'N/A'} | logo: ${ref.architecture.header_logo_position || 'N/A'} | transparent: ${ref.architecture.header_is_transparent ? 'YES' : 'no'} | hamburger: ${ref.architecture.header_has_hamburger ? 'YES' : 'no'}
  Hero: ${ref.architecture.hero_type || 'N/A'} | fullscreen: ${ref.architecture.hero_is_fullscreen ? 'YES' : 'no'} | video: ${ref.architecture.hero_has_video ? 'YES' : 'no'} | text: ${ref.architecture.hero_text_position || 'N/A'} | words: ${ref.architecture.hero_headline_words || 0} | CTAs: ${ref.architecture.hero_cta_count || 0}
  Sections (${ref.architecture.section_count || 0}): ${ref.architecture.section_order || '[]'}
  Footer: ${ref.architecture.footer_type || 'N/A'} | dark: ${ref.architecture.footer_is_dark ? 'YES' : 'no'} | cols: ${ref.architecture.footer_column_count || 0} | newsletter: ${ref.architecture.footer_has_newsletter ? 'YES' : 'no'} | social: ${ref.architecture.footer_has_social ? 'YES' : 'no'}` : ''}

CONTENT-STRUKTUR:
${contentPreview}
`;
}


// ═══════════════════════════════════════════════════════════════
// 3. LIVE DNA SYNTHESIS (V10)
// ═══════════════════════════════════════════════════════════════

async function generateLiveDNA(industryKeyword, userRequest, references) {
    console.log(`🧠 Synthetisiere Live-DNA für "${userRequest}"...`);

    const referenceContext = references.slice(0, 3).map(r => {
        const arch = r.architecture || {};
        return `Domain: ${r.domain}
Colors: ${JSON.stringify(r.colors)}
Typography: ${JSON.stringify(r.typography)}
Header: type=${arch.header_type || 'unknown'}, transparent=${arch.header_is_transparent}, logo=${arch.header_logo_position || 'unknown'}, hamburger=${arch.header_has_hamburger}
Hero: type=${arch.hero_type || 'unknown'}, fullscreen=${arch.hero_is_fullscreen}, video=${arch.hero_has_video}, textPos=${arch.hero_text_position || 'unknown'}
Footer: type=${arch.footer_type || 'unknown'}, dark=${arch.footer_is_dark}, cols=${arch.footer_column_count || 0}, newsletter=${arch.footer_has_newsletter}`;
    }).join('\n\n');

    // Use Qwen3 Coder for the blueprint generation
    const blueprintPrompt = `You are a world-class Lead Designer at a top agency (Pentagram, &Walsh level).
The user wants: "${userRequest}" in the "${industryKeyword}" industry.

Here are real design tokens scraped from 3 leading websites in this niche:
${referenceContext}

Your job: Study these benchmarks. Do NOT copy them. Instead, extract the MATHEMATICAL DNA and VISUAL TENSION principles.
We are building a HIGH-END, uncompromising luxury site.

CRITICAL RULES:
- NO safe, centered, boring AI-slop layouts.
- Colors: Pure whites, pure blacks, or warm off-whites. NO muddy greys.
- Typography: Define extreme tension (e.g., "Massive H1 vs microscopic meta text").

Respond ONLY with valid JSON:
{
  "benchmarks": ["domain1.com", "domain2.com"],
  "personality": "e.g., silent-authority, brutalist-elegance",
  "layoutRule": "Describe the mathematical grid rule (e.g., 'Images locked to right 60%, text floats in left 40% with 10vw padding')",
  "asymmetryLevel": "extreme, moderate, or subtle",
  "typographyTension": "Describe the contrast ratio",
  "headerBehavior": "transparent-to-solid-on-scroll or hidden-until-scroll-up",
  "navLabels": ["Label1", "Label2", "Label3", "Label4"],
  "customPalette": {
    "bg": "#HEX", "bgAlt": "#HEX", "text": "#HEX", "textMuted": "#HEX", "accent": "#HEX", "border": "#HEX"
  },
  "customFonts": {
    "heading": "Exact Google Font name",
    "body": "Exact Google Font name"
  }
}`;

    try {
        const res = await callQwenBlueprint(blueprintPrompt);
        const dna = JSON.parse(res);
        console.log(`   ✅ DNA EXTRAHIERT: ${dna.personality} | Tension: ${dna.typographyTension}`);
        return dna;
    } catch (e) {
        console.error("⚠️ Error parsing Live DNA, falling back to safe defaults.", e);
        return {
            benchmarks: ['louisvuitton.com'],
            personality: 'brutalist-elegance',
            layoutRule: 'Extreme asymmetry, 30% overlap',
            asymmetryLevel: 'extreme',
            typographyTension: 'Massive contrast',
            navLabels: ['Collection', 'About', 'Stories', 'Contact'],
            headerBehavior: 'transparent-to-solid-on-scroll',
            customPalette: { bg: '#FFFFFF', bgAlt: '#FAFAFA', text: '#000000', textMuted: '#86868B', accent: '#000000', border: '#E5E5E5' },
            customFonts: { heading: 'Inter', body: 'Inter' }
        };
    }

}

// ═══════════════════════════════════════════════════════════════
// 3.5. THE ART DIRECTOR (VISUAL MANIFEST) - NEW
// ═══════════════════════════════════════════════════════════════

async function generateVisualManifest(industryKeyword, userRequest, dna) {
    const pageCountMatch = userRequest.match(/(\d+)\s*(?:Seiten|pages|Seitenanzahl)/i);
    const requestedPages = pageCountMatch ? parseInt(pageCountMatch[1], 10) : 1;

    console.log(`👁️ Art Director übernimmt: Erfinde asymmetrisches Layout... (Requested pages: ${requestedPages})`);

    const prompt = `You are a legendary Art Director (think Pentagram, &Walsh).
The user wants: "${userRequest}". Industry: ${industryKeyword}.
Brand DNA: ${dna.personality}. Rule: ${dna.layoutRule}.

Your job is to CHOREOGRAPH a highly unique, multipage-feeling scroll experience. 
DO NOT USE STANDARD COMPONENTS. Invent 5 unique sections for the HOMEPAGE.
For each, describe the VISUAL TENSION and how it breaks the grid.

CRITICAL: 
- Section 1 MUST be a Hero (e.g., 'HeroCinematic', 'HeroAsymmetricOffset').
- Include product-focused sections but make them look like art galleries, not Shopify templates.
- Give each section a UNIQUE 'componentName' (e.g., 'EditorialOverlapLeft', 'GalleryGridBroken').

SITEMAP:
The user requested ${requestedPages} pages. 
If this is > 1, provide a "sitemap" array of objects with "title" and "slug" (e.g., { "title": "The Archive", "slug": "archive" }).
Include core pages like "Collection", "About", "Contact", "Stories", "Atelier", "Sustainability", etc.
Ensure the sitemap has exactly ${requestedPages > 1 ? requestedPages : 0} additional pages if requested.

Respond ONLY with valid JSON:
{
  "sections": [
    {
      "componentName": "CustomName",
      "visualStrategy": "Describe exactly how elements overlap, where the whitespace is, and the focal point.",
      "layoutMath": "e.g., 'Image takes right 65vw, text box is 40vw and shifted -10vw to overlap'."
    }
  ],
  "heroHeadline": "A short, arrogant, high-end headline (max 4 words)",
  "sitemap": [
    { "title": "Page Title", "slug": "page-slug" }
  ]
}`;

    try {
        const res = await callQwenBlueprint(prompt);
        // Clean markdown backticks if present
        let cleanedRes = res;
        const mdMatch = cleanedRes.match(/```(?:json)?\n([\s\S]*?)```/);
        if (mdMatch) cleanedRes = mdMatch[1];

        const manifest = JSON.parse(cleanedRes);
        if (manifest.sections) {
            manifest.sections = manifest.sections.map((s, i) => ({
                ...s,
                componentName: s.componentName || s.name || s.id || `CustomSection${i + 1}`
            }));
        }
        return manifest;
    } catch (e) {
        console.error("⚠️ Art Director failed, using harsh fallback.", e);
        return {
            sections: [
                { componentName: 'HeroAsymmetric', visualStrategy: 'Text overlaps huge image', layoutMath: 'Image 70vw, text 40vw offset' },
                { componentName: 'ProductGalleryBroken', visualStrategy: 'Asymmetric 2-col', layoutMath: 'Left 60%, Right 40% offset down' }
            ],
            heroHeadline: 'Redefining the Standard.'
        };
    }
}

// ═══════════════════════════════════════════════════════════════
// 6. SECTION LIBRARY + BRAND ARCHETYPES (Dynamic, from real sites)
// ═══════════════════════════════════════════════════════════════

const SECTION_LIBRARY = {
    // Heroes
    'hero-fullbleed': { component: 'HeroFullBleed', description: '100vw×100vh fullscreen image. H1 + subtle CTA overlaid ON image (bottom-left or center). NO text columns beside image.' },
    'hero-video': { component: 'HeroVideo', description: '100vw×100vh fullscreen looping video, muted, autoplay. Minimal headline overlaid bottom-left.' },
    'hero-split': { component: 'HeroSplit', description: 'Two images side-by-side (50/50), each 100vh. Tiny text overlay on one image.' },
    // Collection / Editorial
    'collection-row': { component: 'CollectionRow', description: 'Horizontal row of 3-4 collection cards (equal size, symmetric grid). Each card: image + category name below. Links to sub-collection.' },
    'editorial-fullbleed': { component: 'EditorialFullBleed', description: '100vw image (70-90vh), small label + headline overlaid bottom-left ON image. NO text column.' },
    'editorial-overlap': { component: 'EditorialOverlap', description: 'Full-bleed image with text block overlapping image edge. Text floats over boundary.' },
    'brand-statement': { component: 'BrandStatement', description: 'Full-width contrasting bg section, one powerful sentence centered, generous whitespace. Font: heading italic.' },
    'dual-image': { component: 'DualImage', description: 'Two images in asymmetric grid (1 tall + 1 wide, or 60/40). Minimal text.' },
    'campaign-image': { component: 'CampaignImage', description: '100vw full-bleed campaign image (80vh), tiny text label bottom-right ON image.' },
    'craftsmanship': { component: 'CraftsmanshipDetail', description: 'Full-bleed close-up texture/detail image, small floating text block in one corner.' },
    // Products
    'product-grid-3col': { component: 'ProductGrid3Col', description: '3-column symmetric product grid. Equal card sizes. Image + name + price. No scroll.' },
    'product-grid-4col': { component: 'ProductGrid4Col', description: '4-column symmetric product grid. Tight gaps. Fits one viewport.' },
    'product-featured': { component: 'ProductFeatured', description: 'One hero product full-width, name + price overlaid. No separate text column.' },
};

// Brand archetypes derived from real luxury site architectures
const BRAND_ARCHETYPES = {
    // Gucci / Prada / Louis Vuitton pattern
    'luxury-fashion': [
        ['hero-fullbleed', 'collection-row', 'product-grid-3col', 'campaign-image', 'product-grid-3col', 'editorial-fullbleed'],
        ['hero-fullbleed', 'editorial-fullbleed', 'collection-row', 'product-grid-4col', 'dual-image', 'brand-statement'],
        ['hero-video', 'collection-row', 'editorial-overlap', 'product-grid-3col', 'campaign-image', 'product-featured'],
    ],
    // Apple / Dyson / Tesla pattern
    'tech-minimal': [
        ['hero-fullbleed', 'brand-statement', 'product-featured', 'editorial-fullbleed', 'product-grid-3col', 'craftsmanship'],
        ['hero-fullbleed', 'product-featured', 'brand-statement', 'dual-image', 'product-grid-4col', 'editorial-fullbleed'],
    ],
    // Rolex / Cartier / IWC pattern
    'watches-jewelry': [
        ['hero-fullbleed', 'craftsmanship', 'product-featured', 'editorial-fullbleed', 'collection-row', 'brand-statement'],
        ['hero-fullbleed', 'editorial-overlap', 'craftsmanship', 'product-grid-3col', 'campaign-image', 'brand-statement'],
    ],
    // Ferrari / Porsche / Lamborghini pattern
    'automotive': [
        ['hero-video', 'product-featured', 'editorial-fullbleed', 'brand-statement', 'dual-image', 'product-grid-3col'],
        ['hero-fullbleed', 'brand-statement', 'product-featured', 'campaign-image', 'editorial-overlap', 'craftsmanship'],
    ],
    // Aesop / The Ordinary / La Prairie pattern
    'beauty': [
        ['hero-fullbleed', 'collection-row', 'product-grid-4col', 'editorial-fullbleed', 'brand-statement', 'product-grid-3col'],
        ['hero-fullbleed', 'brand-statement', 'collection-row', 'product-grid-3col', 'campaign-image', 'editorial-overlap'],
    ],
    // Vitra / Cassina / Minotti pattern
    'furniture': [
        ['hero-fullbleed', 'editorial-overlap', 'product-grid-3col', 'craftsmanship', 'dual-image', 'brand-statement'],
        ['hero-video', 'collection-row', 'editorial-fullbleed', 'product-featured', 'campaign-image', 'product-grid-4col'],
    ],
    // Default fallback
    '_default': [
        ['hero-fullbleed', 'collection-row', 'product-grid-3col', 'editorial-fullbleed', 'campaign-image', 'brand-statement'],
        ['hero-fullbleed', 'editorial-overlap', 'product-grid-4col', 'brand-statement', 'dual-image', 'collection-row'],
    ],
};

function mapIndustryToArchetype(industry) {
    const map = {
        fashion: 'luxury-fashion', watches: 'watches-jewelry', jewelry: 'watches-jewelry',
        automotive: 'automotive', technology: 'tech-minimal', beauty: 'beauty',
        furniture: 'furniture', food: '_default', hospitality: '_default',
    };
    return map[industry] || '_default';
}

// ═══════════════════════════════════════════════════════════════
// 7. UNSPLASH IMAGE POOLS — Branchenspezifisch
// ═══════════════════════════════════════════════════════════════

const IMAGE_POOLS = {
    watches: [
        'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=1920&q=80',
        'https://images.unsplash.com/photo-1524592094714-0f0654e20314?w=1920&q=80',
        'https://images.unsplash.com/photo-1522312346375-d1a52e2b99b3?w=1920&q=80',
        'https://images.unsplash.com/photo-1509048191080-d2984bad6ae5?w=1920&q=80',
        'https://images.unsplash.com/photo-1526045431048-f857369baa09?w=1920&q=80',
        'https://images.unsplash.com/photo-1587836374828-4dbafa94cf0e?w=1920&q=80',
    ],
    fashion: [
        'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=1920&q=80',
        'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=1920&q=80',
        'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=1920&q=80',
        'https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=1920&q=80',
        'https://images.unsplash.com/photo-1445205170230-053b83016050?w=1920&q=80',
        'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=1920&q=80',
    ],
    automotive: [
        'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1920&q=80',
        'https://images.unsplash.com/photo-1544636331-e26879cd4d9b?w=1920&q=80',
        'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=1920&q=80',
        'https://images.unsplash.com/photo-1553440569-bcc63803a83d?w=1920&q=80',
        'https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=1920&q=80',
        'https://images.unsplash.com/photo-1580274455191-1c62238fa333?w=1920&q=80',
    ],
    technology: [
        'https://images.unsplash.com/photo-1531297484001-80022131f5a1?w=1920&q=80',
        'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=1920&q=80',
        'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=1920&q=80',
        'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1920&q=80',
        'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1920&q=80',
        'https://images.unsplash.com/photo-1488590528505-98d2b5aba04b?w=1920&q=80',
    ],
    beauty: [
        'https://images.unsplash.com/photo-1612817288484-6f916006741a?w=1920&q=80',
        'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=1920&q=80',
        'https://images.unsplash.com/photo-1571875257727-256c39da42af?w=1920&q=80',
        'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=1920&q=80',
        'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=1920&q=80',
        'https://images.unsplash.com/photo-1560750588-73207b1ef5b8?w=1920&q=80',
    ],
    furniture: [
        'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=1920&q=80',
        'https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=1920&q=80',
        'https://images.unsplash.com/photo-1506439773649-6e0eb8cfb237?w=1920&q=80',
        'https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=1920&q=80',
        'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=1920&q=80',
        'https://images.unsplash.com/photo-1600210491892-ed7c1b2e0928?w=1920&q=80',
    ],
    _default: [
        'https://images.unsplash.com/photo-1600607686527-6fb886090705?w=1920&q=80',
        'https://images.unsplash.com/photo-1515562141207-7a8efbf80c88?w=1920&q=80',
        'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1920&q=80',
        'https://images.unsplash.com/photo-1491553895911-0055eca6402d?w=1920&q=80',
        'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=1920&q=80',
        'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1920&q=80',
    ],
};


// ═══════════════════════════════════════════════════════════════
// 8. RANDOMIZATION UTILITIES
// ═══════════════════════════════════════════════════════════════

function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

function seededRandom(seed) {
    let s = seed;
    return function () {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        return s / 0x7fffffff;
    };
}

function pickRandom(arr, rng) {
    return arr[Math.floor(rng() * arr.length)];
}

function pickRandomN(arr, n, rng) {
    const shuffled = [...arr].sort(() => rng() - 0.5);
    return shuffled.slice(0, Math.min(n, arr.length));
}

function shuffleArray(arr, rng) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// ═══════════════════════════════════════════════════════════════
// 9. GUIDE FETCHER — Live Design Intelligence
// ═══════════════════════════════════════════════════════════════

async function fetchDesignGuides(industry, liveDNA) {
    if (!TAVILY_API_KEY) {
        console.log('   ⚠️  Kein TAVILY_API_KEY — überspringe Guide-Recherche.');
        return [];
    }
    const dna = liveDNA;
    const queries = [
        `${dna.benchmarks[0]} homepage layout design analysis breakdown`,
        `luxury ${industry} website design best practices 2025 2026 layout typography`,
        `editorial website fullscreen hero typography serif italic design pattern`,
    ];
    const guides = [];
    for (const query of queries) {
        try {
            const res = await fetch('https://api.tavily.com/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    api_key: TAVILY_API_KEY, query,
                    search_depth: 'advanced', max_results: 3,
                    include_answer: true,
                }),
            });
            if (!res.ok) continue;
            const data = await res.json();
            if (data.answer) guides.push({ type: 'guide', content: data.answer });
            if (data.results) {
                for (const r of data.results.slice(0, 2)) {
                    guides.push({ type: 'ref', title: r.title, url: r.url, content: (r.content || '').slice(0, 400) });
                }
            }
        } catch (_) { }
    }
    return guides;
}

function formatGuidesForPrompt(guides) {
    if (!guides.length) return '';
    let out = '\n══ LIVE DESIGN INTELLIGENCE ══\n';
    for (const g of guides.slice(0, 8)) {
        if (g.type === 'guide') out += `GUIDE: ${g.content}\n\n`;
        else out += `REF: ${g.title} — ${g.content}\n\n`;
    }
    return out;
}

// ═══════════════════════════════════════════════════════════════
// 10. ORGANIC WIREFRAME ENGINE — Layout Math + Yin/Yang + Signatures
// ═══════════════════════════════════════════════════════════════

// --- Säule 1: Typography Scales & Layout Math (from real luxury CSS) ---
// ULTRA-STRICT: MAX 20px font size as requested!
const ORGANIC_LAYOUT_MATH = {
    typographyScales: {
        'editorial-dramatic': { h1: 'clamp(14px, 2vw, 20px)', h2: 'clamp(14px, 1.8vw, 18px)', h3: '16px', body: '14px', label: '10px', ratio: 1.4 },
        'luxury-restrained': { h1: '18px', h2: '16px', h3: '14px', body: '13px', label: '10px', ratio: 1.3 },
        'tech-clean': { h1: '16px', h2: '15px', h3: '14px', body: '14px', label: '11px', ratio: 1.1 },
        'brutalist-contrast': { h1: '20px', h2: '18px', h3: '16px', body: '13px', label: '9px', ratio: 1.5 },
    },
    gridSystems: {
        '12-column': { columns: 12, gutter: 'clamp(12px, 1.5vw, 24px)', margin: 'clamp(16px, 4vw, 80px)' },
        '16-column': { columns: 16, gutter: 'clamp(8px, 1vw, 16px)', margin: 'clamp(24px, 5vw, 96px)' },
    },
    whitespaceRhythm: {
        'generous': { top: 'clamp(120px, 16vh, 240px)', bottom: 'clamp(120px, 16vh, 240px)', inner: 'clamp(48px, 6vh, 96px)' },
        'compressed': { top: 'clamp(40px, 5vh, 80px)', bottom: 'clamp(40px, 5vh, 80px)', inner: 'clamp(16px, 2vh, 32px)' },
        'breathing': { top: 'clamp(80px, 12vh, 180px)', bottom: 'clamp(80px, 12vh, 180px)', inner: 'clamp(32px, 4vh, 64px)' },
        'cinematic': { top: '0px', bottom: '0px', inner: '0px', note: 'Edge-to-edge, no padding — image fills viewport' },
    },
};

// --- Säule 1b: Signature Elements — The "X-Factor" details ---
const SIGNATURE_ELEMENTS = {
    hoverStates: [
        'text-link: underline slides in from left via width transition (0 → 100%), height 1px',
        'image: slow zoom (scale 1.02 over 1.5s ease-out) — extremely subtle, barely perceptible',
        'text-link: opacity drops to 0.4 on OTHER items (dim siblings, highlight active)',
        'card: thin 1px border appears on hover via border-color transition',
        'text-link: italic style toggle on hover (font-style: normal → italic, transition via clip)',
    ],
    gridBreakers: [
        'One image in a 3-col grid is 20% taller than siblings (aspect-ratio override)',
        'Text block overlaps image edge by 40-80px (negative margin or grid overlap)',
        'Section has one element with position: sticky that lingers while scrolling past',
        'Asymmetric gutter: left columns have 1px gap, right column has 48px gap',
        'One product card is double-width (grid-column: span 2) breaking the symmetry',
    ],
    transitionBreaks: [
        'Hard color cut: section bg switches from #FFFFFF to #0A0A0A with zero transition',
        'Image bleeds into next section (negative margin-bottom, overlapping boundary)',
        'Thin decorative line (1px, 30% opacity) between sections, width: 120px centered',
        'Section numbering: tiny "01", "02", "03" labels in margin (8px, tracking 0.5em)',
        'Diagonal crop: section image has clip-path polygon for angled bottom edge',
    ],
    typographicTouches: [
        'Mix weights in one headline: "The Art of <span class="font-light italic">Italian</span> Craft"',
        'One word in headline uses a different tracking (0.3em vs -0.02em)',
        'Decorative thin rule (1px × 40px) above or below section label',
        'Price/detail text uses tabular-nums and slightly larger letter-spacing',
        'Quote marks use a different font-weight or size than the quote text',
    ],
};

// --- Säule 3: Yin & Yang Flow Control ---
function calculateYinYangFlow(sections, rng, styleHint = 'luxury') {
    const flow = [];
    let prevWeight = 'neutral';     // left, right, center, neutral
    let prevDensity = 'medium';     // dense, spacious, medium
    let prevTone = 'light';         // light, dark, accent

    for (let i = 0; i < sections.length; i++) {
        const s = sections[i];
        const isHero = i === 0;

        // --- Weight Balance (left/right/center alternation) ---
        let weight;
        if (isHero) {
            weight = pickRandom(['center', 'bottom-left'], rng);
        } else if (prevWeight === 'left') {
            weight = rng() > 0.3 ? 'right' : 'center';
        } else if (prevWeight === 'right') {
            weight = rng() > 0.3 ? 'left' : 'center';
        } else {
            weight = pickRandom(['left', 'right'], rng);
        }

        // --- Density Balance (spacious ↔ dense alternation) ---
        let density;
        if (s.component?.includes('Grid') || s.component?.includes('Collection')) {
            density = 'dense';
        } else if (s.component?.includes('Statement') || s.component?.includes('Campaign')) {
            density = 'spacious';
        } else if (prevDensity === 'dense') {
            density = 'spacious';
        } else if (prevDensity === 'spacious') {
            density = rng() > 0.5 ? 'dense' : 'medium';
        } else {
            density = pickRandom(['dense', 'spacious'], rng);
        }

        // --- Tone Balance (light/dark rhythm) ---
        let tone;
        if (isHero) {
            tone = 'dark'; // Hero always has dark overlay
        } else if (prevTone === 'dark') {
            tone = 'light';
        } else if (i > 2 && prevTone === 'light') {
            tone = rng() > 0.6 ? 'dark' : 'light';
        } else {
            tone = 'light';
        }

        // --- Grid, Typo & Whitespace Selection (Driven by Style Hint) ---
        let gridKey = '12-column';
        let typoKey = 'luxury-restrained';
        let wsKey = isHero ? 'cinematic' : 'breathing';

        if (styleHint === 'brutalist') {
            typoKey = 'brutalist-contrast';
            wsKey = 'compressed';
        } else if (styleHint === 'minimalist') {
            gridKey = '8-column';
            typoKey = 'luxury-restrained';
            wsKey = 'generous';
        } else if (styleHint === 'editorial') {
            gridKey = '16-column';
            typoKey = 'editorial-dramatic';
            wsKey = 'cinematic';
        } else {
            // Adaptive defaults
            if (s.component?.includes('Grid')) gridKey = s.component.includes('4') ? '16-column' : '12-column';
            if (isHero) typoKey = 'editorial-dramatic';
            if (density === 'dense') wsKey = 'compressed';
        }

        // --- Signature Touches ---
        const signatures = [
            pickRandom(SIGNATURE_ELEMENTS.hoverStates, rng),
            i === 0 ? 'Signature: Full-screen editorial staging with tiny text contrast' : pickRandom(SIGNATURE_ELEMENTS.typographicTouches, rng),
            'Detail: Fine 1px border separators based on grid math'
        ].filter(Boolean);

        flow.push({
            index: i,
            component: s.component,
            weight, density, tone,
            grid: gridKey,
            gridMath: ORGANIC_LAYOUT_MATH.gridSystems[gridKey],
            whitespace: wsKey,
            whitespaceMath: ORGANIC_LAYOUT_MATH.whitespaceRhythm[wsKey],
            typoScale: typoKey,
            typoMath: ORGANIC_LAYOUT_MATH.typographyScales[typoKey],
            animation: 'none', // STRIKT: Keine Animationen außer Hover-Cursor
            signatures,
        });

        prevWeight = weight;
        prevDensity = density;
        prevTone = tone;
    }

    return flow;
}

// --- Section Sequence Selection (unchanged logic, cleaner code) ---
function selectSectionSequence(references, industry, rng) {
    // USER REQUESTED STRICT RHYTHM:
    // Image/Video Section -> Product Grid -> Image/Video Section -> Product Grid.
    // So we bypass the DB/Archetypes entirely for now to enforce this strict rule.

    console.log(`   📐 Enforcing strict organic rhythm: Image -> Products -> Image -> Products`);

    // Pick hero (video or fullbleed)
    const isVideoHero = rng() > 0.7;
    const heroSection = isVideoHero ? 'hero-video' : 'hero-fullbleed';

    return [
        heroSection,             // 1. Hero Full-Bleed
        'product-grid-3col',     // 2. Product Grid
        'editorial-fullbleed',   // 3. Editorial Full-Bleed
        'product-grid-4col',     // 4. Product Grid
        'editorial-fullbleed'    // 5. Editorial Full-Bleed
    ];
}

function buildDynamicBlueprint(references, industry, userRequest, fetchedImages, fetchedVideo, liveDNA, artDirectorManifest) {
    const seed = hashString(userRequest + new Date().toISOString());
    const rng = seededRandom(seed);
    const dna = liveDNA;

    const fonts = dna.customFonts || { heading: 'Inter', body: 'Inter' };
    const palette = dna.customPalette || { bg: '#FFFFFF', bgAlt: '#FAFAFA', text: '#0A0A0A', textMuted: '#86868B', accent: '#0A0A0A', border: '#E5E5E5' };

    // Use Art Director's dynamic sections instead of hardcoded library
    const manifestSections = artDirectorManifest.sections || [];
    const heroManifest = manifestSections[0];
    const sectionEntries = manifestSections.slice(1);

    // Images
    const images = fetchedImages?.length > 0 ? fetchedImages : shuffleArray(IMAGE_POOLS[industry] || IMAGE_POOLS._default, rng);

    // Header & Footer
    const headerBgOnScroll = palette.bg;
    const footerBg = '#000000';

    // Build file manifest dynamically based on Art Director's invention
    const fileManifest = [
        'app/globals.css', 'app/layout.tsx', 'app/page.tsx',
        'app/components/SmoothScroll.tsx', 'app/components/Header.tsx', 'app/components/SlideMenu.tsx',
        'app/components/Footer.tsx'
    ];

    for (const s of manifestSections) {
        const fname = `app/components/${s.componentName}.tsx`;
        if (!fileManifest.includes(fname)) fileManifest.push(fname);
    }

    const brandNameMatch = userRequest.match(/Brand\s*(?:Name)?[:\s]+([A-Z\s]+)/i);
    const brandName = brandNameMatch ? brandNameMatch[1].trim() : (userRequest.split(',')[0].trim().split(' ').slice(0, 3).join(' '));

    console.log(`   🌊 Art Director Flow: Generiere ${manifestSections.length} CUSTOM Sektionen`);

    return {
        meta: {
            industry, userRequest, brandName,
            generatedAt: new Date().toISOString(), seed,
            benchmarkInspiration: dna.benchmarks?.[0] || 'apple.com',
            personality: dna.personality || 'clean-authority',
        },
        designTokens: {
            colors: {
                bgPrimary: palette.bg, bgAlt: palette.bgAlt,
                textPrimary: palette.text, textMuted: palette.textMuted,
                accent: palette.accent, border: palette.border,
            },
            typography: {
                headingFont: fonts.heading, bodyFont: fonts.body,
                fontCategory: fonts.category || 'sans-serif',
                headingWeight: '300', headingTracking: '-0.02em',
                labelTracking: '0.15em', labelTransform: 'uppercase',
                bodySize: '16px', bodyLineHeight: '1.7',
            },
        },
        components: {
            header: {
                style: 'minimal-bar',
                logoPosition: 'left',
                bgInitial: headerBgOnScroll,
                hamburgerMenu: { mainCategories: dna.navLabels || ['Collection', 'Maison'] },
            },
            hero: {
                componentName: heroManifest.componentName,
                headline: artDirectorManifest.heroHeadline || 'Discover',
                visualStrategy: heroManifest.visualStrategy,
                layoutMath: heroManifest.layoutMath,
                images: [images[0]],
            },
            sections: sectionEntries.map((s, i) => ({
                componentName: s.componentName,
                visualStrategy: s.visualStrategy,
                layoutMath: s.layoutMath,
                image: images[(i + 1) % images.length],
            })),
            footer: {
                bg: footerBg,
                brandName,
                layout: { columnCount: 4, hasNewsletterBlock: true, hasSocialIcons: true },
                columns: [
                    { title: dna.navLabels?.[0] || 'Collection', links: dna.navLabels || ['Men', 'Women', 'Accessories', 'Parfum'] },
                    { title: 'Maison', links: ['Our Story', 'Craftsmanship', 'Sustainability', 'Careers'] },
                    { title: 'Client Care', links: ['Contact', 'Shipping', 'Returns', 'FAQ'] },
                    { title: 'Legal', links: ['Privacy', 'Terms', 'Conditions', 'Impressum'] },
                ],
                social: ['Instagram', 'Pinterest'],
            },
        },
        artDirectorManifest,
        designRules: {
            animations: {
                scrollReveal: 'ONLY opacity 0→1 with framer-motion whileInView, duration 0.8s ease [0.16,1,0.3,1]. NO translateY, NO scale, NO clip-path.',
                menuOpen: 'Side panel (max-width 480px) slides from right via translateX. Hamburger animates to X via CSS rotation on two spans.',
                hover: 'ONLY opacity:0.7 or color transition. NO scale, NO translateY.',
                forbidden: ['parallax', 'marquee', 'text-scroller', 'scale-in', 'slide-up', 'slide-in', 'zoom', 'bounce', 'float', 'blur', 'clip-path-on-scroll', 'background-attachment-fixed'],
            },
            images: {
                heroImage: 'Hero MUST be 100vw×100vh fullscreen. Image fills viewport with object-cover. Text overlaid ON image, NO background box.',
                sectionImages: 'Images fill containers edge-to-edge. Text ON TOP of images, NO semi-transparent box behind text.',
                productImages: 'aspect-[3/4] object-cover within card',
                neverUse: 'FORBIDDEN: image-left/text-right splits, background containers over images, small contained images with margins.',
            },
            typography: {
                headingMix: dna.useItalicInHeadlines === false ? 'No italic in headlines.' : 'Mix Regular and Italic: "The Art of <em>Italian</em> Craft". 1-2 italic words only.',
                labels: '10-11px, uppercase, letter-spacing 0.15-0.2em, var(--font-body)',
                body: '15-16px, line-height 1.7, max-width 520px',
                noGeneric: 'NEVER text-xl/text-2xl. ALWAYS clamp() or exact px.',
                heroSize: 'clamp(24px, 3.5vw, 52px) — elegant, NOT massive.',
            },
            cta: { style: 'Minimal text link, 11px uppercase, letter-spacing 0.15em, border-bottom 1px solid. NO large buttons.', text: '"Discover" or "Explore" — NEVER "Shop Now"' },
            layout: {
                spacing: 'Section padding: clamp(80px, 12vh, 160px) vertical.',
                grid: 'Product grids: symmetric, 3-4 columns, fits one viewport. Editorial: asymmetric allowed.',
                footer: `Background: ${footerBg}. FORBIDDEN: grey (#333-#DDD). Minimum 3 columns, newsletter, social links.`,
                products: 'Product grids fit ONE viewport. NO scrolling. ALL cards visible. 3 or 4 column grid.',
            },
            header: {
                structure: `Fixed, top 0, z-50. Logo left. MUST have search/account/bag icons + hamburger. NO desktop nav links.`,
                colorRule: `FORBIDDEN grey backgrounds. ONLY: ${headerBgOnScroll} (at top) and transparent (scrolled).`,
            },
            antiPatterns: {
                splitLayout: 'NEVER image-left/text-right splits (50/50 or 60/40). #1 AI slop pattern.',
                backgroundBoxes: 'NEVER colored container behind text on images. Text floats directly on image.',
                bigButtons: 'NEVER large CTA buttons. Tiny understated text links only.',
                genericSections: 'NEVER "Our Philosophy", "Trusted by", "Testimonials", "Why Choose Us".',
            },
        },
        fileManifest,
    };
}

// ═══════════════════════════════════════════════════════════════
// 11. CSS GENERATOR
// ═══════════════════════════════════════════════════════════════

function buildCSSFromBlueprint(bp) {
    const c = bp.designTokens.colors;
    const t = bp.designTokens.typography;
    const fontCategory = bp.designTokens.typography.fontStyle || bp.designTokens.typography.fontCategory || 'sans-serif';
    const headingFallback = fontCategory === 'serif' ? 'serif' : 'sans-serif';
    const bodyFallback = 'sans-serif';
    return `@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --bg-primary: ${c.bgPrimary};
  --bg-alt: ${c.bgAlt};
  --text-primary: ${c.textPrimary};
  --text-muted: ${c.textMuted};
  --accent: ${c.accent};
  --border: ${c.border};
  --font-heading: '${t.headingFont}', ${headingFallback};
  --font-body: '${t.bodyFont}', ${bodyFallback};
}

html, body {
  margin: 0; padding: 0;
  overflow-x: hidden;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: var(--font-body);
  font-size: 16px;
  line-height: 1.7;
}

html.lenis, html.lenis body { height: auto; }
.lenis.lenis-smooth { scroll-behavior: auto !important; }

::selection {
  background: var(--accent);
  color: var(--bg-primary);
}`;
}

// ═══════════════════════════════════════════════════════════════
// 12. PROMPT BUILDER — Dynamic Design Intelligence Engine
// ═══════════════════════════════════════════════════════════════

async function createPrompt(userRequest, industryKeyword, options = {}) {
    const { limit = 5 } = options;

    console.log(`🔍 Suche Referenzen für: "${industryKeyword}"...`);
    const references = await getReferences(industryKeyword, limit);
    if (references.length === 0) {
        const db = await getDb();
        const fallback = await db.all('SELECT id, domain, title, description, industry, style_tags, quality_score, tokens_json, markdown_content, screenshot_path FROM sites ORDER BY quality_score DESC LIMIT ?', [limit]);
        references.push(...fallback);
    }
    console.log(`✅ ${references.length} Referenzen`);

    const liveDNA = await generateLiveDNA(industryKeyword, userRequest, references);

    const artDirectorManifest = await generateVisualManifest(industryKeyword, userRequest, liveDNA);

    console.log(`\n🌐 Phase 0: Live Design Intelligence für "${industryKeyword}"...`);
    const [trendResults, designGuides] = await Promise.all([
        searchDesignTrends(industryKeyword),
        fetchDesignGuides(industryKeyword, liveDNA),
    ]);
    if (trendResults) console.log(`   ✅ ${trendResults.length} Trend-Ergebnisse`);
    if (designGuides.length) console.log(`   ✅ ${designGuides.length} Design-Guides`);

    console.log(`🌐 Phase 0b: Lade dynamische Medien...`);
    const fetchedImages = await fetchIndustryImages(industryKeyword, 8);
    const fetchedVideo = await fetchIndustryVideo(industryKeyword);

    // Build UNIQUE blueprint using Art Director Manifest
    const blueprint = buildDynamicBlueprint(references, industryKeyword, userRequest, fetchedImages, fetchedVideo, liveDNA, artDirectorManifest);
    const cssBlock = buildCSSFromBlueprint(blueprint);

    console.log(`📐 Blueprint: ${blueprint.fileManifest.length} Dateien | Hero: ${blueprint.components.hero.componentName}`);

    const db = await getDb();
    const stats = await db.get('SELECT COUNT(*) as total, ROUND(AVG(quality_score)) as avg_q FROM sites');
    const formattedRefs = references.slice(0, 2).map((ref, i) => formatReference(ref, i)).join('\n');
    const trendContext = formatTrendResults(trendResults);
    const screenshots = await loadScreenshots(references, 3);

    const dna = liveDNA;
    const systemPrompt = `You are a MASTER ARCHITECT & SENIOR DEVELOPER. You are building an ultra-premium, award-winning luxury e-commerce website. 
You are receiving a VISUAL MANIFEST from a world-class Art Director. Your job is to translate these visual strategies into immaculate Next.js & CSS code.

CRITICAL DIRECTIVE - "THE ANTI-SLOP RULE":
You MUST NOT use standard Tailwind UI templates. You MUST NOT build symmetric 3-column grids unless explicitly told. 
You MUST use absolute positioning, \`vw\`, \`vh\`, and \`calc()\` to achieve the precise "layoutMath" described in the blueprint.

╔══════════════════════════════════════════════════════════════╗
║  BLUEPRINT & VISUAL STRATEGY (FOLLOW EXACTLY)                ║
╚══════════════════════════════════════════════════════════════╝
${JSON.stringify({ meta: blueprint.meta, designTokens: blueprint.designTokens, components: blueprint.components, fileManifest: blueprint.fileManifest })}

╔══════════════════════════════════════════════════════════════╗
║  GLOBALS.CSS                                                 ║
╚══════════════════════════════════════════════════════════════╝
\`\`\`css
${cssBlock}
\`\`\`

╔══════════════════════════════════════════════════════════════╗
║  ABSOLUTE RULES (VIOLATION = FAILURE)                        ║
╚══════════════════════════════════════════════════════════════╝

1. TECH STACK: Next.js App Router, TypeScript, framer-motion (ONLY for scroll reveals). Lenis for smooth scroll.
2. COMPONENT FILES: For EVERY section defined in the blueprint (e.g., \`${blueprint.components.hero.componentName}\`), you MUST generate a full \`.tsx\` file.
3. CSS MODULES MANDATORY: For complex layouts described in 'visualStrategy', you MUST write custom CSS using CSS Modules. Do not attempt to build "overlapping 40vw text boxes shifted by -10vw" using pure Tailwind. It looks cheap. Write the real CSS.
4. TYPOGRAPHY AS ART: Use extreme typographic tension. Use \`clamp(3rem, 8vw, 10rem)\` for massive headlines. Use \`10px\` uppercase tracking-widest for metadata.
5. NO PADDING SLOP: Do not use \`p-4\` or \`p-8\`. Use \`padding: clamp(4rem, 10vh, 12rem)\` to let the design breathe like a luxury magazine.
6. NO PLACEHOLDERS: Generate complete, working code.
7. RHYTHM: In \`app/page.tsx\`, assemble the components in order: Hero -> Sections. 

IMAGES TO USE:
${blueprint.components.hero.images.map((img, i) => `- Hero: ${img}`).join('\n')}
${blueprint.components.sections.map((s, i) => `- Section ${i + 1}: ${s.image}`).join('\n')}

Generate ALL ${blueprint.fileManifest.length} files now. Each in a separate code block. 
Order: globals.css → layout.tsx → SmoothScroll → Header → SlideMenu → [All Custom Sections] → Footer → page.tsx
NO text outside code blocks. Start IMMEDIATELY with code.`;

    return { prompt: systemPrompt, screenshots, blueprint };
}

// ─── EXPORTS ───────────────────────────────────────────────────
export { createPrompt, getDb, loadScreenshots, buildDynamicBlueprint };
export async function closeDb() { if (_db) { await _db.close(); _db = null; } }

// ─── CLI ───────────────────────────────────────────────────────
const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url).includes(process.argv[1].replace(/\.js$/, ''));

async function main() {
    const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
    if (args.length < 2) {
        console.log(`
╔══════════════════════════════════════════════════════════════╗
║  🔥 LUXURY WEB GENERATOR v6 — DYNAMIC DESIGN INTELLIGENCE  ║
╠══════════════════════════════════════════════════════════════╣
║  node generate.js <industry> "<request>"                     ║
║  Industries: watches, fashion, automotive, technology,       ║
║              beauty, furniture, jewelry, food                ║
╚══════════════════════════════════════════════════════════════╝
`);
        process.exit(0);
    }
    const industry = args[0];
    const request = args.slice(1).join(' ');
    const result = await createPrompt(request, industry);
    console.log('\n' + '═'.repeat(60));
    console.log(result.prompt.slice(0, 2000) + '\n...[truncated]...');
    console.log('═'.repeat(60));
    console.log(`\n📏 Prompt: ${result.prompt.length} chars (~${Math.round(result.prompt.length / 4)} tokens)`);
    console.log(`📐 Blueprint: ${result.blueprint.fileManifest.length} files`);
    console.log(`🎨 Fonts: ${result.blueprint.designTokens.typography.headingFont} + ${result.blueprint.designTokens.typography.bodyFont}`);
    console.log(`🎨 Palette: ${result.blueprint.designTokens.colors.bgPrimary} / ${result.blueprint.designTokens.colors.textPrimary}`);
    console.log(`📸 Screenshots: ${result.screenshots.length}\n`);
    await fs.writeFile('prompt_output.txt', result.prompt, 'utf-8');
    if (_db) await _db.close();
}

if (isDirectRun) {
    main().catch(err => { console.error('💀 Error:', err); process.exit(1); });
}
