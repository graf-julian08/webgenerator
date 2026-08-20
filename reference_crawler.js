import FirecrawlApp from '@mendable/firecrawl-js';
import dotenv from 'dotenv';
import { callQwenBlueprint } from './multi_model_strategy.js';

dotenv.config();

const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
const firecrawl = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY });

// Filter out generic aggregator domains
const BANNED_DOMAINS = [
    'pinterest.com', 'dribbble.com', 'awwwards.com', 'behance.net',
    'siteinspire.com', 'youtube.com', 'instagram.com', 'facebook.com',
    'tiktok.com', 'twitter.com', 'x.com', 'medium.com',
    'reddit.com', 'amazon.com', 'ebay.com', 'etsy.com'
];

function getRandomSearchPhrases(prompt, industry) {
    const industryModifiers = {
        'furniture': [
            'luxury furniture website',
            'high-end furniture design',
            'editorial furniture layout',
            'award winning furniture site',
            'furniture e-commerce best practices'
        ],
        'fashion': [
            'luxury fashion website',
            'high-end fashion ecommerce',
            'minimalist fashion design',
            'editorial fashion layout',
            'award winning fashion site',
            'fashion e-commerce best practices'
        ],
        'technology': [
            'premium tech website',
            'minimalist tech design',
            'editorial tech layout',
            'award winning tech site',
            'tech e-commerce best practices'
        ],
        'beauty': [
            'luxury beauty website',
            'high-end beauty ecommerce',
            'minimalist beauty design',
            'editorial beauty layout',
            'beauty e-commerce best practices'
        ],
        'automotive': [
            'luxury automotive website',
            'high-end automotive ecommerce',
            'minimalist automotive design',
            'editorial automotive layout',
            'award winning automotive site'
        ],
        'jewelry': [
            'luxury jewelry website',
            'high-end jewelry ecommerce',
            'minimalist jewelry design',
            'editorial jewelry layout',
            'award winning jewelry site'
        ]
    };

    // Default modifiers for industries not specifically defined
    const defaultModifiers = [
        "best e-commerce design",
        "luxury website",
        "high-end online shop",
        "minimalist ecommerce",
        "editorial layout shop",
        "award winning website"
    ];

    const modifiers = industryModifiers[industry] || defaultModifiers;

    // Shuffle modifiers to get randomness
    const shuffled = modifiers.sort(() => 0.5 - Math.random());
    const selectedModifiers = shuffled.slice(0, 3);

    return [
        `${prompt} ${selectedModifiers[0]}`,
        `${industry} ${selectedModifiers[1]}`,
        `best ${industry} ${selectedModifiers[2]}`
    ];
}

async function searchTopSites(prompt, industry) {
    if (!TAVILY_API_KEY) throw new Error("TAVY_API_KEY is missing");

    console.log(`   🔍 Suche im Web nach echten "${prompt}" Referenzen...`);
    const queries = getRandomSearchPhrases(prompt, industry);
    const urls = new Set();

    for (const query of queries) {
        try {
            const res = await fetch('https://api.tavily.com/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    api_key: TAVILY_API_KEY,
                    query: query,
                    search_depth: 'advanced', // Use advanced search for better results
                    max_results: 8, // Get more results to filter quality
                    include_domains: [], // We want actual shops
                    exclude_domains: BANNED_DOMAINS
                }),
            });
            if (res.ok) {
                const data = await res.json();
                if (data.results) {
                    // Filter for high-quality sites with better scoring
                    const qualityResults = data.results
                        .filter(r => r.score && r.score > 0.7) // Only high-scoring results
                        .sort((a, b) => (b.score || 0) - (a.score || 0)) // Sort by quality score
                        .slice(0, 5); // Take top 5

                    qualityResults.forEach(r => {
                        // Ensure we get the base URL or clean product URL
                        const urlObj = new URL(r.url);
                        if (!BANNED_DOMAINS.some(domain => urlObj.hostname.includes(domain))) {
                            urls.add(r.url);
                        }
                    });
                }
            }
        } catch (e) {
            console.error(`Tavily search failed for ${query}:`, e.message);
        }
    }

    const urlArray = Array.from(urls);
    // Sort by quality and pick top 3
    const sortedUrls = urlArray.sort((a, b) => {
        // Try to get quality scores from the URLs if possible
        // For now, we'll just shuffle but could implement better logic
        return Math.random() - 0.5;
    });
    const topUrls = sortedUrls.slice(0, 3);
    return topUrls;
}

async function crawlSite(url) {
    console.log(`   🕸️  Crawling: ${url}...`);
    try {
        const scrapeResult = await firecrawl.scrape(url, {
            formats: ['markdown'],
        });
        if (scrapeResult && scrapeResult.markdown) {
            // Truncate to max 3000 chars per site to save tokens
            return `URL: ${url}\n\n${scrapeResult.markdown.slice(0, 3000)}`;
        }
    } catch (e) {
        console.error(`   ⚠️  Firecrawl failed for ${url}:`, e.message);
    }
    return null;
}

export async function synthesizeMasterWireframe(prompt, industry) {
    console.log(`\n🌐 Phase 0.5: DYNAMIC REFERENCE CRAWLER`);
    try {
        const urls = await searchTopSites(prompt, industry);
        if (urls.length === 0) {
            console.log("   ⚠️  Keine Referenzseiten gefunden. Nutze Fallback.");
            return null;
        }

        console.log(`   ✅ 3 Referenzseiten gefunden. Starte Crawling...`);
        const crawlPromises = urls.map(url => crawlSite(url));
        const results = await Promise.allSettled(crawlPromises);

        const markdowns = results
            .filter(r => r.status === 'fulfilled' && r.value)
            .map(r => r.value);

        if (markdowns.length === 0) {
            console.log("   ⚠️  Crawling aller Seiten fehlgeschlagen. Nutze Fallback.");
            return null;
        }

        console.log(`   🧠 Synthetisiere Master-Wireframe aus ${markdowns.length} echten Seiten...`);

        const llmPrompt = `You are a world-class UX/UI architect for high-end e-commerce (like Prada, Louis Vuitton, Apple) and a professional web designer.

        We are building an online shop for the user's request: "${prompt}". Industry: ${industry}.
        
        Here is the crawled markdown source code from real top websites in this industry:
        
        ${markdowns.join('\n\n================================\n\n')}
        
        YOUR TASK:
        Analyze these real sites and create a COMBINED, UNIQUE, and EXTREMELY HIGH-QUALITY layout architecture ("Master-Wireframe") for our new shop.
        
        Take the best ideas (e.g., how they build the mega-menu, what links they have in the footer, how they present products) and combine them into a master plan.
        
        MOST IMPORTANT RULES FOR THE MASTER-WIREFRAME:
        1. HEADER: Must have functional icons (search, cart, wishlist, user) and a logo. The arrangement (e.g., left/center/right) is up to you based on the references.
        2. MEGA-MENU: Must be a real catalog menu (e.g., with categories and a teaser image).
        3. FOOTER: Must be fully functional (newsletter, legal, customer service, social media, language selector).
        4. PRODUCT SECTIONS: Must have a clear hierarchy with appropriate spacing between images and text.
        5. TYPICAL PORTRAIT FORMAT: All product images must have a fashion-typical portrait format (e.g., aspect-ratio: 3/4).
        
        Describe in detail how the DOM tree (header, hero, menu, sections, detail page, footer) must be exactly built. Be precise. No generic phrases. Give me hard layout facts.
        
        IMPORTANT: The design must look professional and must not look generic or AI-generated. Every section must look like it was designed by professionals.
        `;

        const masterWireframe = await callQwenBlueprint(llmPrompt);
        console.log(`   ✅ Master-Wireframe erfolgreich erstellt!`);
        return masterWireframe;

    } catch (e) {
        console.error("   ❌ Reference Crawler Fehler:", e);
        return null;
    }
}
