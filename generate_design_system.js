import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createPrompt, closeDb } from './generate.js';
import { callQwenBlueprint } from './multi_model_strategy.js';
import { synthesizeMasterWireframe } from './reference_crawler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateDesignSystem(industry, userPrompt) {
  console.log(`\n╔══════════════════════════════════════════════════════════════╗`);
  console.log(`║  🎨 PHASE 1: DESIGN SYSTEM GENERATOR                         ║`);
  console.log(`╠══════════════════════════════════════════════════════════════╣`);
  console.log(`║  Industry: ${industry.padEnd(48)}║`);
  console.log(`║  Request:  ${userPrompt.slice(0, 48).padEnd(48)}║`);
  console.log(`╚══════════════════════════════════════════════════════════════╝\n`);

  console.log('📐 Step 1: Extracting Brand DNA and creating Blueprint...');
  
  // 1. Get the Blueprint using existing logic (this calls Qwen + SQLite + Unsplash)
  const result = await createPrompt(userPrompt, industry);
  const blueprint = result.blueprint;
  
  console.log(`   ✅ Brand DNA extracted: ${blueprint.meta.personality}`);
  console.log(`   ✅ Palette: ${blueprint.designTokens.colors.bgPrimary} / ${blueprint.designTokens.colors.textPrimary}`);
  console.log(`   ✅ Fonts: ${blueprint.designTokens.typography.headingFont} + ${blueprint.designTokens.typography.bodyFont}`);

  // 1.5. Dynamic Reference Crawler (Firecrawl + LLM Synthesis)
  const masterWireframe = await synthesizeMasterWireframe(userPrompt, industry);

  // 2. Ask Qwen to generate the HTML Showcase
  console.log('\n🧠 Step 2: Generating Component Showcase via Qwen3 Coder...');
  
  const designPrompt = `DU BIST EIN ELITE HIGH-END FRONTEND-ARCHITEKT UND ART DIRECTOR. 
Deine Aufgabe ist es, einen übergebenen "Organic JSON Blueprint" und Design-Tokens in ein fehlerfreies, atemberaubendes Design-Showcase zu übersetzen. Du bist kein generischer KI-Generator. Du denkst wie die Lead Designer von Louis Vuitton, Apple, Gucci und Awwwards-Gewinnern.
Deine Entwürfe basieren nicht auf "schönen Komponenten", sondern auf Rhythmus, Proportion, Spannung, Optical Alignment und Reduktion. Du erschaffst digitale Magazine, Architektur-Portfolios und cinematische Erlebnisse.

### 1. DIE 7 EBENEN DES LUXUS-DESIGNS (DEINE GESETZGEBUNG)
EBENE 1: VISUELLE HIERARCHIE & DOMINANZ (Extremer Negativraum, klares Fokus-Viewport)
EBENE 2: SPACING-SYSTEME & OPTICAL ALIGNMENT (15vh-30vh Paddings, optische Balance statt rein mathematischer)
EBENE 3: TYPOGRAFIE (Massive H1 Tension, max 2 Schriften, perfektes Tracking)
EBENE 4: MOTION DESIGN (NO PARALLAX! Nur statische Eleganz)
EBENE 5: LAYOUT-ARCHITEKTUR (Editorial Z-Index Schichtung, Symmetrie bei Katalogen)
EBENE 6: BILDER UND TEXT (Text konkurriert NIE mit dem Bild)
EBENE 7: UNSICHTBARE DETAILS (Ultrasoft Shadows, kein Rauschen)

Der User möchte: "${userPrompt}". Industry: ${industry}.

Hier ist der Blueprint (Colors, Typo, Unsplash Images):
${JSON.stringify({
  colors: blueprint.designTokens.colors,
  typography: blueprint.designTokens.typography,
  images: {
      hero: blueprint.components.hero.images[0],
      products: blueprint.components.sections.map(s => s.image)
  }
}, null, 2)}

DEINE AUFGABE FÜR PHASE 1:
Generiere eine einzige, lange, scrollbare HTML-Datei (als "Showcase / Artboards").

### MASTER-WIREFRAME (Zwingende Architektur-Vorlage)
Du MUSST die folgende Struktur verwenden, die von Top-Shops der Industrie abgeleitet wurde. Ignoriere deine Standard-Templates und baue EXAKT dieses Layout nach, aber verwende die oben definierte Brand DNA (Farben, Fonts) als Styling:

${masterWireframe ? masterWireframe : '(Kein Referenz-Wireframe gefunden. Erschaffe eine eigene High-End Luxus-Architektur.)'}

### REGELN FÜR DIESES HTML:
1. Verwende VANILLA CSS (<style>) für das Haupt-Styling, Macro-Layouts, extreme Paddings und Typografie. Verwende Tailwind (<script src="https://cdn.tailwindcss.com"></script>) NUR extrem sparsam für kleine Utilities. KEIN generischer Tailwind-Template-Look! Es muss nach High-End Custom Code aussehen.
2. Lade zwingend Lucide Icons (<script src="https://unpkg.com/lucide@latest"></script>). Verwende NIEMALS reine Textlinks für UI-Elemente wie Suche, Warenkorb, Login oder Wunschliste. Diese MÜSSEN Icons sein! (Beispiel: <i data-lucide="search"></i>) Vergiss nicht lucide.createIcons(); am Ende des bodys aufzurufen!
3. Fashion Aspect Ratios: Alle Produktbilder MÜSSEN ein mode-typisches Hochformat haben (z.B. aspect-ratio: 2/3 oder 3/4) und mit object-fit: cover beschnitten sein. Keine unregelmäßigen quadratischen Boxen!
4. Product Detail Page: Die Detailseite MUSS interaktive Dummy-Elemente haben: Color-Swatches (Farbkreise), Size-Selector, Add-to-Bag Button und Wishlist-Icon.
5. Mega-Footer: Der Footer darf nicht nur ein Copyright sein. Er muss Newsletter, Sitemaps, Legal-Links und Socials enthalten.
6. Importiere die Google Fonts aus dem Blueprint.
7. Strukturiere die Seite als Abfolge von perfekt beschrifteten "Artboards" (Sektionen mit kleinen Labels wie "01. HEADER", "02. HERO").
8. FOLGENDE ANSICHTEN MÜSSEN PERFEKT UNTEREINANDER AUSGEARBEITET WERDEN:
   - Brand Tokens: Typografie-Beispiele & Farbpalette.
   - Header: Die exakte Navigation laut Master-Wireframe (mit Lucide Icons).
   - Menu Overlay: Ein echtes Mega-Menü mit Bildern (falls im Wireframe gefordert).
   - Hero Section: Großflächiges Bild mit Overlay, damit Text immer lesbar bleibt.
   - Catalog & Top Products: Laut Wireframe.
   - Product Detail View: Split-Screen oder laut Wireframe, mit Color-Swatches.
   - Footer: Mega-Footer laut Wireframe.

WICHTIG (TOKEN LIMITS & CSS): 
- SCHREIBE KEIN EIGENES CSS-FRAMEWORK! Generiere KEINE hunderten von Utility-Klassen (wie .text-20xl, .mt-5 etc.) im <style> Block! Das sprengt das Token-Limit sofort und bricht ab.
- Nutze das <style> Tag AUSSCHLIESSLICH für CSS-Variablen (:root), globale Typografie (h1, p) und einige wenige macro-layout Klassen (z.B. .artboard).
- Für alles andere: Nutze Tailwind-Klassen (da CDN geladen wird) oder INLINE-STYLES (style="padding: 15vh"), um das HTML extrem kurz und machbar zu halten.
- DU MUSST das komplette HTML bis zum </footer> fertigstellen! Teile deine Tokens schlau ein.
- ACHTUNG SCROLL-SHOWCASE: Verwende NIEMALS "position: fixed" oder "width: 100vw; height: 100vh" für Sektionen wie das Menu-Overlay! Da alle Sektionen untereinander dargestellt werden, würde ein fixed Overlay alles andere verdecken. Nutze für das Menü "position: relative" und eine feste Höhe (z.B. height: 60vh).

Nutze die echten Unsplash-Bilder aus dem Blueprint! Setze sie in <img> Tags ein.
Gib AUSSCHLIESSLICH den rohen HTML-Code zurück (von <html> bis </html>). Keine Markdown-Blöcke.`;

  const rawHtml = await callQwenBlueprint(designPrompt);
  
  // Clean up the output in case Qwen wrapped it in markdown
  let cleanedHtml = rawHtml;
  const mdMatch = cleanedHtml.match(/```(?:html)?\n([\s\S]*?)```/);
  if (mdMatch) cleanedHtml = mdMatch[1];
  
  // 3. Save the HTML file
  const outputPath = path.join(__dirname, 'design_system_showcase.html');
  await fs.writeFile(outputPath, cleanedHtml, 'utf-8');
  
  console.log(`\n🎉 Step 3: Done! Design System saved to:`);
  console.log(`   👉 ${outputPath}`);
  console.log(`   Open this file in your browser to view the components "nebeneinander, schön gegliedert".\n`);
  
  await closeDb();
}

const args = process.argv.slice(2);
const industryArg = args[0] || 'furniture';
const requestArg = args.slice(1).join(' ') || 'Luxushaus für hochwertige Möbel';

generateDesignSystem(industryArg, requestArg).catch(err => {
  console.error('💀 Fatal Error:', err);
  process.exit(1);
});
