"""
Node 0: THE SCOUT — Playwright Crawler
Extracts layout DNA (skeletal structure only) from 3 high-end reference sites.
No content extraction — only spacing math, typography ratios, grid structures.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any

from playwright.async_api import async_playwright, Page, Browser

logger = logging.getLogger("agentic.scout")


# ═══════════════════════════════════════════════════════════════
# COOKIE / OVERLAY REMOVAL
# ═══════════════════════════════════════════════════════════════

ACCEPT_SELECTORS = [
    'button[id*="accept"]', 'button[class*="accept"]',
    '#onetrust-accept-btn-handler', '.cc-accept', '.cc-btn.cc-dismiss',
    '[data-testid="cookie-accept"]', 'button[class*="consent"]',
    '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
]

OVERLAY_SELECTORS = [
    '[id*="cookie"]', '[class*="cookie"]', '[id*="consent"]',
    '[class*="consent"]', '.cc-window', '#onetrust-consent-sdk',
    '#CybotCookiebotDialog', '[class*="gdpr"]', '[class*="popup"]',
    '[class*="modal"]', '[class*="overlay"]', '[class*="klaviyo"]',
    '[class*="newsletter-popup"]',
]


async def _remove_overlays(page: Page) -> None:
    """Click accept buttons and remove overlay elements."""
    for sel in ACCEPT_SELECTORS:
        try:
            btn = page.locator(sel).first
            if await btn.is_visible(timeout=500):
                await btn.click(timeout=2000)
                await page.wait_for_timeout(500)
                break
        except Exception:
            pass

    await page.evaluate("""() => {
        const selectors = %s;
        selectors.forEach(sel => {
            try {
                document.querySelectorAll(sel).forEach(el => {
                    const s = window.getComputedStyle(el);
                    if (s && (s.position === 'fixed' || s.position === 'sticky' || parseInt(s.zIndex) > 100)) {
                        el.remove();
                    }
                });
            } catch(_) {}
        });
        if (document.body) {
            document.body.style.overflow = '';
            document.body.style.overflowY = '';
        }
    }""" % json.dumps(OVERLAY_SELECTORS))


async def _auto_scroll(page: Page) -> None:
    """Scroll page to trigger lazy loading."""
    await page.evaluate("""async () => {
        await new Promise(resolve => {
            let totalHeight = 0;
            const distance = 400;
            const maxTime = 15000;
            const start = Date.now();
            const timer = setInterval(() => {
                window.scrollBy(0, distance);
                totalHeight += distance;
                if (totalHeight >= document.body.scrollHeight - window.innerHeight ||
                    Date.now() - start > maxTime) {
                    clearInterval(timer);
                    resolve();
                }
            }, 80);
        });
    }""")


# ═══════════════════════════════════════════════════════════════
# DESIGN TOKEN EXTRACTION
# ═══════════════════════════════════════════════════════════════

EXTRACT_TOKENS_JS = """() => {
    const gs = (el) => { try { return window.getComputedStyle(el); } catch(_) { return null; } };

    const extractTypo = (el) => {
        if (!el) return null;
        const s = gs(el);
        if (!s) return null;
        return {
            fontFamily: s.fontFamily, fontSize: s.fontSize,
            fontWeight: s.fontWeight, lineHeight: s.lineHeight,
            letterSpacing: s.letterSpacing, color: s.color,
            textTransform: s.textTransform
        };
    };

    // 1. Typography
    const typography = {};
    ['h1','h2','h3','h4','p','a','small','figcaption'].forEach(tag => {
        const el = document.querySelector(tag);
        if (el) typography[tag] = extractTypo(el);
    });
    if (document.body) {
        const bs = gs(document.body);
        if (bs) typography.body = {
            fontFamily: bs.fontFamily, fontSize: bs.fontSize,
            fontWeight: bs.fontWeight, lineHeight: bs.lineHeight,
            letterSpacing: bs.letterSpacing, color: bs.color,
            backgroundColor: bs.backgroundColor
        };
    }

    // 2. Buttons
    const buttons = [];
    const seen = new Set();
    document.querySelectorAll('button, .btn, a[class*="btn"], [role="button"]').forEach(btn => {
        try {
            const s = gs(btn);
            if (!s || s.display === 'none' || btn.offsetHeight === 0) return;
            const key = s.backgroundColor + '|' + s.color + '|' + s.borderRadius;
            if (seen.has(key)) return;
            seen.add(key);
            buttons.push({
                text: (btn.textContent || '').trim().slice(0, 50),
                backgroundColor: s.backgroundColor, color: s.color,
                padding: s.padding, borderRadius: s.borderRadius,
                border: s.border, fontSize: s.fontSize,
                fontWeight: s.fontWeight, textTransform: s.textTransform,
                letterSpacing: s.letterSpacing
            });
        } catch(_) {}
    });

    // 3. Navigation
    let navigation = null;
    const nav = document.querySelector('header, nav, [role="navigation"]');
    if (nav) {
        const ns = gs(nav);
        const link = nav.querySelector('a');
        if (ns) navigation = {
            backgroundColor: ns.backgroundColor, position: ns.position,
            height: nav.offsetHeight + 'px', padding: ns.padding,
            linkStyle: link ? extractTypo(link) : null
        };
    }

    // 4. Hero
    let hero = null;
    const heroEl = document.querySelector('[class*="hero"], [class*="banner"], section:first-of-type');
    if (heroEl) {
        const hs = gs(heroEl);
        if (hs) {
            const h1 = heroEl.querySelector('h1, [class*="heading"]');
            hero = {
                height: heroEl.offsetHeight + 'px',
                heightVh: Math.round((heroEl.offsetHeight / window.innerHeight) * 100),
                backgroundColor: hs.backgroundColor,
                padding: hs.padding,
                heading: h1 ? extractTypo(h1) : null,
                subtext: heroEl.querySelector('p') ? extractTypo(heroEl.querySelector('p')) : null
            };
        }
    }

    // 5. Colors
    const bgColors = new Set(), textColors = new Set(), borderColors = new Set();
    document.querySelectorAll('header,nav,main,section,footer,h1,h2,h3,p,a,button,[class*="card"],[class*="hero"]').forEach(el => {
        try {
            const s = gs(el);
            if (!s) return;
            if (s.backgroundColor && s.backgroundColor !== 'rgba(0, 0, 0, 0)') bgColors.add(s.backgroundColor);
            if (s.color) textColors.add(s.color);
            if (s.borderColor && s.borderStyle !== 'none') borderColors.add(s.borderColor);
        } catch(_) {}
    });

    // 6. Layout patterns
    const layouts = [];
    const seenL = new Set();
    document.querySelectorAll('section, main > div, [class*="grid"]').forEach(sec => {
        try {
            const s = gs(sec);
            if (!s || s.display === 'none') return;
            const key = s.display + '|' + (s.gridTemplateColumns||'') + '|' + s.gap;
            if (seenL.has(key)) return;
            seenL.add(key);
            if (s.display === 'grid' || s.display === 'flex') {
                layouts.push({
                    display: s.display, gridTemplateColumns: s.gridTemplateColumns || null,
                    gap: s.gap, padding: s.padding, maxWidth: s.maxWidth
                });
            }
        } catch(_) {}
    });

    // 7. Footer
    let footer = null;
    const fEl = document.querySelector('footer');
    if (fEl) {
        const fs = gs(fEl);
        if (fs) footer = {
            backgroundColor: fs.backgroundColor, color: fs.color,
            padding: fs.padding, height: fEl.offsetHeight + 'px'
        };
    }

    // 8. Fonts
    const fonts = [];
    try {
        document.fonts.forEach(f => {
            if (f.status === 'loaded') fonts.push({ family: f.family, weight: f.weight, style: f.style });
        });
    } catch(_) {}

    // 9. Spacing ratios (THE KEY DATA for anti-KI compliance)
    const sections = document.querySelectorAll('section, main > div');
    let avgSectionPadding = 0;
    let sectionCount = 0;
    sections.forEach(sec => {
        try {
            const s = gs(sec);
            if (!s || sec.offsetHeight < 100) return;
            const pt = parseFloat(s.paddingTop) || 0;
            const pb = parseFloat(s.paddingBottom) || 0;
            avgSectionPadding += (pt + pb) / 2;
            sectionCount++;
        } catch(_) {}
    });
    avgSectionPadding = sectionCount > 0 ? Math.round(avgSectionPadding / sectionCount) : 80;

    const h1El = document.querySelector('h1');
    const bodyEl = document.body;
    const h1Size = h1El ? parseFloat(gs(h1El).fontSize) : 48;
    const bodySize = bodyEl ? parseFloat(gs(bodyEl).fontSize) : 16;

    const spacingRatios = {
        sectionPaddingAvgPx: avgSectionPadding,
        sectionPaddingToViewport: Math.round((avgSectionPadding / window.innerHeight) * 100) / 100,
        h1ToBodyRatio: Math.round((h1Size / bodySize) * 100) / 100,
        h1SizePx: h1Size,
        bodySizePx: bodySize,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        gridGutterPx: layouts.length > 0 ? parseInt(layouts[0].gap) || 24 : 24,
    };

    return {
        typography, buttons, navigation, hero, footer,
        colors: { backgrounds: [...bgColors], texts: [...textColors], borders: [...borderColors] },
        layouts, fonts: [...new Map(fonts.map(f => [f.family+'|'+f.weight, f])).values()],
        spacingRatios
    };
}"""

# ═══════════════════════════════════════════════════════════════
# PAGE ARCHITECTURE EXTRACTION
# ═══════════════════════════════════════════════════════════════

EXTRACT_ARCHITECTURE_JS = """() => {
    const gs = (el) => { try { return window.getComputedStyle(el); } catch(_) { return null; } };

    // Header
    const header = document.querySelector('header, [role="banner"]');
    let headerData = { type: 'unknown', isFixed: false, isTransparent: false, height: 0, logoPosition: 'left', hasHamburger: false };
    if (header) {
        const hs = gs(header);
        if (hs) {
            headerData.isFixed = hs.position === 'fixed' || hs.position === 'sticky';
            const bg = hs.backgroundColor || '';
            headerData.isTransparent = bg.includes('rgba(0, 0, 0, 0)') || bg.includes('transparent');
            headerData.height = header.offsetHeight;
            const logo = header.querySelector('[class*="logo"], a:first-child');
            if (logo) {
                const lr = logo.getBoundingClientRect();
                const hr = header.getBoundingClientRect();
                const lc = lr.left + lr.width / 2;
                const hc = hr.left + hr.width / 2;
                headerData.logoPosition = Math.abs(lc - hc) < hr.width * 0.15 ? 'center' : lc < hc ? 'left' : 'right';
            }
            headerData.hasHamburger = !!header.querySelector('[class*="hamburger"], [class*="burger"], [aria-label*="menu"], button svg');
        }
    }

    // Hero
    const heroEl = document.querySelector('[class*="hero"], [class*="banner"], section:first-of-type');
    let heroData = { type: 'unknown', isFullscreen: false, hasVideo: false, hasImage: false, textPosition: 'center', headlineWords: 0, ctaCount: 0 };
    if (heroEl) {
        const rect = heroEl.getBoundingClientRect();
        heroData.isFullscreen = rect.height >= window.innerHeight * 0.85;
        heroData.hasVideo = !!heroEl.querySelector('video');
        heroData.hasImage = !!(heroEl.querySelector('img') || (gs(heroEl)?.backgroundImage !== 'none'));
        const h1 = heroEl.querySelector('h1');
        if (h1) {
            heroData.headlineWords = (h1.textContent || '').trim().split(/\\s+/).length;
            const h1r = h1.getBoundingClientRect();
            const heroCx = rect.left + rect.width / 2;
            const h1Cx = h1r.left + h1r.width / 2;
            heroData.textPosition = h1Cx < rect.left + rect.width * 0.35 ? 'left' : h1Cx > rect.left + rect.width * 0.65 ? 'right' : 'center';
        }
        heroData.ctaCount = heroEl.querySelectorAll('a[class*="btn"], a[class*="cta"], button[class*="btn"]').length;
        heroData.type = heroData.hasVideo ? 'video' : heroData.isFullscreen ? 'fullscreen-image' : 'standard';
    }

    // Sections
    const main = document.querySelector('main') || document.body;
    const secs = main.querySelectorAll(':scope > section, :scope > div[class]');
    const sections = [];
    secs.forEach((sec, i) => {
        if (i > 10 || sec.offsetHeight < 50) return;
        const s = gs(sec);
        if (!s || s.display === 'none') return;
        sections.push({
            index: i,
            heightVh: Math.round((sec.getBoundingClientRect().height / window.innerHeight) * 100),
            imageCount: sec.querySelectorAll('img, picture').length,
            cardCount: sec.querySelectorAll('[class*="card"], [class*="product"]').length,
            hasGrid: s.display === 'grid' || !!sec.querySelector('[class*="grid"]'),
        });
    });

    // Footer
    const fEl = document.querySelector('footer');
    let footerData = { type: 'unknown', isDark: false, columnCount: 0, hasNewsletter: false, hasSocial: false, linkCount: 0 };
    if (fEl) {
        const fs = gs(fEl);
        if (fs) {
            const bg = fs.backgroundColor || '';
            footerData.isDark = bg.includes('rgb(0,') || bg.includes('rgb(0, 0, 0)') || parseInt(bg.match(/\\d+/)?.[0] || 255) < 50;
            const inner = fEl.querySelector(':scope > div, :scope > nav');
            if (inner) {
                const is = gs(inner);
                if (is?.display === 'grid' && is.gridTemplateColumns) footerData.columnCount = is.gridTemplateColumns.split(/\\s+/).length;
                else if (is?.display === 'flex') footerData.columnCount = inner.children.length;
            }
            footerData.linkCount = fEl.querySelectorAll('a').length;
            footerData.hasNewsletter = !!fEl.querySelector('form, input[type="email"], [class*="newsletter"]');
            footerData.hasSocial = !!fEl.querySelector('[class*="social"], [aria-label*="Instagram"]');
        }
    }

    return { header: headerData, hero: heroData, sections, footer: footerData };
}"""


# ═══════════════════════════════════════════════════════════════
# SCOUT: MAIN EXTRACTION FUNCTION
# ═══════════════════════════════════════════════════════════════

async def _extract_site(page: Page, url: str) -> dict[str, Any]:
    """Extract design DNA from a single URL."""
    domain = url.split("//")[1].split("/")[0].replace("www.", "")
    logger.info(f"Scout → Crawling {domain}...")

    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_timeout(4000)
        await _remove_overlays(page)
        await page.wait_for_timeout(500)
        await _auto_scroll(page)
        await page.evaluate("() => window.scrollTo(0, 0)")
        await page.wait_for_timeout(1500)
        await _remove_overlays(page)

        tokens = await page.evaluate(EXTRACT_TOKENS_JS)
        architecture = await page.evaluate(EXTRACT_ARCHITECTURE_JS)

        logger.info(
            f"Scout ✅ {domain} — "
            f"{len(tokens.get('colors', {}).get('backgrounds', []))} bg colors, "
            f"{len(tokens.get('fonts', []))} fonts, "
            f"H1/body ratio: {tokens.get('spacingRatios', {}).get('h1ToBodyRatio', 'N/A')}"
        )

        return {
            "url": url,
            "domain": domain,
            "typography": tokens.get("typography", {}),
            "colors": tokens.get("colors", {}),
            "buttons": tokens.get("buttons", []),
            "navigation": tokens.get("navigation"),
            "hero": tokens.get("hero"),
            "layout_patterns": tokens.get("layouts", []),
            "footer": tokens.get("footer"),
            "fonts": tokens.get("fonts", []),
            "spacing_ratios": tokens.get("spacingRatios", {}),
            "architecture": architecture,
        }

    except Exception as e:
        logger.error(f"Scout ❌ {domain}: {e}")
        return {
            "url": url,
            "domain": domain,
            "error": str(e),
            "typography": {},
            "colors": {},
            "buttons": [],
            "navigation": None,
            "hero": None,
            "layout_patterns": [],
            "footer": None,
            "fonts": [],
            "spacing_ratios": {},
            "architecture": {},
        }


async def run_scout(urls: list[str]) -> dict[str, Any]:
    """Launch Playwright and extract design DNA from all URLs.

    Returns:
        {"sites": [site_data_1, site_data_2, site_data_3]}
    """
    logger.info(f"Scout starting — {len(urls)} target URLs")
    sites = []

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1920, "height": 1080},
            device_scale_factor=2,
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/125.0.0.0 Safari/537.36"
            ),
            locale="en-US",
        )

        for url in urls:
            page = await context.new_page()
            try:
                site_data = await _extract_site(page, url)
                sites.append(site_data)
            finally:
                await page.close()

        await browser.close()

    logger.info(f"Scout complete — {len(sites)} sites extracted")
    return {"sites": sites}
