import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
dotenv.config({ path: __dirname + '.env' });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * @param {string} htmlFile - Path to extracted DOM HTML
 * @param {object} config - { role, componentName, designSystem, userPrompt, imageUrls }
 * @param {string} outputFile - Path to save the generated TSX
 * @returns {object} usageMetadata from Gemini
 */
async function translateToReact(htmlFile, config, outputFile) {
    const htmlContent = fs.readFileSync(htmlFile, 'utf8');
    const { role, componentName, designSystem, userPrompt, imageUrls = [] } = config;

    const imagesBlock = imageUrls.length > 0
        ? `\nIMAGE URLS (use these for all images, no placeholders):\n${imageUrls.map((u, i) => `  img${i + 1}: ${u}`).join('\n')}\n`
        : '\nFor images, use placeholder divs with bg-neutral-200 and aspect-ratio classes.\n';

    const systemPrompt = `You are a senior frontend engineer building a premium ${role} component for a Next.js 14 + Tailwind CSS website.

BRAND: ${userPrompt}

DESIGN SYSTEM (MANDATORY — use these exact Tailwind classes):
  Primary BG:    bg-brand-bg (${designSystem.bgPrimary})
  Secondary BG:  bg-brand-bg-alt (${designSystem.bgSecondary})
  Text Primary:  text-brand-text (${designSystem.textPrimary})
  Text Muted:    text-brand-text-muted (${designSystem.textSecondary})
  Accent:        text-brand-accent / bg-brand-accent (${designSystem.accent})
  Heading Font:  font-serif (mapped in tailwind.config)
  Body Font:     font-sans (default Tailwind)
  Spacing Scale: Use Tailwind spacing (p-4, p-6, p-8, py-16, py-24, py-32). NO arbitrary pixel values.
  Max Width:     max-w-7xl for content containers, full-width for backgrounds.
${imagesBlock}
YOUR TASK:
Below is a DOM layout skeleton scraped from a premium reference website.
It contains ONLY layout structure (flex, grid, padding, gap) with [TEXT] and [IMAGE] placeholders.
Your job: Use this layout structure as INSPIRATION for the spacing and composition,
but build a completely original ${role} component for the brand described above.

STRICT RULES:
1. Return ONLY valid TSX. No markdown, no explanations, no comments outside the code.
2. Export as: export default function ${componentName}()
3. FULLY RESPONSIVE: Use w-full, max-w-7xl mx-auto, responsive breakpoints (md:, lg:). NEVER use fixed pixel widths like width: 1440px.
4. Use ONLY the design system Tailwind classes above (bg-brand-bg, text-brand-text, etc). Do not invent new color classes.
5. Write all original text content matching the brand. NO leftover text from the reference site.
6. Use next/image for images with fill={true} and sizes prop. Wrap in relative containers with aspect-ratio.
7. For interactive components (navbar, search, menu): use "use client" directive, useState, and framer-motion AnimatePresence.
8. Keep the component self-contained. No external CSS files.
9. Use semantic HTML (nav, header, main, section, footer, article).
10. The layout proportions from the reference DOM are your GUIDE, not your bible. Adapt them to look perfect.
11. CRITICAL: When using next/link, do NOT nest <a> tags inside <Link>. In Next.js 14, Link renders its own <a>. Use <Link className="..."> directly. Never use passHref.`;

    console.log(`   🧠 Translating ${role} (${componentName})...`);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", systemInstruction: systemPrompt });

    const result = await model.generateContent(`REFERENCE LAYOUT SKELETON:\n\n${htmlContent}`);
    let code = result.response.text();
    // Strip markdown wrappers
    if (code.startsWith('```')) {
        const lines = code.split('\n');
        lines.shift();
        if (lines[lines.length - 1].trim().startsWith('```')) lines.pop();
        code = lines.join('\n');
    }

    // Auto-inject "use client" if needed
    const needsClient = /(onClick|onSubmit|onChange|useState|useEffect|useRef|framer-motion|gsap|lenis|useScroll|AnimatePresence|motion\.)/.test(code);
    if (needsClient && !code.includes('"use client"') && !code.includes("'use client'")) {
        code = `"use client";\n\n${code}`;
    }

    // Safety: strip any fixed 1440px widths that slipped through
    code = code.replace(/width:\s*['"]?1440px['"]?/g, 'width: "100%"');
    code = code.replace(/w-\[1440px\]/g, 'w-full');

    // Auto-Fix: Next.js 14 Link nesting (Link cannot have <a> child)
    code = code.replace(/passHref/g, '');
    // Replace <Link ...><a ...> patterns with <Link ...><span ...>
    code = code.replace(/<Link([^>]*)>\s*<a /g, '<Link$1><span ');
    code = code.replace(/<\/a>\s*<\/Link>/g, '</span></Link>');
    // Replace <Link ...><motion.a with <Link ...><motion.span
    code = code.replace(/<Link([^>]*)>\s*<motion\.a/g, '<Link$1><motion.span');
    code = code.replace(/<\/motion\.a>\s*<\/Link>/g, '</motion.span></Link>');

    fs.writeFileSync(outputFile, code);
    console.log(`   ✅ Saved ${componentName} (${(code.length / 1024).toFixed(1)} KB)`);
    
    return result.response.usageMetadata || { promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 };
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
    const prompt = process.argv[2] || "Luxury Watch Brand";
    translateToReact('extracted.html', {
        role: 'hero section',
        componentName: 'HeroSection',
        designSystem: { bgPrimary: '#000', bgSecondary: '#111', textPrimary: '#fff', textSecondary: '#999', accent: '#E5FF00' },
        userPrompt: prompt,
        imageUrls: []
    }, 'GeneratedComponent.tsx').catch(console.error);
}

export { translateToReact };
