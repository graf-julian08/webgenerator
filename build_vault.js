#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
// AI-CRAWLED COMPONENT VAULT BUILDER v2 — STEALTH + ASYNC
// Aggressive parallel crawling with anti-detection bypass.
// ═══════════════════════════════════════════════════════════════════
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

puppeteer.use(StealthPlugin());

const __dirname = fileURLToPath(new URL('.', import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const KIMI_API_KEY = process.env.KIMI_API_KEY;
const KIMI_BASE = 'https://api.moonshot.ai/v1';
const VAULT_DIR = path.join(__dirname, 'component_vault');
const CONCURRENCY = 3; // parallel browser tabs
const TARGET_PER_TYPE = 55; // aim for 55 to guarantee 50+

const USER_AGENTS = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0',
];

const SECTION_CONFIG = {
    hero: {
        selectors: ['[class*="hero" i]','[class*="banner" i]','[class*="landing" i]','[class*="splash" i]',
            'main > section:first-of-type','main > div:first-of-type','section:first-of-type',
            '#hero','[data-section="hero"]','body > div:nth-child(2) > div:first-child'],
        desc: 'Full-screen hero with headline, subtext, CTA, background image',
    },
    navbar: {
        selectors: ['header','nav','[class*="header" i]','[class*="navbar" i]','[class*="nav-bar" i]',
            '[class*="navigation" i]','[role="banner"]','#header'],
        desc: 'Navigation bar with logo, links, actions',
    },
    product_grid: {
        selectors: ['[class*="product" i]','[class*="collection" i]','[class*="catalog" i]',
            '[class*="shop-grid" i]','[class*="item-grid" i]','[class*="featured" i]',
            'main section:nth-of-type(2)','main section:nth-of-type(3)','[class*="grid" i]'],
        desc: 'Product listing grid with items, images, names, prices',
    },
    story: {
        selectors: ['[class*="story" i]','[class*="about" i]','[class*="editorial" i]',
            '[class*="feature" i]','[class*="highlight" i]','[class*="brand" i]',
            'main section:nth-of-type(3)','main section:nth-of-type(4)',
            'main > div:nth-of-type(3)','main > div:nth-of-type(4)'],
        desc: 'Brand story / editorial section with text and imagery',
    },
    footer: {
        selectors: ['footer','[class*="footer" i]','[role="contentinfo"]','#footer'],
        desc: 'Site footer with links, newsletter, copyright',
    },
};

let totalTokens = 0, totalCost = 0;

// ── DOM EXTRACTION ────────────────────────────────────────────────
async function extractSection(page, selectors) {
    for (const sel of selectors) {
        try {
            const el = await page.$(sel);
            if (!el) continue;
            const html = await page.evaluate((s) => {
                const root = document.querySelector(s);
                if (!root) return null;
                const rect = root.getBoundingClientRect();
                if (rect.height < 40) return null; // too small

                const props = ['display','flex-direction','justify-content','align-items','flex-wrap','gap',
                    'grid-template-columns','padding-top','padding-right','padding-bottom','padding-left',
                    'margin-top','margin-bottom','max-width','min-height','width','height',
                    'position','z-index','border-radius','overflow',
                    'font-size','font-weight','letter-spacing','text-transform','line-height','text-align','opacity'];
                const defs = {'display':'block','flex-direction':'row','justify-content':'normal','align-items':'normal',
                    'flex-wrap':'nowrap','gap':'normal','position':'static','z-index':'auto','border-radius':'0px',
                    'padding-top':'0px','padding-right':'0px','padding-bottom':'0px','padding-left':'0px',
                    'margin-top':'0px','margin-bottom':'0px','overflow':'visible','opacity':'1',
                    'font-weight':'400','text-align':'start','letter-spacing':'normal','text-transform':'none'};
                let nc = 0;
                function proc(n, d) {
                    if (nc >= 120 || d > 6) return null;
                    if (n.nodeType === 3) { const t = n.textContent.trim(); return t && t.length < 200 ? '[TEXT]' : null; }
                    if (n.nodeType !== 1) return null;
                    const cs = window.getComputedStyle(n);
                    if (cs.display === 'none' || cs.visibility === 'hidden') return null;
                    const tag = n.tagName.toLowerCase();
                    if (tag === 'svg') return '<svg>[ICON]</svg>';
                    if (tag === 'img') return '<img alt="[IMAGE]" />';
                    if (tag === 'video') return '<video>[VIDEO]</video>';
                    if (tag === 'picture') return '<picture>[IMAGE]</picture>';
                    if (['script','style','link','meta','noscript','iframe','canvas'].includes(tag)) return null;
                    nc++;
                    let st = [];
                    props.forEach(p => { const v = cs.getPropertyValue(p); if (v && v !== defs[p] && v !== 'none' && v !== 'auto' && v !== '0px' && v !== 'normal') st.push(`${p}:${v}`); });
                    const ss = st.length ? ` style="${st.join(';')}"` : '';
                    let ch = '';
                    for (let c of n.childNodes) { const r = proc(c, d+1); if (r) ch += r; }
                    return `<${tag}${ss}>${ch}</${tag}>`;
                }
                return proc(root, 0);
            }, sel);
            if (html && html.length > 100) return html.length > 6000 ? html.slice(0, 6000) : html;
        } catch { continue; }
    }
    return null;
}

// ── KIMI TRANSLATION ──────────────────────────────────────────────
const apiQueue = [];
let apiRunning = 0;
const MAX_API_CONCURRENT = 2;

function queueApiCall(fn) {
    return new Promise((resolve, reject) => {
        apiQueue.push({ fn, resolve, reject });
        processApiQueue();
    });
}
function processApiQueue() {
    while (apiRunning < MAX_API_CONCURRENT && apiQueue.length > 0) {
        const { fn, resolve, reject } = apiQueue.shift();
        apiRunning++;
        fn().then(resolve).catch(reject).finally(() => { apiRunning--; processApiQueue(); });
    }
}

async function translateToReact(type, html, url) {
    const sys = `You are an elite React/Tailwind developer for luxury brands.
TASK: Translate scraped DOM into a PERFECT responsive React component.

RULES:
1. ANALYZE the design philosophy: proportions, hierarchy, spacing ratios, typography scale.
2. TRANSLATE the aesthetic FEEL into 100% original, responsive code. NOT a copy.
3. Convert ALL pixels to responsive Tailwind: 1440px→w-full max-w-7xl, 82px→text-6xl md:text-7xl lg:text-[82px], 120px padding→py-16 md:py-24 lg:py-32. Use sm:/md:/lg:/xl: breakpoints EVERYWHERE.
4. Component MUST accept TypeScript props:
   interface Props {
     content: { title?: string; subtitle?: string; description?: string; image?: string; images?: string[];
       items?: Array<{ name: string; price: string; image: string; description?: string }>;
       cta?: { text: string; href: string }; links?: Array<{ label: string; href: string }>; brandName?: string; };
     colors: { bg: string; text: string; accent: string };
   }
5. Add SUBTLE Framer Motion: fade-in (opacity 0→1), gentle slide-up (y:20→0). NO scale. CSS hover only.
6. NEVER include brand logos, fonts, copyrighted text. ALL content from props.
7. MUST be responsive on mobile/tablet/desktop. Use semantic HTML.
8. Start with "use client"; Import framer-motion. Export default.

SECTION: ${type} — ${SECTION_CONFIG[type].desc}
INSPIRATION: ${new URL(url).hostname} (design philosophy only, code must be 100% unique)

Return ONLY TSX code. No markdown. No explanations.`;

    for (let att = 1; att <= 5; att++) {
        try {
            const res = await fetch(`${KIMI_BASE}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${KIMI_API_KEY}` },
                body: JSON.stringify({ model: 'moonshot-v1-32k', messages: [{ role: 'system', content: sys }, { role: 'user', content: html }], temperature: 0.7, max_tokens: 8192 }),
            });
            if (!res.ok) {
                if ((res.status === 429 || res.status >= 500) && att < 5) {
                    await new Promise(r => setTimeout(r, 15000 * Math.pow(2, att - 1)));
                    continue;
                }
                throw new Error(`API ${res.status}`);
            }
            const d = await res.json();
            const u = d.usage || {};
            totalTokens += (u.total_tokens || 0);
            totalCost += ((u.prompt_tokens||0)/1e6*0.075) + ((u.completion_tokens||0)/1e6*0.30);
            let code = d.choices?.[0]?.message?.content || '';
            const cm = code.match(/```(?:tsx?|jsx?)?\n([\s\S]*?)```/);
            if (cm) code = cm[1];
            code = code.replace(/^```[a-z]*\n?/gm,'').replace(/```\s*$/gm,'').trim();
            const cs = code.search(/^["']use client["']|^import\s/m);
            if (cs > 0) code = code.slice(cs);
            if (!code.startsWith('"use client"') && !code.startsWith("'use client'")) code = `"use client";\n\n${code}`;
            code = code.replace(/import\s+Head\s+from\s+['"]next\/head['"];?\n?/g, '');
            return code;
        } catch (e) {
            if (att === 5) throw e;
            await new Promise(r => setTimeout(r, 5000));
        }
    }
}

// ── DISMISS COOKIE BANNERS ────────────────────────────────────────
async function dismissCookies(page) {
    const btns = ['[class*="cookie" i] button','[class*="consent" i] button','[class*="accept" i]',
        '#onetrust-accept-btn-handler','[data-action="accept"]','button[class*="agree" i]'];
    for (const sel of btns) {
        try { const b = await page.$(sel); if (b) { await b.click(); await new Promise(r=>setTimeout(r,500)); break; } } catch {}
    }
}

// ── PROCESS ONE SITE ──────────────────────────────────────────────
async function processSite(browser, url, manifest, counts, siteIdx, total) {
    const hostname = new URL(url).hostname;
    const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    let page;
    try {
        page = await browser.newPage();
        await page.setViewport({ width: 1440, height: 900 });
        await page.setUserAgent(ua);
        await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9', 'Accept': 'text/html,application/xhtml+xml', 'sec-ch-ua': '"Chromium";v="125"', 'sec-ch-ua-platform': '"macOS"' });
        // Human-like delay
        await new Promise(r => setTimeout(r, 500 + Math.random() * 1500));
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000));
        await dismissCookies(page);

        const results = [];
        for (const type of Object.keys(SECTION_CONFIG)) {
            if (counts[type] >= TARGET_PER_TYPE) continue;
            if (manifest[type]?.some(m => m.source === hostname)) continue;

            const html = await extractSection(page, SECTION_CONFIG[type].selectors);
            if (!html) { console.log(`   [${siteIdx}/${total}] ${hostname} → ${type}: ❌ not found`); continue; }
            console.log(`   [${siteIdx}/${total}] ${hostname} → ${type}: 🔍 ${html.length} chars`);

            results.push({ type, html, hostname, url });
        }
        await page.close().catch(()=>{});

        // Translate all found sections (queued to respect rate limits)
        for (const r of results) {
            if (counts[r.type] >= TARGET_PER_TYPE) continue;
            try {
                const code = await queueApiCall(() => translateToReact(r.type, r.html, r.url));
                if (!code || code.length < 200) continue;
                const num = String(counts[r.type] + 1).padStart(3, '0');
                const fname = `${r.type}_${num}.tsx`;
                await fs.writeFile(path.join(VAULT_DIR, r.type, fname), code);
                manifest[r.type].push({ file: fname, source: r.hostname, chars: code.length, timestamp: new Date().toISOString() });
                counts[r.type]++;
                console.log(`   [${siteIdx}/${total}] ${r.hostname} → ${r.type}: ✅ ${fname} (${counts[r.type]}/${TARGET_PER_TYPE})`);
                await fs.writeFile(path.join(VAULT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
            } catch (e) {
                console.log(`   [${siteIdx}/${total}] ${r.hostname} → ${r.type}: ❌ translate failed: ${e.message.slice(0,80)}`);
            }
        }
    } catch (e) {
        console.log(`   [${siteIdx}/${total}] ${hostname}: ⚠️ ${e.message.slice(0, 80)}`);
        if (page) await page.close().catch(()=>{});
    }
}

// ── MAIN ──────────────────────────────────────────────────────────
async function buildVault() {
    console.log(`\n🏛️  VAULT BUILDER V2 — STEALTH + ASYNC (${CONCURRENCY} parallel)\n`);

    const sitesRaw = await fs.readFile(path.join(__dirname, 'sites.txt'), 'utf8');
    const allSites = sitesRaw.split('\n').map(s => s.replace(/\\$/, '').trim()).filter(s => s.startsWith('http'));
    console.log(`   📋 ${allSites.length} sites loaded`);

    for (const t of Object.keys(SECTION_CONFIG)) await fs.mkdir(path.join(VAULT_DIR, t), { recursive: true });

    let manifest = {};
    try { manifest = JSON.parse(await fs.readFile(path.join(VAULT_DIR, 'manifest.json'), 'utf8')); } catch {}
    for (const t of Object.keys(SECTION_CONFIG)) if (!manifest[t]) manifest[t] = [];

    const counts = {};
    for (const t of Object.keys(SECTION_CONFIG)) counts[t] = manifest[t].length;
    console.log(`   📦 Existing: ${Object.entries(counts).map(([k,v])=>`${k}:${v}`).join(' ')}`);

    const shuffled = allSites.sort(() => Math.random() - 0.5);
    const startTime = Date.now();

    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox','--disable-setuid-sandbox','--disable-blink-features=AutomationControlled'] });

    // Process sites in parallel batches
    for (let i = 0; i < shuffled.length; i += CONCURRENCY) {
        const allDone = Object.keys(SECTION_CONFIG).every(t => counts[t] >= TARGET_PER_TYPE);
        if (allDone) { console.log('\n   🎉 All types have 55+ variants!'); break; }

        const batch = shuffled.slice(i, i + CONCURRENCY);
        await Promise.allSettled(batch.map((url, j) => processSite(browser, url, manifest, counts, i + j + 1, shuffled.length)));
    }

    await browser.close().catch(()=>{});

    const mins = ((Date.now() - startTime) / 60000).toFixed(1);
    console.log(`\n╔═══════════════════════════════════════════╗`);
    console.log(`║  🏛️  VAULT V2 COMPLETE                   ║`);
    for (const t of Object.keys(SECTION_CONFIG)) {
        const c = counts[t]; const s = c >= 50 ? '✅' : '⚠️';
        console.log(`║  ${s} ${t.padEnd(15)} ${String(c).padStart(3)} variants     ║`);
    }
    console.log(`║  ⏱️  ${mins} min | 🪙 ${totalTokens} tok | 💸 $${totalCost.toFixed(4)}  ║`);
    console.log(`╚═══════════════════════════════════════════╝\n`);
}

buildVault().catch(e => { console.error('💀', e); process.exit(1); });
