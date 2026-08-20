import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const KIMI_API_KEY = process.env.KIMI_API_KEY;
const KIMI_BASE_URL = 'https://api.moonshot.ai/v1';

/**
 * Heals a broken React component using Kimi (Moonshot).
 * @param {string} filePath - Absolute path to the failing file
 * @param {string} errorMessage - The compilation error from Next.js
 * @returns {object} usageMetadata
 */
export async function healComponent(filePath, errorMessage) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`Heal failed: File not found at ${filePath}`);
    }

    const brokenCode = fs.readFileSync(filePath, 'utf8');
    const componentName = path.basename(filePath);

    const systemPrompt = `You are an expert Next.js 14 (App Router) and React Developer.
Your task is to fix a compilation error in a generated component.

COMPONENT NAME: ${componentName}

STRICT RULES:
1. Fix the error described in the compilation output.
2. If it's a missing import, add it.
3. If it's a syntax error, fix it.
4. If it complains about a hook (useState, usePathname, useRouter) needing "use client", and the file is NOT layout.tsx, ensure "use client"; is at the very top.
5. IF THE FILE IS layout.tsx: Next.js Layouts CANNOT be Client Components if they export metadata. DO NOT add "use client" to layout.tsx. Instead, REMOVE any hooks (like usePathname) and make the component completely static.
6. If it complains about <Link> containing an <a> tag, apply classes directly to <Link>.
7. NEVER import Head from "next/head" — in App Router, metadata goes in layout.tsx, not in page components.
8. NEVER use <></> React.Fragment syntax directly — wrap in a <div> or <main> instead.
9. If the code is truncated/incomplete, close all open tags and brackets properly.
10. RETURN ONLY VALID TSX CODE. No markdown, no explanations. JUST THE RAW CODE.
11. Preserve all existing functionality, layout, and styling.`;

    console.log(`   🩺 Healing ${componentName}...`);

    const res = await fetch(`${KIMI_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${KIMI_API_KEY}`,
        },
        body: JSON.stringify({
            model: 'moonshot-v1-128k',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `COMPILATION ERROR:\n${errorMessage.slice(0, 2000)}\n\nBROKEN CODE:\n\n${brokenCode}` },
            ],
            temperature: 0.3,
        }),
    });

    if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Kimi API ${res.status}: ${errBody.slice(0, 200)}`);
    }

    const data = await res.json();
    let fixedCode = data.choices?.[0]?.message?.content || '';

    // Strip markdown wrappers
    fixedCode = fixedCode.replace(/^```[a-z]*\n?/gm, '').replace(/```\s*$/gm, '').trim();

    // Ensure use client is first line
    if (fixedCode.includes('"use client"') || fixedCode.includes("'use client'")) {
        fixedCode = fixedCode.replace(/['"]use client['"];?\n*/g, '');
        fixedCode = `"use client";\n\n${fixedCode.trim()}`;
    }

    // Remove Head imports (App Router doesn't use next/head)
    fixedCode = fixedCode.replace(/import\s+Head\s+from\s+['"]next\/head['"];?\n?/g, '');

    fs.writeFileSync(filePath, fixedCode, 'utf8');
    console.log(`   🩹 Healed ${componentName} (${(fixedCode.length / 1024).toFixed(1)} KB)`);

    return data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
}
