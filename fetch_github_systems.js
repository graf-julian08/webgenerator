import dotenv from 'dotenv';
dotenv.config();

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';

const QUERIES = [
    'awwwards nextjs stars:>50',
    'luxury ecommerce nextjs stars:>20',
    'apple website clone nextjs',
    'framer motion scroll animations nextjs stars:>100'
];

// Fallback "Master Class" CSS Module & Component patterns if GitHub rate limits or fails
const FALLBACK_PATTERNS = `
--- MASTER CLASS: CSS MODULE ASYMMETRIC GRID ---
/* AsymmetricGrid.module.css */
.gridContainer {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 2rem;
  padding: 10vh 5vw;
}
.imageBlock {
  grid-column: 1 / 8;
  aspect-ratio: 4/5;
  position: relative;
  overflow: hidden;
}
.textBlock {
  grid-column: 9 / 13;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding-bottom: 2rem;
}

--- MASTER CLASS: HYBRID REACT COMPONENT ---
import styles from './AsymmetricGrid.module.css';
import Image from 'next/image';
import { motion } from 'framer-motion';

export default function AsymmetricGrid() {
  return (
    <section className={styles.gridContainer}>
      <motion.div 
        className={styles.imageBlock}
        initial={{ opacity: 0, clipPath: 'inset(10% 10% 10% 10%)' }}
        whileInView={{ opacity: 1, clipPath: 'inset(0% 0% 0% 0%)' }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        viewport={{ once: true, margin: "-100px" }}
      >
        <Image src="/img.jpg" alt="Luxury" fill className="object-cover" />
      </motion.div>
      <div className={styles.textBlock}>
        <h2 className="text-[clamp(2rem,4vw,4rem)] font-heading italic mb-6">
          Timeless <span className="font-normal">Elegance</span>
        </h2>
        <p className="text-[16px] leading-[1.8] text-[color:var(--text-muted)]">
          Crafted with uncompromising attention to detail.
        </p>
      </div>
    </section>
  );
}
`;

export async function fetchGithubDesignSystems() {
    if (!GITHUB_TOKEN) {
        console.log('   ⚠️  Kein GITHUB_TOKEN — Nutze Fallback Master-Class Patterns.');
        return FALLBACK_PATTERNS;
    }

    console.log('   🔍 Suche nach High-End Open Source Design Systemen auf GitHub...');
    let patterns = '';
    
    try {
        // Just pick one query randomly or use a specific one
        const query = QUERIES[Math.floor(Math.random() * QUERIES.length)];
        const searchRes = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=3`, {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'Kimi-Design-Agent'
            }
        });

        if (!searchRes.ok) {
            throw new Error(`GitHub API Error: ${searchRes.status}`);
        }

        const searchData = await searchRes.json();
        
        if (searchData.items && searchData.items.length > 0) {
            for (const repo of searchData.items) {
                // Fetch repository contents to find components or styles
                // This is a simplified simulation of extracting patterns from the repo's README or structure
                // Real deep code extraction would require traversing the tree. We will extract the README as context 
                // and append our strict CSS Module guidelines.
                
                const readmeRes = await fetch(`https://api.github.com/repos/${repo.full_name}/readme`, {
                    headers: {
                        'Authorization': `token ${GITHUB_TOKEN}`,
                        'Accept': 'application/vnd.github.v3.raw',
                        'User-Agent': 'Kimi-Design-Agent'
                    }
                });

                if (readmeRes.ok) {
                    const readme = await readmeRes.text();
                    patterns += `\n--- GITHUB REFERENCE: ${repo.full_name} ---\n`;
                    patterns += readme.substring(0, 800) + '...\n';
                }
            }
        }
        
        if (patterns.length < 100) {
            patterns = FALLBACK_PATTERNS;
        } else {
            patterns += `\n\n${FALLBACK_PATTERNS}`; // Always append the strict CSS module pattern
        }

        return patterns;

    } catch (err) {
        console.log(`   ⚠️  GitHub Scraper Error: ${err.message}. Nutze Fallback.`);
        return FALLBACK_PATTERNS;
    }
}
