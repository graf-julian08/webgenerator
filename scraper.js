import fs from 'fs/promises';
import path from 'path';
import { chromium } from 'playwright';
import dotenv from 'dotenv';

dotenv.config();

const SITES_FILE = 'sites.txt';
const OUTPUT_DIR = 'data/sites';
const CONCURRENCY = 5; // 5 Seiten gleichzeitig

// ─── Graceful Shutdown ──────────────────────────────────────────
let shuttingDown = false;
let activeBrowser = null;

process.on('SIGINT', async () => {
    console.log('\n\n⚠️  SIGINT empfangen – fahre sauber herunter...');
    shuttingDown = true;
    if (activeBrowser) {
        try { await activeBrowser.close(); } catch (_) {}
    }
    // Kurz warten damit laufende Firecrawl-Requests abbrechen können
    setTimeout(() => process.exit(0), 2000);
});

// ─── Auto-Scroll: Triggert Lazy-Loading & Scroll-Animationen ───
async function autoScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 400;
            const maxScrollTime = 20000;
            const startTime = Date.now();
            const timer = setInterval(() => {
                const scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;

                if (totalHeight >= scrollHeight - window.innerHeight || Date.now() - startTime > maxScrollTime) {
                    clearInterval(timer);
                    resolve();
                }
            }, 80);
        });
    });
}

// ─── Cookie-Banner, Popups, Overlays entfernen (Aggressiv) ─────
async function removeOverlays(page) {
    // Schritt 1: Versuche "Accept"-Buttons zu klicken
    const acceptSelectors = [
        'button[id*="accept"]', 'button[class*="accept"]',
        'a[id*="accept"]', 'a[class*="accept"]',
        'button[id*="agree"]', 'button[class*="agree"]',
        'button[id*="Allow"]', 'button[class*="Allow"]',
        '#onetrust-accept-btn-handler',
        '.cc-accept', '.cc-btn.cc-dismiss',
        '[data-testid="cookie-accept"]',
        'button[class*="consent"]',
        '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll'
    ];

    for (const sel of acceptSelectors) {
        try {
            const btn = page.locator(sel).first();
            if (await btn.isVisible({ timeout: 500 })) {
                await btn.click({ timeout: 2000 });
                await page.waitForTimeout(500);
                break; // Ein erfolgreicher Click reicht
            }
        } catch (_) {}
    }

    // Schritt 2: Verbleibende Overlays hart entfernen
    await page.evaluate(() => {
        if (!document.body) return;
        const selectors = [
            '[id*="cookie"]', '[class*="cookie"]', '[id*="consent"]', '[class*="consent"]',
            '.cc-window', '.optanon-alert-box-wrapper', '#onetrust-consent-sdk',
            '#CybotCookiebotDialog', '[class*="gdpr"]', '[id*="gdpr"]',
            '[class*="popup"]', '[class*="modal"]',
            '[class*="overlay"]',
            '[class*="klaviyo"]', '.needsclick',
            '[class*="newsletter"]', '[class*="subscribe"]',
            '[aria-label*="cookie"]', '[aria-label*="Cookie"]',
            // Fixierte Elemente die oft Overlays sind
        ];
        selectors.forEach(selector => {
            try {
                document.querySelectorAll(selector).forEach(el => {
                    // Nur entfernen wenn es ein Overlay/Banner ist (nicht den gesamten Content)
                    const style = window.getComputedStyle(el);
                    const isOverlay = style && (style.position === 'fixed' || style.position === 'sticky' ||
                                      style.zIndex > 100 || el.closest('[style*="z-index"]'));
                    if (isOverlay || el.matches('[id*="cookie"], [id*="consent"], .cc-window, #onetrust-consent-sdk, #CybotCookiebotDialog, [class*="gdpr"], [id*="gdpr"]')) {
                        el.remove();
                    }
                });
            } catch (_) {}
        });
        // Scroll-Lock vom Body entfernen
        if (document.body) {
            document.body.style.overflow = '';
            document.body.style.overflowY = '';
            document.body.classList.remove('no-scroll', 'modal-open', 'overflow-hidden');
        }
        if (document.documentElement) {
            document.documentElement.style.overflow = '';
            document.documentElement.style.overflowY = '';
        }
    });
}

// ─── Deep Design Token Extraction ──────────────────────────────
async function extractDesignTokens(page) {
    return await page.evaluate(() => {
        const getStyles = (el) => {
            try { return window.getComputedStyle(el); } catch (_) { return null; }
        };

        const extractTypography = (el) => {
            if (!el) return null;
            const s = getStyles(el);
            if (!s) return null;
            return {
                fontFamily: s.fontFamily,
                fontSize: s.fontSize,
                fontWeight: s.fontWeight,
                lineHeight: s.lineHeight,
                letterSpacing: s.letterSpacing,
                color: s.color,
                textTransform: s.textTransform
            };
        };

        // 1. Typografie
        const typography = {};
        ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'small', 'a', 'blockquote', 'figcaption'].forEach(tag => {
            const el = document.querySelector(tag);
            if (el) typography[tag] = extractTypography(el);
        });

        if (document.body) {
            const bodyStyles = getStyles(document.body);
            if (bodyStyles) {
                typography.body = {
                    fontFamily: bodyStyles.fontFamily,
                    fontSize: bodyStyles.fontSize,
                    fontWeight: bodyStyles.fontWeight,
                    lineHeight: bodyStyles.lineHeight,
                    letterSpacing: bodyStyles.letterSpacing,
                    color: bodyStyles.color,
                    backgroundColor: bodyStyles.backgroundColor
                };
            }
        }

        // 2. Buttons (alle Varianten, dedupliziert)
        const buttons = [];
        const btnSelectors = 'a.btn, a.button, a[class*="cta"], button, .btn, .button, [role="button"], input[type="submit"]';
        const btnEls = document.querySelectorAll(btnSelectors);
        const seenBtnStyles = new Set();
        btnEls.forEach(btn => {
            try {
                const s = getStyles(btn);
                if (!s || s.display === 'none' || s.visibility === 'hidden' || btn.offsetHeight === 0) return;
                const key = `${s.backgroundColor}|${s.color}|${s.borderRadius}|${s.border}`;
                if (seenBtnStyles.has(key)) return;
                seenBtnStyles.add(key);
                buttons.push({
                    text: btn.textContent?.trim().substring(0, 50),
                    backgroundColor: s.backgroundColor,
                    color: s.color,
                    padding: s.padding,
                    borderRadius: s.borderRadius,
                    border: s.border,
                    boxShadow: s.boxShadow !== 'none' ? s.boxShadow : null,
                    fontFamily: s.fontFamily,
                    fontSize: s.fontSize,
                    fontWeight: s.fontWeight,
                    textTransform: s.textTransform,
                    letterSpacing: s.letterSpacing
                });
            } catch (_) {}
        });

        // 3. Navigation
        let navigation = null;
        const nav = document.querySelector('nav, header nav, [role="navigation"]');
        if (nav) {
            const navS = getStyles(nav);
            const navLink = nav.querySelector('a');
            if (navS) {
                navigation = {
                    backgroundColor: navS.backgroundColor,
                    position: navS.position,
                    padding: navS.padding,
                    linkStyle: navLink ? extractTypography(navLink) : null
                };
            }
        }

        // 4. Hero-Section
        let hero = null;
        const heroEl = document.querySelector(
            '[class*="hero"], [class*="banner"], [class*="jumbotron"], section:first-of-type, main > div:first-child'
        );
        if (heroEl) {
            const heroS = getStyles(heroEl);
            if (heroS) {
                const heroHeading = heroEl.querySelector('h1, h2, [class*="heading"]');
                const heroSub = heroEl.querySelector('p, [class*="subtitle"], [class*="description"]');
                hero = {
                    backgroundColor: heroS.backgroundColor,
                    backgroundImage: heroS.backgroundImage !== 'none' ? heroS.backgroundImage : null,
                    padding: heroS.padding,
                    minHeight: heroS.minHeight,
                    display: heroS.display,
                    alignItems: heroS.alignItems,
                    justifyContent: heroS.justifyContent,
                    heading: heroHeading ? extractTypography(heroHeading) : null,
                    subtext: heroSub ? extractTypography(heroSub) : null
                };
            }
        }

        // 5. Farbpalette (Smart Sampling)
        const bgColors = new Set();
        const textColors = new Set();
        const borderColors = new Set();
        const importantSelectors = 'header, nav, main, section, footer, h1, h2, h3, h4, p, a, button, .btn, [class*="card"], [class*="hero"], [class*="banner"]';
        document.querySelectorAll(importantSelectors).forEach(el => {
            try {
                const s = getStyles(el);
                if (!s) return;
                if (s.backgroundColor && s.backgroundColor !== 'rgba(0, 0, 0, 0)') bgColors.add(s.backgroundColor);
                if (s.color && s.color !== 'rgba(0, 0, 0, 0)') textColors.add(s.color);
                if (s.borderColor && s.borderColor !== 'rgb(0, 0, 0)' && s.borderStyle !== 'none') borderColors.add(s.borderColor);
            } catch (_) {}
        });

        // 6. CSS Custom Properties
        const cssVariables = {};
        try {
            const rootStyles = getStyles(document.documentElement);
            if (rootStyles) {
                const commonVars = [
                    '--color-primary', '--color-secondary', '--color-accent', '--color-background', '--color-text',
                    '--primary', '--secondary', '--accent', '--background', '--foreground',
                    '--font-family', '--font-sans', '--font-serif', '--font-mono',
                    '--radius', '--border-radius', '--spacing', '--max-width',
                    '--color-brand', '--brand-color', '--text-color', '--bg-color'
                ];
                commonVars.forEach(v => {
                    const val = rootStyles.getPropertyValue(v).trim();
                    if (val) cssVariables[v] = val;
                });
            }
            for (const sheet of document.styleSheets) {
                try {
                    for (const rule of sheet.cssRules) {
                        if (rule.selectorText === ':root' || rule.selectorText === 'html') {
                            for (const prop of rule.style) {
                                if (prop.startsWith('--')) {
                                    cssVariables[prop] = rule.style.getPropertyValue(prop).trim();
                                }
                            }
                        }
                    }
                } catch (_) {}
            }
        } catch (_) {}

        // 7. Layout-Patterns
        const layoutPatterns = [];
        const seenLayouts = new Set();
        document.querySelectorAll('section, main > div, [class*="grid"], [class*="row"]').forEach(sec => {
            try {
                const s = getStyles(sec);
                if (!s || s.display === 'none') return;
                const key = `${s.display}|${s.gridTemplateColumns || ''}|${s.gap}`;
                if (seenLayouts.has(key)) return;
                seenLayouts.add(key);
                if (s.display === 'grid' || s.display === 'flex') {
                    layoutPatterns.push({
                        display: s.display,
                        gridTemplateColumns: s.gridTemplateColumns || null,
                        flexDirection: s.flexDirection || null,
                        flexWrap: s.flexWrap || null,
                        gap: s.gap,
                        padding: s.padding,
                        maxWidth: s.maxWidth,
                        alignItems: s.alignItems,
                        justifyContent: s.justifyContent
                    });
                }
            } catch (_) {}
        });

        // 8. Footer
        let footer = null;
        const footerEl = document.querySelector('footer');
        if (footerEl) {
            const fS = getStyles(footerEl);
            if (fS) {
                footer = {
                    backgroundColor: fS.backgroundColor,
                    color: fS.color,
                    padding: fS.padding,
                    fontFamily: fS.fontFamily,
                    fontSize: fS.fontSize
                };
            }
        }

        // 9. Geladene Fonts
        const loadedFonts = [];
        try {
            document.fonts.forEach(font => {
                if (font.status === 'loaded') {
                    loadedFonts.push({ family: font.family, weight: font.weight, style: font.style });
                }
            });
        } catch (_) {}
        const uniqueFonts = [...new Map(loadedFonts.map(f => [`${f.family}|${f.weight}|${f.style}`, f])).values()];

        return {
            typography, buttons, navigation, hero,
            colors: { backgrounds: Array.from(bgColors), texts: Array.from(textColors), borders: Array.from(borderColors) },
            cssVariables, layoutPatterns, footer, fonts: uniqueFonts
        };
    });
}

// ─── Page Architecture Extraction (NEW) ────────────────────────
async function extractPageArchitecture(page) {
    return await page.evaluate(() => {
        const getStyles = (el) => {
            try { return window.getComputedStyle(el); } catch (_) { return null; }
        };

        // ━━━ 1. HEADER BEHAVIOR ━━━
        let headerAnalysis = {
            type: 'unknown',
            isFixed: false,
            isSticky: false,
            isTransparent: false,
            hasBackdropBlur: false,
            height: 0,
            logoPosition: 'left', // left, center, right
            navLinkCount: 0,
            hasHamburger: false,
        };

        const header = document.querySelector('header, [role="banner"], nav:first-of-type');
        if (header) {
            const hs = getStyles(header);
            if (hs) {
                const pos = hs.position;
                headerAnalysis.isFixed = pos === 'fixed';
                headerAnalysis.isSticky = pos === 'sticky';

                const bg = hs.backgroundColor || '';
                headerAnalysis.isTransparent = (
                    bg.includes('rgba(0, 0, 0, 0)') ||
                    bg.includes('transparent') ||
                    bg === 'rgba(0, 0, 0, 0)' ||
                    (bg.includes('rgba') && parseFloat(bg.split(',').pop()) < 0.3)
                );

                const bf = hs.backdropFilter || hs.webkitBackdropFilter || '';
                headerAnalysis.hasBackdropBlur = bf.includes('blur');

                headerAnalysis.height = header.offsetHeight || 0;

                // Logo position detection
                const logo = header.querySelector('[class*="logo"], [class*="brand"], a:first-child');
                if (logo) {
                    const logoRect = logo.getBoundingClientRect();
                    const headerRect = header.getBoundingClientRect();
                    const logoCenter = logoRect.left + logoRect.width / 2;
                    const headerCenter = headerRect.left + headerRect.width / 2;
                    const tolerance = headerRect.width * 0.15;
                    if (Math.abs(logoCenter - headerCenter) < tolerance) {
                        headerAnalysis.logoPosition = 'center';
                    } else if (logoCenter > headerCenter) {
                        headerAnalysis.logoPosition = 'right';
                    } else {
                        headerAnalysis.logoPosition = 'left';
                    }
                }

                // Count visible nav links
                const navLinks = header.querySelectorAll('a');
                headerAnalysis.navLinkCount = Array.from(navLinks).filter(a => {
                    const s = getStyles(a);
                    return s && s.display !== 'none' && s.visibility !== 'hidden' && a.offsetHeight > 0;
                }).length;

                // Hamburger detection
                const hamburgerSelectors = [
                    '[class*="hamburger"]', '[class*="burger"]', '[class*="menu-toggle"]',
                    '[class*="mobile-menu"]', '[aria-label*="menu"]', '[aria-label*="Menu"]',
                    'button svg', '[class*="toggle"]'
                ];
                headerAnalysis.hasHamburger = hamburgerSelectors.some(sel => {
                    try { return !!header.querySelector(sel); } catch (_) { return false; }
                });

                // Determine header type
                if (headerAnalysis.isTransparent && headerAnalysis.isFixed) {
                    headerAnalysis.type = 'transparent-fixed';
                } else if (headerAnalysis.isTransparent) {
                    headerAnalysis.type = 'transparent-static';
                } else if (headerAnalysis.isFixed && headerAnalysis.hasBackdropBlur) {
                    headerAnalysis.type = 'glass-fixed';
                } else if (headerAnalysis.isFixed) {
                    headerAnalysis.type = 'solid-fixed';
                } else if (headerAnalysis.isSticky) {
                    headerAnalysis.type = 'sticky';
                } else {
                    headerAnalysis.type = 'static';
                }
            }
        }

        // ━━━ 2. HERO ANALYSIS ━━━
        let heroAnalysis = {
            type: 'unknown',
            isFullscreen: false,
            hasVideo: false,
            hasImage: false,
            textPosition: 'center', // left, center, right, overlay
            textAlignment: 'left',
            headlineWordCount: 0,
            hasSubtitle: false,
            hasCta: false,
            ctaCount: 0,
        };

        const heroEl = document.querySelector(
            '[class*="hero"], [class*="banner"], [class*="masthead"], [class*="splash"], section:first-of-type, main > section:first-child, main > div:first-child'
        );
        if (heroEl) {
            const heroRect = heroEl.getBoundingClientRect();
            heroAnalysis.isFullscreen = heroRect.height >= window.innerHeight * 0.85;

            heroAnalysis.hasVideo = !!(heroEl.querySelector('video') || heroEl.querySelector('[class*="video"]'));
            heroAnalysis.hasImage = !!(
                heroEl.querySelector('img') ||
                heroEl.querySelector('[class*="image"]') ||
                (getStyles(heroEl)?.backgroundImage && getStyles(heroEl).backgroundImage !== 'none')
            );

            const heroH1 = heroEl.querySelector('h1, [class*="title"], [class*="heading"]');
            if (heroH1) {
                const text = heroH1.textContent?.trim() || '';
                heroAnalysis.headlineWordCount = text.split(/\s+/).filter(Boolean).length;
                const hs = getStyles(heroH1);
                if (hs) {
                    heroAnalysis.textAlignment = hs.textAlign || 'left';
                }
            }

            heroAnalysis.hasSubtitle = !!(heroEl.querySelector('p, [class*="subtitle"], [class*="description"], [class*="subheading"]'));

            const ctas = heroEl.querySelectorAll('a[class*="btn"], a[class*="cta"], a[class*="button"], button[class*="btn"], button[class*="cta"]');
            heroAnalysis.ctaCount = ctas.length;
            heroAnalysis.hasCta = ctas.length > 0;

            // Text position relative to hero
            if (heroH1) {
                const h1Rect = heroH1.getBoundingClientRect();
                const heroCenterX = heroRect.left + heroRect.width / 2;
                const h1CenterX = h1Rect.left + h1Rect.width / 2;
                if (h1CenterX < heroRect.left + heroRect.width * 0.35) {
                    heroAnalysis.textPosition = 'left';
                } else if (h1CenterX > heroRect.left + heroRect.width * 0.65) {
                    heroAnalysis.textPosition = 'right';
                } else {
                    heroAnalysis.textPosition = 'center';
                }

                // Check if text overlaps an image
                const heroImg = heroEl.querySelector('img, video');
                if (heroImg) {
                    const imgRect = heroImg.getBoundingClientRect();
                    if (h1Rect.top < imgRect.bottom && h1Rect.bottom > imgRect.top &&
                        h1Rect.left < imgRect.right && h1Rect.right > imgRect.left) {
                        heroAnalysis.textPosition = 'overlay';
                    }
                }
            }

            // Determine hero type
            if (heroAnalysis.hasVideo && heroAnalysis.isFullscreen) {
                heroAnalysis.type = 'fullscreen-video';
            } else if (heroAnalysis.hasVideo) {
                heroAnalysis.type = 'video';
            } else if (heroAnalysis.isFullscreen && heroAnalysis.hasImage) {
                heroAnalysis.type = 'fullscreen-image';
            } else if (heroAnalysis.hasImage && heroAnalysis.textPosition === 'overlay') {
                heroAnalysis.type = 'image-text-overlay';
            } else if (heroAnalysis.hasImage) {
                heroAnalysis.type = 'image-text-split';
            } else {
                heroAnalysis.type = 'text-only';
            }
        }

        // ━━━ 3. SECTION ORDER & TYPES ━━━
        const sectionAnalysis = [];
        const mainContent = document.querySelector('main') || document.body;
        const topLevelSections = mainContent.querySelectorAll(':scope > section, :scope > div[class], :scope > article');

        topLevelSections.forEach((section, index) => {
            if (index > 12) return; // Cap at 12 sections
            try {
                const s = getStyles(section);
                if (!s || s.display === 'none') return;

                const rect = section.getBoundingClientRect();
                if (rect.height < 50) return;

                const hasImages = section.querySelectorAll('img, picture, video').length;
                const hasGrid = s.display === 'grid' || !!section.querySelector('[class*="grid"]');
                const hasFlex = s.display === 'flex' || !!section.querySelector('[class*="flex"]');
                const hasHeading = !!section.querySelector('h1, h2, h3');
                const hasLinks = section.querySelectorAll('a').length;
                const hasParagraphs = section.querySelectorAll('p').length;
                const hasCards = section.querySelectorAll('[class*="card"], [class*="product"], [class*="item"]').length;
                const hasForm = !!section.querySelector('form, input[type="email"], [class*="newsletter"]');
                const hasQuote = !!section.querySelector('blockquote, [class*="quote"], [class*="testimonial"]');

                const className = section.className || '';
                const id = section.id || '';
                const combined = (className + ' ' + id).toLowerCase();

                // Classify section type
                let sectionType = 'unknown';
                if (index === 0 && (combined.match(/hero|banner|masthead|splash/) || rect.height > window.innerHeight * 0.7)) {
                    sectionType = 'hero';
                } else if (combined.match(/product|collection|shop|catalog/) || hasCards >= 3) {
                    sectionType = 'product-grid';
                } else if (combined.match(/feature|highlight|showcase/) && hasImages >= 2) {
                    sectionType = 'featured';
                } else if (combined.match(/about|story|heritage|craft|history/)) {
                    sectionType = 'editorial-story';
                } else if (combined.match(/categor|navigation/) && hasLinks >= 3 && hasImages >= 2) {
                    sectionType = 'category-nav';
                } else if (hasQuote || combined.match(/quote|testimonial|review/)) {
                    sectionType = 'testimonial';
                } else if (hasForm || combined.match(/newsletter|subscribe|signup|email/)) {
                    sectionType = 'newsletter';
                } else if (hasImages === 1 && hasParagraphs > 0 && hasHeading) {
                    sectionType = 'editorial-split';
                } else if (hasImages >= 1 && !hasHeading && hasParagraphs === 0) {
                    sectionType = 'full-bleed-image';
                } else if (hasImages >= 2 && hasGrid) {
                    sectionType = 'image-grid';
                } else if (hasHeading && hasParagraphs > 0 && hasImages === 0) {
                    sectionType = 'text-section';
                } else if (hasCards >= 2) {
                    sectionType = 'card-grid';
                } else {
                    sectionType = 'mixed-content';
                }

                const bg = s.backgroundColor || '';
                const isDark = bg.includes('rgb(0,') || bg.includes('rgb(0, 0, 0)') ||
                    bg.includes('rgb(17,') || bg.includes('rgb(18,') ||
                    bg.includes('rgb(20,') || bg.includes('rgb(25,') ||
                    bg.includes('rgb(29,') || bg.includes('rgb(30,') ||
                    bg.includes('rgb(33,') || bg.includes('rgb(34,');

                sectionAnalysis.push({
                    index,
                    type: sectionType,
                    heightPx: Math.round(rect.height),
                    heightVh: Math.round((rect.height / window.innerHeight) * 100),
                    imageCount: hasImages,
                    hasGrid,
                    hasFlex,
                    cardCount: hasCards,
                    isDarkBackground: isDark,
                    backgroundColor: bg !== 'rgba(0, 0, 0, 0)' ? bg : null,
                });
            } catch (_) {}
        });

        // ━━━ 4. FOOTER ARCHITECTURE ━━━
        let footerAnalysis = {
            type: 'unknown',
            isDark: false,
            columnCount: 0,
            hasNewsletter: false,
            hasSocialLinks: false,
            hasStoreLocator: false,
            hasBrandStatement: false,
            linkCount: 0,
            heightPx: 0,
        };

        const footerEl = document.querySelector('footer');
        if (footerEl) {
            const fs = getStyles(footerEl);
            if (fs) {
                footerAnalysis.heightPx = footerEl.offsetHeight || 0;

                const bg = fs.backgroundColor || '';
                footerAnalysis.isDark = (
                    bg.includes('rgb(0,') || bg.includes('rgb(0, 0, 0)') ||
                    bg.includes('#000') || bg.includes('rgb(17,') ||
                    bg.includes('rgb(18,') || bg.includes('rgb(20,') ||
                    bg.includes('rgb(25,') || bg.includes('rgb(30,') ||
                    bg.includes('rgb(33,') || bg.includes('rgb(34,') ||
                    bg.includes('rgb(35,') || bg.includes('rgb(42,') ||
                    bg.includes('rgb(43,') || bg.includes('rgb(44,') ||
                    bg.includes('rgb(45,')
                );

                // Count grid/flex columns
                const footerInner = footerEl.querySelector(':scope > div, :scope > nav, :scope > ul');
                if (footerInner) {
                    const fis = getStyles(footerInner);
                    if (fis) {
                        if (fis.display === 'grid' && fis.gridTemplateColumns) {
                            footerAnalysis.columnCount = fis.gridTemplateColumns.split(/\s+/).length;
                        } else if (fis.display === 'flex') {
                            footerAnalysis.columnCount = footerInner.children.length;
                        }
                    }
                }
                // Also check deeper nesting
                if (footerAnalysis.columnCount === 0) {
                    const deepGrid = footerEl.querySelector('[class*="grid"], [class*="columns"], [class*="row"]');
                    if (deepGrid) {
                        const dgs = getStyles(deepGrid);
                        if (dgs && dgs.display === 'grid') {
                            footerAnalysis.columnCount = dgs.gridTemplateColumns.split(/\s+/).length;
                        } else if (dgs && dgs.display === 'flex') {
                            footerAnalysis.columnCount = deepGrid.children.length;
                        }
                    }
                }

                footerAnalysis.linkCount = footerEl.querySelectorAll('a').length;
                footerAnalysis.hasNewsletter = !!(footerEl.querySelector('form, input[type="email"], [class*="newsletter"], [class*="subscribe"]'));
                footerAnalysis.hasSocialLinks = !!(footerEl.querySelector('[class*="social"], [class*="instagram"], [class*="facebook"], [class*="twitter"], [aria-label*="social"], [aria-label*="Instagram"]'));
                footerAnalysis.hasStoreLocator = !!(footerEl.querySelector('[class*="store"], [class*="location"], [class*="find"]'));
                footerAnalysis.hasBrandStatement = !!(footerEl.querySelector('h2, h3, [class*="brand"], [class*="statement"], blockquote'));

                // Classify footer type
                if (footerAnalysis.hasNewsletter && footerAnalysis.columnCount >= 3) {
                    footerAnalysis.type = 'newsletter-rich';
                } else if (footerAnalysis.isDark && footerAnalysis.columnCount >= 4) {
                    footerAnalysis.type = 'dark-comprehensive';
                } else if (footerAnalysis.isDark && footerAnalysis.columnCount < 3) {
                    footerAnalysis.type = 'dark-minimal';
                } else if (footerAnalysis.linkCount <= 6 && footerAnalysis.columnCount <= 1) {
                    footerAnalysis.type = 'ultra-minimal';
                } else if (footerAnalysis.columnCount >= 4) {
                    footerAnalysis.type = 'multi-column';
                } else {
                    footerAnalysis.type = 'standard';
                }
            }
        }

        // ━━━ 5. OVERALL PAGE METRICS ━━━
        const pageMetrics = {
            totalHeight: document.body.scrollHeight,
            viewportHeight: window.innerHeight,
            sectionCount: sectionAnalysis.length,
            totalImages: document.querySelectorAll('img, picture source').length,
            totalVideos: document.querySelectorAll('video, [class*="video-player"]').length,
            totalLinks: document.querySelectorAll('a').length,
            hasStickyElements: !!document.querySelector('[style*="position: sticky"], [style*="position: fixed"]'),
        };

        return {
            header: headerAnalysis,
            hero: heroAnalysis,
            sections: sectionAnalysis,
            sectionOrder: sectionAnalysis.map(s => s.type),
            footer: footerAnalysis,
            metrics: pageMetrics,
        };
    });
}

// ─── Haupt-Extraktion pro URL ──────────────────────────────────
async function processUrl(url, browser, index, total) {
    const parsedUrl = new URL(url);
    const domain = parsedUrl.hostname.replace(/^www\./, '');
    const tag = `[${index}/${total}] [${domain}]`;

    console.log(`\n🔥 ${tag} Starte DEEP EXTRACTION...`);

    const siteDir = path.join(OUTPUT_DIR, domain);
    await fs.mkdir(siteDir, { recursive: true });

    let context = null;
    let playwrightOk = false;

    // ━━━ Phase 1: Playwright (Screenshot + Design Tokens) ━━━
    try {
        console.log(`${tag} 1/6 Lade Seite...`);
        context = await browser.newContext({
            viewport: { width: 1920, height: 1080 },
            deviceScaleFactor: 2,
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            locale: 'en-US',
            timezoneId: 'America/New_York'
        });
        const page = await context.newPage();

        // Blockiere nur Audio. Videos (mp4/webm) zulassen, damit sie im Screenshot als Bild auftauchen
        await page.route('**/*.{ogg,mp3,wav}', route => route.abort());

        // domcontentloaded statt networkidle — Shopify/Analytics werden nie idle
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        // JS-Frameworks Zeit zum Rendern geben
        await page.waitForTimeout(5000);

        console.log(`${tag} 2/6 Entferne Cookie-Banner & Overlays...`);
        await removeOverlays(page);
        await page.waitForTimeout(800);

        console.log(`${tag} 3/6 Deep-Scroll für Lazy-Loading...`);
        await autoScroll(page);

        // Warte bis alle Bilder (auch Lazy-Loaded) fertig geladen sind
        await page.evaluate(async () => {
            const images = Array.from(document.querySelectorAll('img'));
            await Promise.all(images.map(img => {
                if (img.complete) return Promise.resolve();
                return new Promise(resolve => {
                    img.addEventListener('load', resolve, { once: true });
                    img.addEventListener('error', resolve, { once: true });
                    setTimeout(resolve, 5000);
                });
            }));
        });

        // Zurück nach oben
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(2000);

        // Overlays nochmal entfernen (manche laden nach Scroll neu)
        await removeOverlays(page);
        await page.waitForTimeout(500);

        console.log(`${tag} 4/7 Extrahiere Design-Tokens...`);
        const designTokens = await extractDesignTokens(page);

        await fs.writeFile(
            path.join(siteDir, 'styles.json'),
            JSON.stringify({ source: url, domain, timestamp: new Date().toISOString(), tokens: designTokens }, null, 2)
        );

        console.log(`${tag} 5/7 Extrahiere Page Architecture...`);
        const architecture = await extractPageArchitecture(page);

        await fs.writeFile(
            path.join(siteDir, 'architecture.json'),
            JSON.stringify({ source: url, domain, timestamp: new Date().toISOString(), architecture }, null, 2)
        );

        console.log(`${tag} 6/7 Erstelle Screenshots (2x Retina)...`);

        // Scroll-Locks und Fixed-Elemente bereinigen für sauberen Full-Page-Screenshot
        await page.evaluate(() => {
            if (!document.body || !document.documentElement) return;
            document.body.style.overflow = 'visible';
            document.body.style.height = 'auto';
            document.body.style.maxHeight = 'none';
            document.documentElement.style.overflow = 'visible';
            document.documentElement.style.height = 'auto';
            document.documentElement.style.maxHeight = 'none';
            // Sticky/Fixed-Elemente neutralisieren (verhindern Duplikation im Screenshot)
            document.querySelectorAll('*').forEach(el => {
                try {
                    const s = window.getComputedStyle(el);
                    if (s && (s.position === 'fixed' || s.position === 'sticky') && el.style) {
                        el.style.position = 'absolute';
                    }
                } catch (_) {}
            });
            // Videos pausieren, damit sie wie ein statisches Bild gerendert werden
            document.querySelectorAll('video').forEach(v => {
                try { v.pause(); } catch (_) {}
            });
        });

        // Above-the-Fold Viewport-Screenshot
        await page.screenshot({
            path: path.join(siteDir, 'viewport.png'),
            fullPage: false,
            animations: 'disabled'
        });

        // Full-Page-Screenshot
        await page.screenshot({
            path: path.join(siteDir, 'screenshot.png'),
            fullPage: true,
            animations: 'disabled',
            timeout: 30000
        });

        playwrightOk = true;

    } catch (error) {
        console.error(`❌ ${tag} [PLAYWRIGHT]:`, error.message.split('\n')[0]);
        await fs.appendFile('error.log', `${new Date().toISOString()} - [PLAYWRIGHT] ${url}: ${error.message}\n`).catch(() => {});
    } finally {
        if (context) {
            try { await context.close(); } catch (_) {}
        }
    }

    // ━━━ Phase 2: Firecrawl (Sauberer Markdown-Content) ━━━
    try {
        console.log(`${tag} 7/7 Firecrawl...`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 35000); // 35s Hard-Timeout für Fetch

        const firecrawlResponse = await fetch('https://api.api.firecrawl.dev/v1/scrape'.replace('.api.', '.'), {
            method: 'POST',
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.FIRECRAWL_API_KEY}`
            },
            body: JSON.stringify({
                url: url,
                formats: ['markdown', 'html'],
                onlyMainContent: true,
                waitFor: 5000,
                timeout: 30000,
                excludeTags: ['nav', 'footer', 'select', 'option', 'noscript', 'iframe', 'script', 'style',
                    '[class*="cookie"]', '[class*="consent"]', '[class*="popup"]', '[class*="klaviyo"]',
                    '[id*="cookie"]', '[id*="consent"]']
            })
        });
        clearTimeout(timeoutId);

        const scrapeResult = await firecrawlResponse.json();

        if (!firecrawlResponse.ok || !scrapeResult.success) {
            throw new Error(`Firecrawl: ${scrapeResult.error || firecrawlResponse.statusText}`);
        }

        if (scrapeResult.data?.markdown) {
            await fs.writeFile(path.join(siteDir, 'content.md'), scrapeResult.data.markdown);
        }
        if (scrapeResult.data?.html) {
            await fs.writeFile(path.join(siteDir, 'content.html'), scrapeResult.data.html);
        }
        if (scrapeResult.data?.metadata) {
            await fs.writeFile(path.join(siteDir, 'metadata.json'), JSON.stringify(scrapeResult.data.metadata, null, 2));
        }

        console.log(`✅ ${tag} Komplett!`);
        return true;

    } catch (error) {
        console.error(`❌ ${tag} [FIRECRAWL]:`, error.message.split('\n')[0]);
        await fs.appendFile('error.log', `${new Date().toISOString()} - [FIRECRAWL] ${url}: ${error.message}\n`).catch(() => {});
        if (playwrightOk) {
            console.log(`⚠️  ${tag} Playwright war OK — nur Firecrawl fehlgeschlagen.`);
        }
        return playwrightOk;
    }
}

// ─── Browser Health Check ──────────────────────────────────────
async function isBrowserAlive(browser) {
    try {
        const ctx = await browser.newContext();
        await ctx.close();
        return true;
    } catch (_) {
        return false;
    }
}

// ─── Absolute Timeout Wrapper für processUrl ───────────────────
async function processUrlWithTimeout(url, browser, index, total) {
    const timeoutMs = 90000; // 90 Sekunden MAX pro Seite
    return Promise.race([
        processUrl(url, browser, index, total),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout: Seite hing länger als ${timeoutMs/1000}s`)), timeoutMs))
    ]).catch(async (error) => {
        const domain = new URL(url).hostname.replace(/^www\./, '');
        console.error(`❌ [${index}/${total}] [${domain}] ABGEBROCHEN:`, error.message);
        await fs.appendFile('error.log', `${new Date().toISOString()} - [TIMEOUT] ${url}: ${error.message}\n`).catch(() => {});
        return false;
    });
}

// ─── Concurrency Helper: Verarbeite N URLs gleichzeitig ────────
async function processBatch(urls, browser, startIndex, total) {
    return Promise.allSettled(
        urls.map((url, i) => processUrlWithTimeout(url, browser, startIndex + i, total))
    );
}

// ─── Main ──────────────────────────────────────────────────────
async function main() {
    try {
        await fs.mkdir(OUTPUT_DIR, { recursive: true });

        const fileContent = await fs.readFile('missing_sites.txt', 'utf-8');
        let urls = fileContent.split('\n')
            .map(line => line.trim().replace(/\\+$/, ''))
            .filter(line => line.startsWith('http'));

        // Removed resume logic to process all URLs

        if (urls.length === 0) {
            console.log('Keine gültigen URLs in sites.txt gefunden.');
            return;
        }

        console.log(`📋 ${urls.length} URLs gefunden.`);
        console.log(`⚡ Concurrency: ${CONCURRENCY} Seiten gleichzeitig`);
        console.log(`🚀 Starte Deep Extraction Pipeline...\n`);

        let browser = await chromium.launch({ headless: true });
        activeBrowser = browser;

        let successCount = 0;
        let errorCount = 0;
        const startTime = Date.now();

        // Verarbeite in Batches von CONCURRENCY
        for (let i = 0; i < urls.length; i += CONCURRENCY) {
            if (shuttingDown) break;

            const batch = urls.slice(i, i + CONCURRENCY);
            console.log(`\n${'═'.repeat(60)}`);
            console.log(`📦 Batch ${Math.floor(i / CONCURRENCY) + 1}/${Math.ceil(urls.length / CONCURRENCY)} — URLs ${i + 1}-${Math.min(i + CONCURRENCY, urls.length)} von ${urls.length}`);
            console.log(`${'═'.repeat(60)}`);

            // Browser Health Check vor jedem Batch
            if (!(await isBrowserAlive(browser))) {
                console.log('🔄 Browser gecrasht – starte neuen Browser...');
                try { await browser.close(); } catch (_) {}
                browser = await chromium.launch({ headless: true });
                activeBrowser = browser;
            }

            const results = await processBatch(batch, browser, i + 1, urls.length);

            results.forEach(r => {
                if (r.status === 'fulfilled' && r.value) successCount++;
                else errorCount++;
            });

            const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
            const done = Math.min(i + CONCURRENCY, urls.length);
            const eta = ((Date.now() - startTime) / done * (urls.length - done) / 1000 / 60).toFixed(1);
            console.log(`\n📊 Fortschritt: ${done}/${urls.length} | ✅ ${successCount} | ❌ ${errorCount} | ⏱ ${elapsed}s | ETA: ~${eta}min`);
        }

        try { await browser.close(); } catch (_) {}

        const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
        console.log(`\n\n${'═'.repeat(60)}`);
        console.log(`🚀 EXTRAKTION ABGESCHLOSSEN in ${totalTime} Minuten!`);
        console.log(`   ✅ Erfolgreich: ${successCount}/${urls.length}`);
        console.log(`   ❌ Fehler: ${errorCount}/${urls.length}`);
        console.log(`   📁 Daten: ${OUTPUT_DIR}/`);
        console.log(`${'═'.repeat(60)}`);

    } catch (error) {
        console.error('Kritischer Fehler:', error);
    }
}

main();