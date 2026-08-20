// anti_slop.js — Anti-AI-Slop Enforcement Layer
// Forbidden pattern detection, post-processing, deterministic generators

// ═══════════════════════════════════════════════════════════════
// 1. FORBIDDEN PATTERN REGEXES — Strip after LLM generation
// ═══════════════════════════════════════════════════════════════

const FORBIDDEN_CODE_PATTERNS = [
  // Marquee / horizontal text scrollers
  { pattern: /<marquee[^>]*>[\s\S]*?<\/marquee>/gi, replace: '', name: 'marquee-tag' },
  { pattern: /animation:\s*scroll[^;]*;/gi, replace: '', name: 'scroll-animation' },
  { pattern: /animation:\s*marquee[^;]*;/gi, replace: '', name: 'marquee-animation' },
  { pattern: /animation:\s*slide[^;]*;/gi, replace: '', name: 'slide-animation' },
  { pattern: /animation:\s*float[^;]*;/gi, replace: '', name: 'float-animation' },
  { pattern: /animation:\s*bounce[^;]*;/gi, replace: '', name: 'bounce-animation' },
  { pattern: /@keyframes\s+(slide|scroll|marquee|float|bounce|fadeSlide|slideIn|slideIn|slideUp|slideDown|fadeIn|zoomIn)[a-zA-Z]*\s*\{[^}]*(\{[^}]*\}[^}]*)*\}/gi, replace: '', name: 'forbidden-keyframes' },

  // Scale/zoom on hover
  { pattern: /whileHover\s*=\s*\{\s*\{[^}]*scale[^}]*\}\s*\}/g, replace: '', name: 'whileHover-scale' },
  { pattern: /hover:scale-\[\d[^]]*\]/g, replace: '', name: 'hover-scale-tailwind' },
  { pattern: /transform:\s*scale\([^)]+\)/gi, replace: '', name: 'transform-scale' },

  // Parallax
  { pattern: /background-attachment:\s*fixed/gi, replace: 'background-attachment: scroll', name: 'parallax' },
  { pattern: /data-parallax/gi, replace: 'data-static', name: 'parallax-data' },

  // Slide-in from side animations (except menu)
  { pattern: /animation:\s*slideIn[A-Za-z]*[^;]*;/gi, replace: '', name: 'slideIn-animation' },

  // Generic sections that don't belong on luxury homepages
  { pattern: /"Our Philosophy"/g, replace: '"The Collection"', name: 'generic-philosophy' },
  { pattern: /"Trusted by"/g, replace: '"Featured In"', name: 'generic-trusted' },
  { pattern: /"As seen in"/g, replace: '"Editorial"', name: 'generic-aseenin' },
  { pattern: /"Why Choose Us"/g, replace: '"The Craft"', name: 'generic-whychoose' },
  { pattern: /"Our Values"/g, replace: '"Atelier"', name: 'generic-values' },
  { pattern: /"Testimonials"/g, replace: '"Journal"', name: 'generic-testimonials' },
];

// ═══════════════════════════════════════════════════════════════
// 2. POST-PROCESSOR — Clean LLM output
// ═══════════════════════════════════════════════════════════════

export function postProcessComponent(code, componentName) {
  let cleaned = code;
  const strippedPatterns = [];

  const mdMatch = cleaned.match(/```(?:tsx?|jsx?)\n([\s\S]*?)```/);
  if (mdMatch) cleaned = mdMatch[1].trim();
  cleaned = cleaned.replace(/^```[a-z]*\n?/gm, '').replace(/```\s*$/gm, '').trim();

  const codeStart = cleaned.search(/^["']use client["']|^import\s/m);
  if (codeStart > 0) cleaned = cleaned.slice(codeStart);

  for (const fp of FORBIDDEN_CODE_PATTERNS) {
    if (componentName === 'SlideMenu' && fp.name.includes('slide')) continue;
    if (fp.pattern.test(cleaned)) {
      strippedPatterns.push(fp.name);
      cleaned = cleaned.replace(fp.pattern, fp.replace);
    }
    fp.pattern.lastIndex = 0;
  }

  cleaned = cleaned.replace(/import\s+Head\s+from\s+['"]next\/head['"];?\n?/g, '');
  cleaned = cleaned.replace(/import\s+.*\s+from\s+['"]@[a-zA-Z0-9_-]+\/utilities['"];?\n?/g, '');
  cleaned = cleaned.replace(/useClient\(\);?\n?/g, '');

  cleaned = cleaned.replace(/<label([^>]*?)for=/g, '<label$1htmlFor=');

  if (cleaned.includes('useState') || cleaned.includes('useEffect') || cleaned.includes('motion')) {
    cleaned = cleaned.replace(/["']use client["'];?\n*/g, '');
    cleaned = `"use client";\n\n${cleaned.trim()}`;
  }

  if (!cleaned.trim().endsWith('}') && !cleaned.trim().endsWith('};')) {
    const open = (cleaned.match(/\{/g) || []).length;
    const close = (cleaned.match(/\}/g) || []).length;
    if (open > close) cleaned += '\n' + '}'.repeat(open - close);
  }

  return cleaned;
}

// ═══════════════════════════════════════════════════════════════
// 3. DETERMINISTIC GENERATORS
// ═══════════════════════════════════════════════════════════════

export function generateGlobalsCss(bp) {
  const c = bp.designTokens.colors;
  const t = bp.designTokens.typography;
  const hFallback = t.fontCategory === 'serif' ? 'serif' : 'sans-serif';
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
  --font-heading: '${t.headingFont}', ${hFallback};
  --font-body: '${t.bodyFont}', sans-serif;
}

html, body {
  margin: 0; padding: 0;
  overflow-x: hidden;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: var(--font-body);
  font-size: 16px;
  line-height: 1.7;
  -webkit-font-smoothing: antialiased;
}
`;
}

export function generateLayoutTsx(bp) {
  const brandName = (bp.meta.brandName || 'Maison').replace(/'/g, "\\'");
  return `import './globals.css';
import Header from './components/Header';
import Footer from './components/Footer';
import SmoothScroll from './components/SmoothScroll';

export const metadata = {
  title: '${brandName}',
  description: '${brandName} — Official Online Store',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SmoothScroll>
          <Header />
          <main>{children}</main>
          <Footer />
        </SmoothScroll>
      </body>
    </html>
  );
}
`;
}

export function generateSmoothScrollTsx() {
  return `"use client";
import { useEffect, useRef } from 'react';

export default function SmoothScroll({ children }: { children: React.ReactNode }) {
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    (async () => {
      const Lenis = (await import('lenis')).default;
      const lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
      function raf(time: number) {
        lenis.raf(time);
        requestAnimationFrame(raf);
      }
      requestAnimationFrame(raf);
    })();
  }, []);
  return <>{children}</>;
}
`;
}

export function generatePageTsx(bp) {
  const sections = bp.components.sections || [];
  const heroComp = bp.components.hero?.componentName || bp.components.hero?.component || 'HeroFullBleed';
  
  let imports = `import ${heroComp} from './components/${heroComp}';\n`;
  let renders = `      <${heroComp} />\n`;
  
  for (const s of sections) {
    const name = s.componentName || s.component;
    if (!name) continue;
    imports += `import ${name} from './components/${name}';\n`;
    renders += `      <${name} />\n`;
  }

  return `${imports}
export default function Home() {
  return (
    <>
${renders}
    </>
  );
}
`;
}

export function generateSubPageTsx(bp, pageTitle) {
  return `"use client";
import { motion } from 'framer-motion';

export default function SubPage() {
  return (
    <div className="min-h-screen bg-white pt-32 px-10">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
      >
        <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-400 mb-4 block">${bp.meta.brandName} — Editorial</span>
        <h1 className="text-[clamp(2.5rem,6vw,5rem)] leading-tight font-heading mb-12">${pageTitle}</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-20">
          <div className="aspect-[3/4] bg-zinc-100 relative overflow-hidden">
             {/* Dynamic content placeholder */}
             <div className="absolute inset-0 flex items-center justify-center text-[10px] uppercase tracking-widest text-zinc-400">Archival Image</div>
          </div>
          <div className="flex flex-col justify-center">
            <p className="max-w-md text-zinc-600 leading-relaxed mb-8">
              The essence of ${pageTitle} is captured through a lens of minimalist luxury. Each element is meticulously curated to reflect the brand DNA of ${bp.meta.brandName}.
            </p>
            <div className="h-[1px] w-20 bg-zinc-200 mb-8" />
            <p className="text-[12px] uppercase tracking-widest text-zinc-400">Coming Soon</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
`;
}

// ═══════════════════════════════════════════════════════════════
// 4. COMPONENT CONTRACTS
// ═══════════════════════════════════════════════════════════════

export function buildComponentContract(bp, componentName) {
  const c = bp.designTokens.colors;
  const header = bp.components.header || {};
  const hero = bp.components.hero || {};
  const footer = bp.components.footer || {};
  const brandName = bp.meta.brandName || 'MAISON';

  const BASE_RULES = `
ABSOLUTE TECH RULES:
- "use client"; as first line
- TypeScript TSX, ONE default export
- next/image for all images (with fill+sizes or explicit width+height)
- Icons: ONLY inline SVG paths, NO icon libraries
- NO animations on scroll or hover.
- MAX FONT SIZE 20px.
- NO Lorem ipsum. Real content only.
- Strict rhythm: Editorial Image/Video -> Product Grid -> Editorial -> Product Grid
`;

  switch (componentName) {
    case 'Header':
      return `${BASE_RULES}
COMPONENT: Header.tsx
Logo: "${brandName}"
Icons: Search, Account, Cart (gap 20px)
Categories: Men, Women, Accessories, Parfum
DROPDOWNS: Each category MUST have a luxury dropdown menu.
`;

    case 'SlideMenu':
      return `${BASE_RULES}
COMPONENT: SlideMenu.tsx
Categories: ${(header.hamburgerMenu?.mainCategories || ['Men', 'Women', 'Accessories', 'Parfum']).join(', ')}
`;

    case 'Footer':
      return `${BASE_RULES}
COMPONENT: Footer.tsx
FORBIDDEN: NO QUOTES. NO IMAGE GALLERIES.
`;

    default: {
      const section = bp.components.sections?.find(s => (s.componentName || s.component) === componentName) || hero;
      const img = section?.image || section?.images?.[0] || '';
      return `${BASE_RULES}
COMPONENT: ${componentName}.tsx
IMAGE: ${img}
HEADLINE: MAX 20px font size.
SANS-SERIF priority.
NO HOVER ZOOM ON IMAGES.
`;
    }
  }
}

export const ANTI_SLOP_SYSTEM_PROMPT = `You are an elite frontend developer.
ULTRA-STRICT DESIGN RULES (VIOLATION = FAILURE):
1. MAX FONT SIZE IS 20px!
2. NO MIX-BLEND EFFECTS in Header. Use clean solid backgrounds (white or black).
3. BINARY RHYTHM ONLY: A page must ONLY consist of:
   - Type A: 100vw Full-Bleed Image/Video (Text overlaid ON TOP of image).
   - Type B: 3-column or 4-column Product Grid.
4. FORBIDDEN: NO asymmetric galleries. NO text columns next to images. NO 50/50 splits.
5. TYPOGRAPHY: Tiny, elegant, sans-serif. Max 20px.
6. NO ANIMATIONS. NO ZOOM. NO FADE.
`;
