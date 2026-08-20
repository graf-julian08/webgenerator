import puppeteer from 'puppeteer';
import fs from 'fs';
import { fileURLToPath } from 'url';

const MAX_DOM_CHARS = 12000; // Cap extracted DOM to save tokens & avoid noise

async function extractDOM(url, selector) {
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    
    await page.setViewport({ width: 1440, height: 900 });
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log(`Navigating to ${url}...`);
    try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    } catch (e) {
        console.log(`Warning: Navigation timeout or error: ${e.message}`);
    }

    console.log(`Extracting selector: ${selector}`);
    
    try {
        await page.waitForSelector(selector, { timeout: 5000 });
    } catch (e) {
        console.error(`Selector ${selector} not found on ${url}`);
        await browser.close();
        return null;
    }

    const extractedHTML = await page.evaluate((sel) => {
        const root = document.querySelector(sel);
        if (!root) return null;

        // We need LAYOUT and TYPOGRAPHY properties to perfectly clone luxury aesthetics
        const layoutStyles = [
            'display', 'flex-direction', 'justify-content', 'align-items', 'flex-wrap', 'gap',
            'grid-template-columns', 'grid-template-rows', 'grid-column', 'grid-row',
            'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
            'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
            'max-width', 'min-height', 'width', 'height',
            'position', 'z-index', 'top', 'bottom', 'left', 'right',
            'border-radius', 'aspect-ratio', 'overflow',
            'font-size', 'font-weight', 'letter-spacing', 'text-transform', 'line-height',
            'text-align', 'border', 'opacity'
        ];

        const defaults = {
            'display': 'block', 'flex-direction': 'row', 'justify-content': 'normal',
            'align-items': 'normal', 'flex-wrap': 'nowrap', 'gap': 'normal',
            'position': 'static', 'z-index': 'auto', 'border-radius': '0px',
            'padding-top': '0px', 'padding-right': '0px', 'padding-bottom': '0px', 'padding-left': '0px',
            'margin-top': '0px', 'margin-bottom': '0px',
            'overflow': 'visible', 'aspect-ratio': 'auto'
        };

        let nodeCount = 0;
        const MAX_NODES = 150; // Hard limit on DOM depth

        function processNode(node, depth) {
            if (nodeCount >= MAX_NODES) return null;
            if (depth > 8) return null; // Limit nesting depth

            if (node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent.trim();
                return text && text.length < 100 ? `[TEXT]` : null; // Replace text with placeholder
            }

            if (node.nodeType !== Node.ELEMENT_NODE) return null;

            const computed = window.getComputedStyle(node);
            if (computed.display === 'none' || computed.visibility === 'hidden') return null;

            const tagName = node.tagName.toLowerCase();
            
            if (tagName === 'svg') return '<svg>[ICON]</svg>';
            if (tagName === 'img') return '<img alt="[IMAGE]" />';
            if (tagName === 'video') return '<video>[VIDEO]</video>';
            if (tagName === 'picture') return '<picture>[IMAGE]</picture>';
            if (['script', 'style', 'link', 'meta', 'noscript', 'iframe'].includes(tagName)) return null;

            nodeCount++;

            let styles = [];
            layoutStyles.forEach(prop => {
                const val = computed.getPropertyValue(prop);
                if (val && val !== defaults[prop] && val !== 'none' && val !== 'auto' && val !== '0px' && val !== 'normal') {
                    // Convert absolute pixel values to relative where possible
                    styles.push(`${prop}: ${val}`);
                }
            });

            const styleStr = styles.length > 0 ? ` style="${styles.join('; ')}"` : '';
            
            let childrenStr = '';
            for (let child of node.childNodes) {
                const childRes = processNode(child, depth + 1);
                if (childRes) childrenStr += childRes;
            }

            return `<${tagName}${styleStr}>${childrenStr}</${tagName}>`;
        }

        return processNode(root, 0);
    }, selector);

    await browser.close();

    // Post-process: truncate if too long
    if (extractedHTML && extractedHTML.length > MAX_DOM_CHARS) {
        console.log(`   ✂️ Truncated DOM from ${extractedHTML.length} to ${MAX_DOM_CHARS} chars`);
        return extractedHTML.slice(0, MAX_DOM_CHARS);
    }

    return extractedHTML;
}

const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] === __filename) {
    const url = process.argv[2] || 'https://www.apple.com/mac/';
    const selector = process.argv[3] || 'main section:nth-of-type(1)';
    extractDOM(url, selector).then(res => {
        if (res) {
            fs.writeFileSync('extracted.html', res);
            console.log('Saved to extracted.html. Length:', res.length);
        }
    });
}

export { extractDOM };
