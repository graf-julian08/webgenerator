import fs from 'fs/promises';
import path from 'path';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

// ─── Config ────────────────────────────────────────────────────
const DATA_DIR  = 'data/sites';
const DB_PATH   = 'design_references.sqlite';

// ─── Schema ────────────────────────────────────────────────────
async function initDb() {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });

    // Performance: WAL-Mode + pragmas
    await db.exec(`PRAGMA journal_mode = WAL`);
    await db.exec(`PRAGMA synchronous = NORMAL`);

    await db.exec(`
        -- Haupttabelle: 1 Zeile pro Domain
        CREATE TABLE IF NOT EXISTS sites (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            domain           TEXT UNIQUE NOT NULL,
            url              TEXT,
            title            TEXT,
            description      TEXT,
            keywords         TEXT,
            og_image         TEXT,
            favicon          TEXT,
            theme_color      TEXT,
            language         TEXT,
            industry         TEXT,
            crawled_at       TEXT,
            screenshot_path  TEXT,
            screenshot_size  INTEGER DEFAULT 0,
            markdown_content TEXT,
            tokens_json      TEXT,         -- kompletter styles.tokens dump
            metadata_json    TEXT,         -- kompletter metadata dump
            style_tags       TEXT,         -- kommaseparierte Tags
            quality_score    INTEGER DEFAULT 0  -- 0-100 Qualitätsbewertung
        );

        -- Normalisierte Design-Tokens pro Seite
        CREATE TABLE IF NOT EXISTS typography (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            site_id     INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
            element     TEXT NOT NULL,     -- h1, h2, h3, p, a, body
            font_family TEXT,
            font_size   TEXT,
            font_weight TEXT,
            line_height TEXT,
            letter_spacing TEXT,
            color       TEXT,
            text_transform TEXT,
            background_color TEXT
        );

        CREATE TABLE IF NOT EXISTS colors (
            id      INTEGER PRIMARY KEY AUTOINCREMENT,
            site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
            role    TEXT NOT NULL,         -- background, text, border, accent
            value   TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS buttons (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            site_id          INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
            label            TEXT,
            background_color TEXT,
            color            TEXT,
            padding          TEXT,
            border_radius    TEXT,
            border           TEXT,
            box_shadow       TEXT,
            font_family      TEXT,
            font_size        TEXT,
            font_weight      TEXT,
            text_transform   TEXT,
            letter_spacing   TEXT
        );

        CREATE TABLE IF NOT EXISTS fonts (
            id      INTEGER PRIMARY KEY AUTOINCREMENT,
            site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
            family  TEXT NOT NULL,
            weight  TEXT,
            style   TEXT
        );

        CREATE TABLE IF NOT EXISTS layout_patterns (
            id                    INTEGER PRIMARY KEY AUTOINCREMENT,
            site_id               INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
            display               TEXT,
            grid_template_columns TEXT,
            flex_direction        TEXT,
            flex_wrap             TEXT,
            gap                   TEXT,
            padding               TEXT,
            max_width             TEXT,
            align_items           TEXT,
            justify_content       TEXT
        );

        CREATE TABLE IF NOT EXISTS navigation (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            site_id          INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
            background_color TEXT,
            position         TEXT,
            padding          TEXT,
            link_font_family TEXT,
            link_font_size   TEXT,
            link_font_weight TEXT,
            link_line_height TEXT,
            link_letter_spacing TEXT,
            link_color       TEXT,
            link_text_transform TEXT
        );

        CREATE TABLE IF NOT EXISTS hero (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            site_id             INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
            background_color    TEXT,
            background_image    TEXT,
            padding             TEXT,
            min_height          TEXT,
            display             TEXT,
            align_items         TEXT,
            justify_content     TEXT,
            heading_font_family TEXT,
            heading_font_size   TEXT,
            heading_font_weight TEXT,
            heading_line_height TEXT,
            heading_letter_spacing TEXT,
            heading_color       TEXT,
            heading_text_transform TEXT,
            subtext             TEXT
        );

        CREATE TABLE IF NOT EXISTS footer (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            site_id          INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
            background_color TEXT,
            color            TEXT,
            padding          TEXT,
            font_family      TEXT,
            font_size        TEXT
        );

        -- Page Architecture (NEW — how the page is structured, not just styled)
        CREATE TABLE IF NOT EXISTS page_architecture (
            id                      INTEGER PRIMARY KEY AUTOINCREMENT,
            site_id                 INTEGER UNIQUE NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
            header_type             TEXT,
            header_is_fixed         INTEGER DEFAULT 0,
            header_is_transparent   INTEGER DEFAULT 0,
            header_has_backdrop_blur INTEGER DEFAULT 0,
            header_logo_position    TEXT,
            header_nav_link_count   INTEGER DEFAULT 0,
            header_has_hamburger    INTEGER DEFAULT 0,
            header_height           INTEGER DEFAULT 0,
            hero_type               TEXT,
            hero_is_fullscreen      INTEGER DEFAULT 0,
            hero_has_video          INTEGER DEFAULT 0,
            hero_text_position      TEXT,
            hero_text_alignment     TEXT,
            hero_headline_words     INTEGER DEFAULT 0,
            hero_has_subtitle       INTEGER DEFAULT 0,
            hero_cta_count          INTEGER DEFAULT 0,
            section_order           TEXT,
            section_count           INTEGER DEFAULT 0,
            footer_type             TEXT,
            footer_is_dark          INTEGER DEFAULT 0,
            footer_column_count     INTEGER DEFAULT 0,
            footer_has_newsletter   INTEGER DEFAULT 0,
            footer_has_social       INTEGER DEFAULT 0,
            footer_link_count       INTEGER DEFAULT 0,
            total_images            INTEGER DEFAULT 0,
            total_videos            INTEGER DEFAULT 0,
            page_height             INTEGER DEFAULT 0,
            architecture_json       TEXT
        );

        -- Individual section analysis
        CREATE TABLE IF NOT EXISTS page_sections (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            site_id           INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
            section_index     INTEGER NOT NULL,
            section_type      TEXT,
            height_px         INTEGER DEFAULT 0,
            height_vh         INTEGER DEFAULT 0,
            image_count       INTEGER DEFAULT 0,
            card_count        INTEGER DEFAULT 0,
            has_grid          INTEGER DEFAULT 0,
            is_dark           INTEGER DEFAULT 0,
            background_color  TEXT
        );

        -- Indices für schnelle Suche
        CREATE INDEX IF NOT EXISTS idx_sites_domain     ON sites(domain);
        CREATE INDEX IF NOT EXISTS idx_sites_industry   ON sites(industry);
        CREATE INDEX IF NOT EXISTS idx_sites_tags       ON sites(style_tags);
        CREATE INDEX IF NOT EXISTS idx_typography_site   ON typography(site_id);
        CREATE INDEX IF NOT EXISTS idx_colors_site       ON colors(site_id);
        CREATE INDEX IF NOT EXISTS idx_buttons_site      ON buttons(site_id);
        CREATE INDEX IF NOT EXISTS idx_fonts_site        ON fonts(site_id);
        CREATE INDEX IF NOT EXISTS idx_fonts_family      ON fonts(family);
        CREATE INDEX IF NOT EXISTS idx_arch_site         ON page_architecture(site_id);
        CREATE INDEX IF NOT EXISTS idx_arch_header       ON page_architecture(header_type);
        CREATE INDEX IF NOT EXISTS idx_arch_hero         ON page_architecture(hero_type);
        CREATE INDEX IF NOT EXISTS idx_arch_footer       ON page_architecture(footer_type);
        CREATE INDEX IF NOT EXISTS idx_sections_site     ON page_sections(site_id);
        CREATE INDEX IF NOT EXISTS idx_sections_type     ON page_sections(section_type);

        -- View: Einfacher Zugriff auf die wichtigsten Tokens
        CREATE VIEW IF NOT EXISTS v_site_overview AS
        SELECT
            s.domain,
            s.title,
            s.description,
            s.industry,
            s.style_tags,
            s.quality_score,
            s.theme_color,
            (SELECT GROUP_CONCAT(DISTINCT f.family) FROM fonts f WHERE f.site_id = s.id) AS font_families,
            (SELECT GROUP_CONCAT(DISTINCT c.value) FROM colors c WHERE c.site_id = s.id AND c.role = 'background') AS bg_colors,
            (SELECT GROUP_CONCAT(DISTINCT c.value) FROM colors c WHERE c.site_id = s.id AND c.role = 'text') AS text_colors,
            (SELECT pa.header_type FROM page_architecture pa WHERE pa.site_id = s.id) AS header_type,
            (SELECT pa.hero_type FROM page_architecture pa WHERE pa.site_id = s.id) AS hero_type,
            (SELECT pa.footer_type FROM page_architecture pa WHERE pa.site_id = s.id) AS footer_type,
            (SELECT pa.section_order FROM page_architecture pa WHERE pa.site_id = s.id) AS section_order
        FROM sites s;
    `);

    return db;
}

// ─── Helper: Smart Tags generieren ─────────────────────────────
function generateTags(tokens, metadata) {
    const tags = [];
    if (!tokens) return tags;

    // Dark Mode Detection
    const bgColors = tokens.colors?.backgrounds || [];
    const isDark = bgColors.some(c =>
        c?.includes('rgb(0,')  || c?.includes('rgb(0, 0, 0)') ||
        c?.includes('#000')    || c?.includes('rgb(17,') ||
        c?.includes('rgb(18,') || c?.includes('rgb(20,') ||
        c?.includes('rgb(25,') || c?.includes('rgb(30,') ||
        c?.includes('rgb(33,') || c?.includes('rgb(34,') ||
        c?.includes('rgb(35,')
    );
    if (isDark) tags.push('dark-mode');

    // Light/White Mode
    const isLight = bgColors.some(c =>
        c?.includes('rgb(255, 255, 255)') || c?.includes('#fff') || c?.includes('#FFF')
    );
    if (isLight && !isDark) tags.push('light-mode');

    // Typography Classification
    const bodyFont = tokens.typography?.body?.fontFamily?.toLowerCase() || '';
    const h1Font   = tokens.typography?.h1?.fontFamily?.toLowerCase() || '';
    
    if (h1Font.includes('serif') && !h1Font.includes('sans-serif')) tags.push('serif-headings');
    if (h1Font.includes('sans-serif') || h1Font.includes('helvetica') || h1Font.includes('inter') || h1Font.includes('roboto')) tags.push('sans-serif-headings');
    if (bodyFont.includes('mono') || bodyFont.includes('courier') || bodyFont.includes('consolas')) tags.push('monospace-body');
    
    // Premium font indicators
    if (bodyFont.includes('helvetica now') || bodyFont.includes('neue haas') || h1Font.includes('didot') || h1Font.includes('bodoni')) tags.push('premium-typography');
    if (h1Font.includes('futura') || h1Font.includes('gill sans') || h1Font.includes('optima')) tags.push('classic-typography');

    // Text Transform Patterns
    if (tokens.typography?.h1?.textTransform === 'uppercase') tags.push('uppercase-headings');
    if (tokens.typography?.body?.textTransform === 'uppercase') tags.push('uppercase-body');

    // Letter Spacing
    const h1Spacing = parseFloat(tokens.typography?.h1?.letterSpacing) || 0;
    if (h1Spacing > 2) tags.push('wide-tracking');
    if (h1Spacing > 5) tags.push('ultra-wide-tracking');

    // Hero Section Analysis
    if (tokens.hero) {
        const heroHeight = parseInt(tokens.hero.minHeight) || 0;
        if (heroHeight > 800) tags.push('full-height-hero');
        if (tokens.hero.backgroundImage) tags.push('hero-background-image');
    }

    // Navigation Style
    if (tokens.navigation) {
        const navBg = tokens.navigation.backgroundColor || '';
        if (navBg.includes('rgba(0, 0, 0, 0)') || navBg.includes('transparent')) tags.push('transparent-nav');
        if (tokens.navigation.position === 'fixed' || tokens.navigation.position === 'sticky') tags.push('sticky-nav');
    }

    // Layout Patterns
    if (tokens.layoutPatterns?.some(lp => lp.display === 'grid')) tags.push('css-grid');
    if (tokens.layoutPatterns?.some(lp => lp.display === 'flex')) tags.push('flexbox');

    // Button Style Analysis
    if (tokens.buttons?.length > 0) {
        const btn = tokens.buttons[0];
        if (btn.borderRadius && parseInt(btn.borderRadius) === 0) tags.push('square-buttons');
        if (btn.borderRadius && parseInt(btn.borderRadius) >= 20) tags.push('rounded-buttons');
        if (btn.borderRadius && parseInt(btn.borderRadius) >= 50) tags.push('pill-buttons');
        if (btn.boxShadow && btn.boxShadow !== 'none' && btn.boxShadow !== null) tags.push('elevated-buttons');
    }

    // Font Count
    const fontCount = tokens.fonts?.length || 0;
    if (fontCount === 1) tags.push('single-font');
    if (fontCount >= 3) tags.push('multi-font');

    // Footer Style
    if (tokens.footer) {
        const footerBg = tokens.footer.backgroundColor || '';
        if (footerBg.includes('rgb(0,') || footerBg.includes('#000')) tags.push('dark-footer');
    }

    // Color Palette Richness
    const textColors = tokens.colors?.texts || [];
    if (textColors.length >= 5) tags.push('rich-color-palette');
    if (textColors.length <= 2) tags.push('minimal-palette');

    // Industry hints aus Metadata
    const desc = String(metadata?.description || metadata?.ogDescription || '').toLowerCase();
    const title = String(metadata?.title || metadata?.ogTitle || '').toLowerCase();
    const combined = desc + ' ' + title;
    
    if (combined.match(/hotel|resort|spa|luxury stay|suite/)) tags.push('hospitality');
    if (combined.match(/fashion|clothing|wear|collection|runway|designer/)) tags.push('fashion');
    if (combined.match(/jewelry|jewel|diamond|ring|necklace|watch|timepiece/)) tags.push('jewelry-watches');
    if (combined.match(/beauty|cosmetic|skincare|makeup|fragrance|perfume/)) tags.push('beauty');
    if (combined.match(/car|vehicle|automotive|drive|motor/)) tags.push('automotive');
    if (combined.match(/architect|design studio|interior|furniture/)) tags.push('design-architecture');
    if (combined.match(/food|restaurant|coffee|wine|dining|culinary/)) tags.push('food-beverage');
    if (combined.match(/tech|software|digital|app|platform/)) tags.push('technology');
    if (combined.match(/real estate|property|home|living/)) tags.push('real-estate');
    if (combined.match(/travel|adventure|explore|destination/)) tags.push('travel');

    return [...new Set(tags)]; // Deduplizieren
}

// ─── Helper: Industrie-Klassifikation ──────────────────────────
function classifyIndustry(metadata) {
    const desc = String(metadata?.description || metadata?.ogDescription || '').toLowerCase();
    const title = String(metadata?.title || metadata?.ogTitle || '').toLowerCase();
    const kw = metadata?.keywords;
    const keywords = (typeof kw === 'string' ? kw : Array.isArray(kw) ? kw.join(' ') : '').toLowerCase();
    const combined = desc + ' ' + title + ' ' + keywords;

    if (combined.match(/hotel|resort|spa|palace|suite|hospitality/)) return 'hospitality';
    if (combined.match(/watch|timepiece|horlog|chrono|rolex|omega|iwc/)) return 'watches';
    if (combined.match(/jewelry|jewel|diamond|ring|necklace|bracelet|tiffany|cartier/)) return 'jewelry';
    if (combined.match(/beauty|cosmetic|skincare|makeup|fragrance|perfume|serum/)) return 'beauty';
    if (combined.match(/fashion|clothing|wear|collection|runway|designer|dress|suit|shoe|bag/)) return 'fashion';
    if (combined.match(/car|vehicle|automotive|drive|motor|tesla/)) return 'automotive';
    if (combined.match(/architect|design studio|interior|furniture|chair|lamp/)) return 'design';
    if (combined.match(/food|restaurant|coffee|wine|dining|culinary|bakery/)) return 'food-beverage';
    if (combined.match(/tech|software|digital|app|platform|ai|saas/)) return 'technology';
    if (combined.match(/real estate|property|realt/)) return 'real-estate';
    if (combined.match(/travel|adventure|explore|destination|airline|flight/)) return 'travel';
    if (combined.match(/art|gallery|museum|exhibition|studio/)) return 'art-culture';
    if (combined.match(/sport|fitness|athletic|outdoor|yoga/)) return 'sports-lifestyle';
    
    return 'luxury-lifestyle';  // Default für Luxus-Seiten
}

// ─── Helper: Qualitätsscore berechnen ──────────────────────────
function calculateQualityScore(tokens, metadata, contentMd, screenshotSize) {
    let score = 0;

    // Screenshot-Qualität (max 25)
    if (screenshotSize > 2_000_000) score += 25;
    else if (screenshotSize > 500_000) score += 20;
    else if (screenshotSize > 100_000) score += 10;
    else score += 0;

    // Content-Qualität (max 25)
    const mdLen = contentMd?.length || 0;
    if (mdLen > 5000) score += 25;
    else if (mdLen > 2000) score += 20;
    else if (mdLen > 500) score += 15;
    else if (mdLen > 200) score += 10;
    else score += 5;

    // Token-Qualität (max 25)
    if (tokens) {
        if (tokens.typography?.h1?.fontFamily) score += 5;
        if (tokens.colors?.backgrounds?.length > 0) score += 5;
        if (tokens.buttons?.length > 0) score += 5;
        if (tokens.fonts?.length > 0) score += 5;
        if (tokens.navigation?.backgroundColor) score += 5;
    }

    // Metadata-Qualität (max 25)
    if (metadata) {
        if (metadata.title) score += 5;
        if (metadata.description || metadata.ogDescription) score += 5;
        if (metadata.ogImage) score += 5;
        if (metadata.keywords) score += 5;
        if (metadata.favicon) score += 5;
    }

    return Math.min(100, score);
}

// ─── Main: Database Builder ────────────────────────────────────
async function buildDatabase() {
    // Alte DB löschen für sauberen Neuaufbau
    try { await fs.unlink(DB_PATH); } catch (_) {}

    const db = await initDb();
    const domains = await fs.readdir(DATA_DIR);
    
    console.log(`\n🚀 Starte Indexierung von ${domains.length} Seiten...\n`);
    console.log('═'.repeat(60));

    let successCount = 0;
    let errorCount   = 0;
    let skippedCount = 0;

    // Batch inserts mit Transactions
    await db.exec('BEGIN TRANSACTION');

    for (const domain of domains) {
        try {
            const sitePath = path.join(DATA_DIR, domain);
            const stats = await fs.stat(sitePath);
            if (!stats.isDirectory()) { skippedCount++; continue; }

            // ── Dateien einlesen (mit Fallbacks) ──
            let styles = {}, metadata = {}, contentMd = '';
            let screenshotSize = 0;

            try {
                styles = JSON.parse(await fs.readFile(path.join(sitePath, 'styles.json'), 'utf-8'));
            } catch (_) { /* styles.json fehlt */ }

            try {
                const metaRaw = JSON.parse(await fs.readFile(path.join(sitePath, 'metadata.json'), 'utf-8'));
                // Manche metadata.json haben .data wrapper, manche nicht
                metadata = metaRaw.data || metaRaw;
            } catch (_) { /* metadata.json fehlt */ }

            try {
                contentMd = await fs.readFile(path.join(sitePath, 'content.md'), 'utf-8');
            } catch (_) { /* content.md fehlt */ }

            try {
                const ssStat = await fs.stat(path.join(sitePath, 'screenshot.png'));
                screenshotSize = ssStat.size;
            } catch (_) { /* screenshot fehlt */ }

            const tokens = styles.tokens || {};

            // ── Qualitäts-Check: mindestens 1 Datei muss vorhanden sein ──
            if (!contentMd && !Object.keys(tokens).length && !Object.keys(metadata).length) {
                console.log(`  ⏭️  ${domain} — keine Daten, übersprungen`);
                skippedCount++;
                continue;
            }

            // ── Tags & Industrie ──
            const tags      = generateTags(tokens, metadata);
            const industry  = classifyIndustry(metadata);
            const quality   = calculateQualityScore(tokens, metadata, contentMd, screenshotSize);

            // ── INSERT: Haupttabelle ──
            const result = await db.run(`
                INSERT OR REPLACE INTO sites
                    (domain, url, title, description, keywords, og_image, favicon, theme_color,
                     language, industry, crawled_at, screenshot_path, screenshot_size,
                     markdown_content, tokens_json, metadata_json, style_tags, quality_score)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                domain,
                metadata.url || metadata.sourceURL || `https://${domain}`,
                metadata.title || metadata.ogTitle || domain,
                metadata.description || metadata.ogDescription || '',
                typeof metadata.keywords === 'string' ? metadata.keywords : Array.isArray(metadata.keywords) ? metadata.keywords.join(', ') : '',
                metadata.ogImage || metadata['og:image'] || '',
                metadata.favicon || '',
                metadata['theme-color'] || metadata.themeColor || '',
                metadata.language || 'en',
                industry,
                styles.timestamp || new Date().toISOString(),
                path.join(sitePath, 'screenshot.png'),
                screenshotSize,
                contentMd,
                JSON.stringify(tokens),
                JSON.stringify(metadata),
                tags.join(','),
                quality
            ]);

            const siteId = result.lastID;

            // ── INSERT: Typography ──
            if (tokens.typography) {
                for (const [element, typo] of Object.entries(tokens.typography)) {
                    if (!typo || typeof typo !== 'object') continue;
                    await db.run(`
                        INSERT INTO typography
                            (site_id, element, font_family, font_size, font_weight,
                             line_height, letter_spacing, color, text_transform, background_color)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [siteId, element,
                        typo.fontFamily, typo.fontSize, typo.fontWeight,
                        typo.lineHeight, typo.letterSpacing, typo.color,
                        typo.textTransform, typo.backgroundColor || null
                    ]);
                }
            }

            // ── INSERT: Colors ──
            if (tokens.colors) {
                for (const bg of (tokens.colors.backgrounds || [])) {
                    await db.run(`INSERT INTO colors (site_id, role, value) VALUES (?, 'background', ?)`, [siteId, bg]);
                }
                for (const txt of (tokens.colors.texts || [])) {
                    await db.run(`INSERT INTO colors (site_id, role, value) VALUES (?, 'text', ?)`, [siteId, txt]);
                }
                for (const brd of (tokens.colors.borders || [])) {
                    await db.run(`INSERT INTO colors (site_id, role, value) VALUES (?, 'border', ?)`, [siteId, brd]);
                }
            }

            // ── INSERT: Buttons ──
            if (tokens.buttons?.length > 0) {
                for (const btn of tokens.buttons) {
                    await db.run(`
                        INSERT INTO buttons
                            (site_id, label, background_color, color, padding, border_radius,
                             border, box_shadow, font_family, font_size, font_weight,
                             text_transform, letter_spacing)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [siteId, btn.text || '', btn.backgroundColor, btn.color, btn.padding,
                        btn.borderRadius, btn.border, btn.boxShadow,
                        btn.fontFamily, btn.fontSize, btn.fontWeight,
                        btn.textTransform, btn.letterSpacing
                    ]);
                }
            }

            // ── INSERT: Fonts ──
            if (tokens.fonts?.length > 0) {
                for (const font of tokens.fonts) {
                    await db.run(`
                        INSERT INTO fonts (site_id, family, weight, style)
                        VALUES (?, ?, ?, ?)
                    `, [siteId, font.family, font.weight, font.style]);
                }
            }

            // ── INSERT: Layout Patterns ──
            if (tokens.layoutPatterns?.length > 0) {
                for (const lp of tokens.layoutPatterns) {
                    await db.run(`
                        INSERT INTO layout_patterns
                            (site_id, display, grid_template_columns, flex_direction,
                             flex_wrap, gap, padding, max_width, align_items, justify_content)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [siteId, lp.display, lp.gridTemplateColumns, lp.flexDirection,
                        lp.flexWrap, lp.gap, lp.padding, lp.maxWidth,
                        lp.alignItems, lp.justifyContent
                    ]);
                }
            }

            // ── INSERT: Navigation ──
            if (tokens.navigation) {
                const nav = tokens.navigation;
                const link = nav.linkStyle || {};
                await db.run(`
                    INSERT INTO navigation
                        (site_id, background_color, position, padding,
                         link_font_family, link_font_size, link_font_weight,
                         link_line_height, link_letter_spacing, link_color, link_text_transform)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [siteId, nav.backgroundColor, nav.position, nav.padding,
                    link.fontFamily, link.fontSize, link.fontWeight,
                    link.lineHeight, link.letterSpacing, link.color, link.textTransform
                ]);
            }

            // ── INSERT: Hero ──
            if (tokens.hero) {
                const hero = tokens.hero;
                const heading = hero.heading || {};
                await db.run(`
                    INSERT INTO hero
                        (site_id, background_color, background_image, padding, min_height,
                         display, align_items, justify_content,
                         heading_font_family, heading_font_size, heading_font_weight,
                         heading_line_height, heading_letter_spacing, heading_color,
                         heading_text_transform, subtext)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [siteId, hero.backgroundColor, hero.backgroundImage, hero.padding,
                    hero.minHeight, hero.display, hero.alignItems, hero.justifyContent,
                    heading.fontFamily, heading.fontSize, heading.fontWeight,
                    heading.lineHeight, heading.letterSpacing, heading.color,
                    heading.textTransform, hero.subtext
                ]);
            }

            // ── INSERT: Footer ──
            if (tokens.footer) {
                const ft = tokens.footer;
                await db.run(`
                    INSERT INTO footer
                        (site_id, background_color, color, padding, font_family, font_size)
                    VALUES (?, ?, ?, ?, ?, ?)
                `, [siteId, ft.backgroundColor, ft.color, ft.padding, ft.fontFamily, ft.fontSize]);
            }

            // ── INSERT: Page Architecture ──
            try {
                const archRaw = JSON.parse(await fs.readFile(path.join(sitePath, 'architecture.json'), 'utf-8'));
                const arch = archRaw.architecture || {};

                if (arch.header || arch.hero || arch.sections) {
                    const h = arch.header || {};
                    const hr = arch.hero || {};
                    const f = arch.footer || {};
                    const m = arch.metrics || {};

                    await db.run(`
                        INSERT OR REPLACE INTO page_architecture
                            (site_id, header_type, header_is_fixed, header_is_transparent,
                             header_has_backdrop_blur, header_logo_position, header_nav_link_count,
                             header_has_hamburger, header_height,
                             hero_type, hero_is_fullscreen, hero_has_video,
                             hero_text_position, hero_text_alignment, hero_headline_words,
                             hero_has_subtitle, hero_cta_count,
                             section_order, section_count,
                             footer_type, footer_is_dark, footer_column_count,
                             footer_has_newsletter, footer_has_social, footer_link_count,
                             total_images, total_videos, page_height,
                             architecture_json)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        siteId,
                        h.type, h.isFixed ? 1 : 0, h.isTransparent ? 1 : 0,
                        h.hasBackdropBlur ? 1 : 0, h.logoPosition, h.navLinkCount || 0,
                        h.hasHamburger ? 1 : 0, h.height || 0,
                        hr.type, hr.isFullscreen ? 1 : 0, hr.hasVideo ? 1 : 0,
                        hr.textPosition, hr.textAlignment, hr.headlineWordCount || 0,
                        hr.hasSubtitle ? 1 : 0, hr.ctaCount || 0,
                        JSON.stringify(arch.sectionOrder || []), (arch.sections || []).length,
                        f.type, f.isDark ? 1 : 0, f.columnCount || 0,
                        f.hasNewsletter ? 1 : 0, f.hasSocialLinks ? 1 : 0, f.linkCount || 0,
                        m.totalImages || 0, m.totalVideos || 0, m.totalHeight || 0,
                        JSON.stringify(arch)
                    ]);

                    // Insert individual sections
                    for (const sec of (arch.sections || [])) {
                        await db.run(`
                            INSERT INTO page_sections
                                (site_id, section_index, section_type, height_px, height_vh,
                                 image_count, card_count, has_grid, is_dark, background_color)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `, [
                            siteId, sec.index, sec.type, sec.heightPx || 0, sec.heightVh || 0,
                            sec.imageCount || 0, sec.cardCount || 0,
                            sec.hasGrid ? 1 : 0, sec.isDarkBackground ? 1 : 0,
                            sec.backgroundColor
                        ]);
                    }
                }
            } catch (_) { /* architecture.json fehlt — OK für ältere Daten */ }

            const qualityBar = '█'.repeat(Math.floor(quality / 10)) + '░'.repeat(10 - Math.floor(quality / 10));
            console.log(`  ✅ ${domain.padEnd(35)} [${qualityBar}] ${quality}/100  ${tags.slice(0, 4).join(', ')}`);
            successCount++;

        } catch (err) {
            console.error(`  ❌ ${domain}: ${err.message}`);
            errorCount++;
        }
    }

    await db.exec('COMMIT');

    // ── Statistiken ──
    const siteCount   = (await db.get('SELECT COUNT(*) as c FROM sites')).c;
    const fontCount   = (await db.get('SELECT COUNT(DISTINCT family) as c FROM fonts')).c;
    const colorCount  = (await db.get('SELECT COUNT(*) as c FROM colors')).c;
    const buttonCount = (await db.get('SELECT COUNT(*) as c FROM buttons')).c;
    const avgQuality  = (await db.get('SELECT ROUND(AVG(quality_score)) as avg FROM sites')).avg;
    const dbSize      = (await fs.stat(DB_PATH)).size;

    console.log('\n' + '═'.repeat(60));
    console.log('🔥 DATENBANK FERTIG!\n');
    console.log(`  📊 Seiten:          ${siteCount}`);
    console.log(`  🔤 Unique Fonts:    ${fontCount}`);
    console.log(`  🎨 Farben:          ${colorCount}`);
    console.log(`  🔲 Buttons:         ${buttonCount}`);
    console.log(`  ⭐ Ø Qualität:      ${avgQuality}/100`);
    console.log(`  💾 DB Größe:        ${(dbSize / 1024 / 1024).toFixed(1)} MB`);
    console.log(`  ✅ Erfolgreich:     ${successCount}`);
    console.log(`  ❌ Fehler:          ${errorCount}`);
    console.log(`  ⏭️  Übersprungen:    ${skippedCount}`);
    console.log(`\n  📁 Datei: ${DB_PATH}`);
    console.log('═'.repeat(60));

    // ── Top-5 nach Qualität ──
    const top5 = await db.all('SELECT domain, quality_score, style_tags FROM sites ORDER BY quality_score DESC LIMIT 5');
    console.log('\n🏆 Top-5 Referenzen nach Qualität:\n');
    top5.forEach((s, i) => {
        console.log(`  ${i+1}. ${s.domain} (${s.quality_score}/100) — ${s.style_tags.split(',').slice(0, 3).join(', ')}`);
    });

    // ── Industries Breakdown ──
    const industries = await db.all('SELECT industry, COUNT(*) as cnt FROM sites GROUP BY industry ORDER BY cnt DESC');
    console.log('\n📊 Industrie-Verteilung:\n');
    industries.forEach(ind => {
        console.log(`  ${ind.industry.padEnd(20)} ${ind.cnt} Seiten`);
    });

    // ── Architecture Breakdown (NEW) ──
    const archCount = (await db.get('SELECT COUNT(*) as c FROM page_architecture')).c;
    if (archCount > 0) {
        console.log('\n🏗️  Page Architecture Analyse:\n');

        const headerTypes = await db.all('SELECT header_type, COUNT(*) as cnt FROM page_architecture GROUP BY header_type ORDER BY cnt DESC');
        console.log('  Header-Typen:');
        headerTypes.forEach(t => console.log(`    ${(t.header_type || 'unknown').padEnd(25)} ${t.cnt}`));

        const heroTypes = await db.all('SELECT hero_type, COUNT(*) as cnt FROM page_architecture GROUP BY hero_type ORDER BY cnt DESC');
        console.log('\n  Hero-Typen:');
        heroTypes.forEach(t => console.log(`    ${(t.hero_type || 'unknown').padEnd(25)} ${t.cnt}`));

        const footerTypes = await db.all('SELECT footer_type, COUNT(*) as cnt FROM page_architecture GROUP BY footer_type ORDER BY cnt DESC');
        console.log('\n  Footer-Typen:');
        footerTypes.forEach(t => console.log(`    ${(t.footer_type || 'unknown').padEnd(25)} ${t.cnt}`));

        const sectionTypes = await db.all('SELECT section_type, COUNT(*) as cnt FROM page_sections GROUP BY section_type ORDER BY cnt DESC LIMIT 10');
        console.log('\n  Top-10 Section-Typen:');
        sectionTypes.forEach(t => console.log(`    ${(t.section_type || 'unknown').padEnd(25)} ${t.cnt}`));

        const avgSections = (await db.get('SELECT ROUND(AVG(section_count), 1) as avg FROM page_architecture')).avg;
        console.log(`\n  Ø Sections pro Seite: ${avgSections}`);

        console.log(`  📐 Architecturen:   ${archCount}/${siteCount}`);
    }

    await db.close();
    console.log('\n✨ Deine Design-Referenzen sind jetzt RAG-ready!\n');
}

buildDatabase().catch(err => {
    console.error('💀 Fataler Fehler:', err);
    process.exit(1);
});
