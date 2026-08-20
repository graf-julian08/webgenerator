// multi_model_strategy.js — Multi-Model Pipeline via NVIDIA API
// Phase 1: Qwen3 Coder → Blueprint / DNA
// Phase 2: Kimi K2.6 → Design / Component Generation
// Phase 3: Llama-3.1-70b → Quality Check

import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

// ─── NVIDIA API Client (shared) ───────────────────────────────
const nvidiaClient = new OpenAI({
    apiKey: process.env.NVIDIA_API_KEY,
    baseURL: 'https://integrate.api.nvidia.com/v1',
});

// ─── Model Configuration ──────────────────────────────────────
const MODEL_CONFIG = {
    blueprint: {
        model: 'qwen/qwen3-coder-480b-a35b-instruct',
        temperature: 0.7,
        maxTokens: 4000,
        label: '🧬 Qwen3 Coder (Blueprint)',
    },
    design: {
        model: 'moonshotai/kimi-k2.6',
        temperature: 0.7,
        maxTokens: 4000,
        label: '🎨 Kimi K2.6 (Design)',
    },
    component: {
        model: 'moonshotai/kimi-k2.6',
        temperature: 0.6,
        maxTokens: 4000,
        label: '🧱 Kimi K2.6 (Component)',
    },
    quality: {
        model: 'meta/llama-3.1-70b-instruct',
        temperature: 0.3,
        maxTokens: 1000,
        label: '🔍 Llama-3.1-70b (Quality)',
    },
};

// ─── Token Tracking ───────────────────────────────────────────
let totalPromptTokens = 0;
let totalCompletionTokens = 0;

export function getTokenUsage() {
    return { promptTokens: totalPromptTokens, completionTokens: totalCompletionTokens };
}

export function resetTokenUsage() {
    totalPromptTokens = 0;
    totalCompletionTokens = 0;
}

// ─── Generic NVIDIA API Call with Retry ───────────────────────
async function callNvidiaAPI(config, messages, maxRetries = 5) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`   ${config.label} → ${config.model} (attempt ${attempt}/${maxRetries})`);

            const response = await nvidiaClient.chat.completions.create({
                model: config.model,
                messages,
                temperature: config.temperature,
                max_tokens: config.maxTokens,
            });

            // Track token usage
            const usage = response.usage || {};
            totalPromptTokens += usage.prompt_tokens || 0;
            totalCompletionTokens += usage.completion_tokens || 0;

            const content = response.choices?.[0]?.message?.content || '';
            console.log(`   ✅ ${config.label} done (${(content.length / 1024).toFixed(1)} KB, ${(usage.completion_tokens || 0)} tokens)`);
            return content;
        } catch (error) {
            const isRetryable = error.status === 429 || error.status >= 500 || error.code === 'ECONNRESET';
            if (isRetryable && attempt < maxRetries) {
                const wait = 10 * Math.pow(2, attempt - 1);
                console.log(`   ⏳ ${config.label} rate-limited. Waiting ${wait}s...`);
                await new Promise(r => setTimeout(r, wait * 1000));
                continue;
            }
            console.error(`   ❌ ${config.label} failed after ${attempt} attempts: ${error.message?.slice(0, 150)}`);
            throw error;
        }
    }
    throw new Error(`${config.label}: All retries exhausted`);
}

// ─── Phase 1: Blueprint Generation (Qwen3 Coder) ─────────────
async function callQwenBlueprint(prompt) {
    return callNvidiaAPI(
        MODEL_CONFIG.blueprint,
        [{ role: 'user', content: prompt }],
    );
}

// ─── Phase 2a: Design / Visual Manifest (Kimi K2.6) ────────
async function callNvidiaDesign(prompt) {
    return callNvidiaAPI(
        MODEL_CONFIG.design,
        [{ role: 'user', content: prompt }],
    );
}

// ─── Phase 2b: Component Code Generation (Kimi K2.6) ───────
async function callNvidiaComponent(systemPrompt, userMessage) {
    return callNvidiaAPI(
        MODEL_CONFIG.component,
        [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
        ],
    );
}

// ─── Phase 3: Quality Check (Llama-3.1-70b) ──────────────────
async function callQualityCheck(content) {
    return callNvidiaAPI(
        MODEL_CONFIG.quality,
        [
            {
                role: 'system',
                content: `You are a senior QA engineer for luxury website design. Review the following component code and provide:
1. AI-SLOP SCORE (1-10): How much does this look like generic AI output?
2. DESIGN ISSUES: Specific visual problems (spacing, colors, typography)
3. ANTI-PATTERN VIOLATIONS: Split layouts, big buttons, generic sections
4. FIXES: Concrete code-level fixes needed
Respond in concise bullet points.`,
            },
            { role: 'user', content },
        ],
        3 // Reduced retries for quality check
    );
}

// ─── Exports ──────────────────────────────────────────────────
export {
    callQwenBlueprint,
    callNvidiaDesign,
    callNvidiaComponent,
    callQualityCheck,
    MODEL_CONFIG,
};
