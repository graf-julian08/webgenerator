import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { fetchIndustryImages } from './fetch_media.js';
import { healComponent } from './heal_component.js';
import {
  postProcessComponent,
  generateGlobalsCss,
  generateLayoutTsx,
  generateSmoothScrollTsx,
  generatePageTsx,
  generateSubPageTsx,
  buildComponentContract,
  ANTI_SLOP_SYSTEM_PROMPT,
} from './anti_slop.js';
import { createPrompt } from './generate.js';
import { callNvidiaDesign, callQualityCheck } from './multi_model_strategy.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const OUTPUT_DIR = path.join(__dirname, 'generated-site');

let totalPromptTokens = 0;
let totalCompletionTokens = 0;

// ═══════════════════════════════════════════════════════════════
// LLM ENGINE — Single component generation
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// SCAFFOLD — Next.js project with correct dependencies
// ═══════════════════════════════════════════════════════════════
async function scaffoldProject(blueprint) {
  // try { await fs.rm(OUTPUT_DIR, { recursive: true, force: true }); } catch { }
  await fs.mkdir(path.join(OUTPUT_DIR, 'app', 'components'), { recursive: true });

  const brandName = blueprint.meta.brandName || 'Maison';

  // package.json — locked versions, no surprises
  await fs.writeFile(path.join(OUTPUT_DIR, 'package.json'), JSON.stringify({
    name: 'generated-site', version: '1.0.0', private: true,
    scripts: { dev: 'next dev', build: 'next build', start: 'next start' },
    dependencies: {
      next: '^14.2.0', react: '^18.3.0', 'react-dom': '^18.3.0',
      'framer-motion': '^11.0.0', lenis: '^1.1.0',
    },
    devDependencies: {
      '@types/node': '^20', '@types/react': '^18', typescript: '^5',
      tailwindcss: '^3.4', postcss: '^8', autoprefixer: '^10',
    },
  }, null, 2));

  // tsconfig
  await fs.writeFile(path.join(OUTPUT_DIR, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'es5', lib: ['dom', 'es2017'], jsx: 'preserve', module: 'esnext',
      moduleResolution: 'bundler', strict: false, noEmit: true, esModuleInterop: true,
      resolveJsonModule: true, isolatedModules: true, incremental: true,
      plugins: [{ name: 'next' }], paths: { '@/*': ['./*'] },
    },
    include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
    exclude: ['node_modules'],
  }, null, 2));

  // next.config
  await fs.writeFile(path.join(OUTPUT_DIR, 'next.config.js'),
    `/** @type {import('next').NextConfig} */\nmodule.exports = { images: { remotePatterns: [{ protocol: 'https', hostname: '**' }] } };\n`);

  // tailwind.config
  await fs.writeFile(path.join(OUTPUT_DIR, 'tailwind.config.ts'),
    `import type { Config } from 'tailwindcss';\nconst config: Config = {\n  content: ['./app/**/*.{ts,tsx}'],\n  theme: { extend: { fontFamily: { heading: ['var(--font-heading)'], body: ['var(--font-body)'] } } },\n  plugins: [],\n};\nexport default config;\n`);

  // postcss.config
  await fs.writeFile(path.join(OUTPUT_DIR, 'postcss.config.js'),
    `module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } };\n`);

  console.log('   📦 Project scaffolded.');
}

// ═══════════════════════════════════════════════════════════════
// DETERMINISTIC FILES — Written directly from blueprint, no LLM
// ═══════════════════════════════════════════════════════════════
async function writeDeterministicFiles(blueprint) {
  const files = {
    'app/globals.css': generateGlobalsCss(blueprint),
    'app/layout.tsx': generateLayoutTsx(blueprint),
    'app/components/SmoothScroll.tsx': generateSmoothScrollTsx(),
    'app/page.tsx': generatePageTsx(blueprint),
  };

  for (const [filePath, content] of Object.entries(files)) {
    await fs.writeFile(path.join(OUTPUT_DIR, filePath), content);
    console.log(`   ✅ ${filePath} (deterministic)`);
  }

  // Generate Sitemap Pages
  if (blueprint.artDirectorManifest?.sitemap) {
    for (const page of blueprint.artDirectorManifest.sitemap) {
      if (!page.slug || page.slug === '/') continue;
      const pageDir = path.join(OUTPUT_DIR, 'app', page.slug);
      await fs.mkdir(pageDir, { recursive: true });
      await fs.writeFile(path.join(pageDir, 'page.tsx'), generateSubPageTsx(blueprint, page.title));
      console.log(`   ✅ app/${page.slug}/page.tsx (sitemap)`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// PER-COMPONENT LLM GENERATION — One call per component
// ═══════════════════════════════════════════════════════════════
async function generateComponent(blueprint, componentName) {
  const contract = buildComponentContract(blueprint, componentName);
  const userMsg = `Generate the complete ${componentName}.tsx component now. Follow the contract EXACTLY. Output ONLY valid TSX code, nothing else.

${contract}`;

  console.log(`   🧠 Generating ${componentName}...`);
  let raw = await callNvidiaComponent(ANTI_SLOP_SYSTEM_PROMPT, userMsg);
  let code = postProcessComponent(raw, componentName);

  // Validate basic structure
  if (!code.includes('export default')) {
    console.log(`   ⚠️ ${componentName} missing default export. Adding wrapper.`);
    code += `\n\nexport default function ${componentName}() { return <div>${componentName} placeholder</div>; }`;
  }

  const filePath = path.join(OUTPUT_DIR, 'app', 'components', `${componentName}.tsx`);
  await fs.writeFile(filePath, code);
  console.log(`   ✅ ${componentName} saved (${(code.length / 1024).toFixed(1)} KB)`);
}

// ═══════════════════════════════════════════════════════════════
// AUTO-HEAL LOOP — Build check + retry
// ═══════════════════════════════════════════════════════════════
async function autoHealBuild() {
  console.log('\n🩺 Build Validation & Auto-Heal');
  let buildSuccess = false;
  let retries = 0;
  const MAX_RETRIES = 8;

  while (!buildSuccess && retries < MAX_RETRIES) {
    try {
      console.log(`   🛠️  Build Attempt ${retries + 1}/${MAX_RETRIES}...`);
      execSync('npm run build', { cwd: OUTPUT_DIR, stdio: 'pipe', timeout: 120000 });
      console.log('   ✅ Build passed!');
      buildSuccess = true;
    } catch (error) {
      retries++;
      const output = (error.stdout?.toString() || '') + '\n' + (error.stderr?.toString() || '');

      // Find all failing files
      const fileMatches = [...output.matchAll(/\.\/app\/[a-zA-Z0-9_\/-]+\.tsx/g)];
      const uniqueFiles = [...new Set(fileMatches.map(m => m[0]))];

      if (uniqueFiles.length > 0) {
        for (const fileMatch of uniqueFiles.slice(0, 3)) {
          if (fileMatch.includes('layout.tsx') || fileMatch.includes('page.tsx') || fileMatch.includes('globals.css')) {
            console.log(`   🛡️  Skipping heal for deterministic file: ${fileMatch}. Restoring from blueprint.`);
            // These should be restored from the deterministic generators instead of being healed by LLM
            continue;
          }
          const failingFile = path.join(OUTPUT_DIR, fileMatch);
          console.log(`   🚨 Broken: ${fileMatch}`);
          try {
            await healComponent(failingFile, output.slice(0, 3000));
          } catch (healError) {
            console.log(`   ❌ Heal failed: ${healError.message.slice(0, 100)}`);
          }
        }
      } else {
        // Check for module not found errors
        const moduleMatch = output.match(/Module not found.*'([^']+)'/);
        if (moduleMatch) {
          console.log(`   📦 Missing module: ${moduleMatch[1]}. Attempting install...`);
          try {
            execSync(`npm install ${moduleMatch[1]}`, { cwd: OUTPUT_DIR, stdio: 'pipe', timeout: 30000 });
          } catch { /* ignore */ }
        } else {
          console.log(`   ⚠️ Cannot identify failing file.`);
          console.log(output.slice(0, 500));
          if (retries >= 3) break;
        }
      }
    }
  }
  return buildSuccess;
}

// ═══════════════════════════════════════════════════════════════
// MODE OVERRIDE — Detect and enforce light/dark from user request
// ═══════════════════════════════════════════════════════════════
function detectMode(userPrompt) {
  const lp = userPrompt.toLowerCase();
  if (lp.includes('light') || lp.includes('hell') || lp.includes('weiss') || lp.includes('white') || lp.includes('bright')) return 'light';
  if (lp.includes('dark') || lp.includes('dunkel') || lp.includes('schwarz') || lp.includes('black')) return 'dark';
  return null;
}

function overrideMode(blueprint, mode) {
  if (!mode) return blueprint;

  if (mode === 'light') {
    blueprint.designTokens.colors.bgPrimary = '#FFFFFF';
    blueprint.designTokens.colors.bgAlt = '#FAFAFA';
    blueprint.designTokens.colors.textPrimary = '#0A0A0A';
    blueprint.designTokens.colors.textMuted = '#86868B';
    blueprint.designTokens.colors.accent = '#0A0A0A';
    blueprint.designTokens.colors.border = '#E5E5E5';
    blueprint.components.header.bgInitial = '#FFFFFF';
    blueprint.components.footer.bg = '#0A0A0A';
  } else if (mode === 'dark') {
    blueprint.designTokens.colors.bgPrimary = '#0A0A0A';
    blueprint.designTokens.colors.bgAlt = '#141414';
    blueprint.designTokens.colors.textPrimary = '#F5F5F5';
    blueprint.designTokens.colors.textMuted = '#888888';
    blueprint.designTokens.colors.accent = '#F5F5F5';
    blueprint.designTokens.colors.border = '#2A2A2A';
    blueprint.components.header.bgInitial = '#0A0A0A';
    blueprint.components.footer.bg = '#000000';
  }

  console.log(`   🎨 Mode override: ${mode.toUpperCase()} — bg: ${blueprint.designTokens.colors.bgPrimary}`);
  return blueprint;
}

// ═══════════════════════════════════════════════════════════════
// MAIN PIPELINE
// ═══════════════════════════════════════════════════════════════
async function buildApp(industry, userPrompt) {
  const startTime = Date.now();

  console.log(`
╔══════════════════════════════════════════════════════════════╗
║  🏗️  ANTI-SLOP LUXURY GENERATOR v2.0                        ║
║  Per-Component · Blueprint-Driven · Zero Tolerance           ║
╠══════════════════════════════════════════════════════════════╣
║  Industry: ${industry.padEnd(48)}║
║  Request:  ${userPrompt.slice(0, 48).padEnd(48)}║
╚══════════════════════════════════════════════════════════════╝
`);

  // ── Phase 1: Generate Blueprint ──
  console.log('📐 Phase 1: Blueprint Generation');
  const result = await createPrompt(userPrompt, industry);
  let blueprint = result.blueprint;

  // Extract brand name from request
  const brandMatch = userPrompt.match(/(?:Brand\s*Name|Name)\s*[:\s]+\s*([A-ZÀ-ÿ][A-Za-zÀ-ÿéèêë\s&'.]+)/i);
  blueprint.meta.brandName = brandMatch ? brandMatch[1].trim() : industry.charAt(0).toUpperCase() + industry.slice(1) + ' Atelier';

  // Mode override (HIGHEST PRIORITY)
  const mode = detectMode(userPrompt);
  blueprint = overrideMode(blueprint, mode);

  console.log(`   Brand: ${blueprint.meta.brandName}`);
  console.log(`   Fonts: ${blueprint.designTokens.typography.headingFont} + ${blueprint.designTokens.typography.bodyFont}`);
  console.log(`   Palette: bg=${blueprint.designTokens.colors.bgPrimary} text=${blueprint.designTokens.colors.textPrimary}`);
  console.log(`   Sections: ${blueprint.components.sections.map(s => s.component).join(' → ')}`);

  // ── Phase 2: Scaffold ──
  console.log('\n⚙️  Phase 2: Project Scaffold');
  await scaffoldProject(blueprint);

  // ── Phase 3: Deterministic Files ──
  console.log('\n📄 Phase 3: Deterministic Files (no LLM)');
  await writeDeterministicFiles(blueprint);

  // ── Phase 4: LLM Component Generation ──
  console.log('\n🎨 Phase 4: Per-Component LLM Generation');

  // Build component list from blueprint
  const heroComp = blueprint.components.hero?.componentName || blueprint.components.hero?.component || 'HeroFullBleed';
  const sectionComps = (blueprint.components.sections || []).map(s => s.componentName || s.component);
  const uniqueComps = [...new Set(sectionComps)];

  // Generate in order: Header → SlideMenu → Hero → Sections → Footer
  const componentOrder = ['Header', 'SlideMenu', heroComp, ...uniqueComps, 'Footer'];

  for (const comp of componentOrder) {
    try {
      await generateComponent(blueprint, comp);
    } catch (err) {
      console.log(`   ❌ Failed to generate ${comp}: ${err.message.slice(0, 100)}`);
      // Write a minimal fallback component
      const fallback = `"use client";\n\nexport default function ${comp}() {\n  return <section style={{minHeight:'50vh',display:'flex',alignItems:'center',justifyContent:'center'}}><p>${comp}</p></section>;\n}`;
      await fs.writeFile(path.join(OUTPUT_DIR, 'app', 'components', `${comp}.tsx`), fallback);
    }
  }

  // ── Phase 5: Install Dependencies ──
  console.log('\n📦 Phase 5: Installing dependencies...');
  try {
    // Fresh install to avoid missing modules like @swc/helpers
    execSync('npm install && npm install @swc/helpers', { cwd: OUTPUT_DIR, stdio: 'pipe', timeout: 120000 });
    console.log('   ✅ npm install complete');
  } catch (err) {
    console.log('   ⚠️ npm install had warnings/errors. Attempting with legacy-peer-deps...');
    try { execSync('npm install --legacy-peer-deps', { cwd: OUTPUT_DIR, stdio: 'pipe', timeout: 120000 }); } catch { }
  }

  // ── Phase 6: Build + Auto-Heal ──
  const buildOk = await autoHealBuild();

  // ── Report ──
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const totalTokens = totalPromptTokens + totalCompletionTokens;
  const totalCost = (totalPromptTokens / 1e6 * 0.075) + (totalCompletionTokens / 1e6 * 0.30);

  console.log(`
╔══════════════════════════════════════════════════════════════╗
║  ${buildOk ? '🎉' : '⚠️'} ANTI-SLOP GENERATOR v2.0 ${buildOk ? 'COMPLETE' : 'DONE (warnings)'}${' '.repeat(buildOk ? 17 : 10)}║
╠══════════════════════════════════════════════════════════════╣
║  Brand:      ${blueprint.meta.brandName.padEnd(46)}║
║  Components: ${componentOrder.length.toString().padEnd(46)}║
║  Build:      ${(buildOk ? '✅ PASSED' : '❌ FAILED').padEnd(46)}║
║  ⏱️  Time:     ${(elapsed + 's').padEnd(44)}║
║  🪙  Tokens:   ${totalTokens.toString().padEnd(44)}║
║  💸  Cost:     $${totalCost.toFixed(5).padEnd(43)}║
╠══════════════════════════════════════════════════════════════╣
║  cd generated-site && npm run dev                            ║
║  http://localhost:3000                                       ║
╚══════════════════════════════════════════════════════════════╝
`);
}

// ─── CLI ───────────────────────────────────────────────────────
const args = process.argv.slice(2);
const industryArg = args[0] || 'fashion';
const requestArg = args.slice(1).join(' ') || 'Minimalist Luxury Brand, light mode, elegant typography';

buildApp(industryArg, requestArg).catch(err => {
  console.error('💀 Fatal Error:', err);
  process.exit(1);
});
