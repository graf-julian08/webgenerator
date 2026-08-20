import dotenv from 'dotenv';
dotenv.config();

const UNSPLASH_API_KEY = process.env.UNSPLASH_API_KEY || '';
const PEXELS_API_KEY = process.env.PEXELS_API_KEY || '';

// High-End Backup URLs (Fallbacks)
const FALLBACK_IMAGES = {
    watches: [
        'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=1920&q=80',
        'https://images.unsplash.com/photo-1524592094714-0f0654e20314?w=1920&q=80',
        'https://images.unsplash.com/photo-1522312346375-d1a52e2b99b3?w=1920&q=80',
        'https://images.unsplash.com/photo-1509048191080-d2984bad6ae5?w=1920&q=80',
        'https://images.unsplash.com/photo-1526045431048-f857369baa09?w=1920&q=80',
        'https://images.unsplash.com/photo-1587836374828-4dbafa94cf0e?w=1920&q=80',
    ],
    fashion: [
        'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=1920&q=80',
        'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=1920&q=80',
        'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=1920&q=80',
        'https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=1920&q=80',
        'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=1920&q=80',
    ],
    automotive: [
        'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1920&q=80',
        'https://images.unsplash.com/photo-1544636331-e26879cd4d9b?w=1920&q=80',
        'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=1920&q=80',
        'https://images.unsplash.com/photo-1553440569-bcc63803a83d?w=1920&q=80',
        'https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=1920&q=80',
    ],
    technology: [
        'https://images.unsplash.com/photo-1531297484001-80022131f5a1?w=1920&q=80',
        'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=1920&q=80',
        'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=1920&q=80',
        'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1920&q=80',
    ],
    beauty: [
        'https://images.unsplash.com/photo-1612817288484-6f916006741a?w=1920&q=80',
        'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=1920&q=80',
        'https://images.unsplash.com/photo-1571875257727-256c39da42af?w=1920&q=80',
        'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=1920&q=80',
    ],
    furniture: [
        'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=1920&q=80',
        'https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=1920&q=80',
        'https://images.unsplash.com/photo-1506439773649-6e0eb8cfb237?w=1920&q=80',
        'https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=1920&q=80',
    ],
    _default: [
        'https://images.unsplash.com/photo-1600607686527-6fb886090705?w=1920&q=80',
        'https://images.unsplash.com/photo-1515562141207-7a8efbf80c88?w=1920&q=80',
        'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1920&q=80',
        'https://images.unsplash.com/photo-1491553895911-0055eca6402d?w=1920&q=80',
        'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=1920&q=80',
    ]
};

const FALLBACK_VIDEOS = {
    automotive: 'https://videos.pexels.com/video-files/3121459/3121459-uhd_2560_1440_24fps.mp4',
    watches: 'https://videos.pexels.com/video-files/2795372/2795372-uhd_2560_1440_25fps.mp4',
    fashion: 'https://videos.pexels.com/video-files/4919760/4919760-uhd_2560_1440_30fps.mp4',
    _default: 'https://videos.pexels.com/video-files/3121459/3121459-uhd_2560_1440_24fps.mp4'
};

export async function fetchIndustryImages(industry, count = 6) {
    if (!UNSPLASH_API_KEY) {
        console.log('   ⚠️  Kein UNSPLASH_API_KEY. Nutze Fallback-Bilder.');
        return getFallbackImages(industry, count);
    }

    try {
        console.log(`   📷 Lade Unsplash-Bilder für "${industry} luxury"...`);
        const res = await fetch(`https://api.unsplash.com/photos/random?query=${industry}%20luxury&count=${count}&orientation=landscape`, {
            headers: {
                'Authorization': `Client-ID ${UNSPLASH_API_KEY}`
            }
        });

        if (!res.ok) {
            throw new Error(`Unsplash API Error: ${res.status}`);
        }

        const data = await res.json();
        const urls = data.map(img => img.urls.regular.replace('&w=1080', '&w=1920'));
        if (urls.length === 0) throw new Error("Empty Unsplash result");
        
        console.log(`   ✅ ${urls.length} Unsplash-Bilder geladen.`);
        // Fill up with fallbacks if we didn't get enough
        if (urls.length < count) {
            urls.push(...getFallbackImages(industry, count - urls.length));
        }
        return urls.slice(0, count);
    } catch (e) {
        console.log(`   ⚠️  Unsplash Error (${e.message}). Nutze Fallback-Bilder lautlos.`);
        return getFallbackImages(industry, count);
    }
}

export async function fetchIndustryVideo(industry) {
    if (!PEXELS_API_KEY) {
        return getFallbackVideo(industry);
    }

    try {
        const query = `luxury ${industry}`;
        console.log(`   🎬 Lade Pexels-Video für "${query}"...`);
        const res = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=15&orientation=landscape&size=large`, {
            headers: {
                'Authorization': PEXELS_API_KEY
            }
        });

        if (!res.ok) {
            throw new Error(`Pexels API Error: ${res.status}`);
        }

        const data = await res.json();
        if (data.videos && data.videos.length > 0) {
            // Pick a random video from top results
            const video = data.videos[Math.floor(Math.random() * Math.min(data.videos.length, 5))];
            // Get highest quality hd/uhd file
            const hdFiles = video.video_files.filter(f => f.quality === 'hd' || f.quality === 'uhd');
            if (hdFiles.length > 0) {
                // sort by width desc
                hdFiles.sort((a, b) => b.width - a.width);
                console.log(`   ✅ Pexels-Video geladen.`);
                return hdFiles[0].link;
            }
        }
        throw new Error("No suitable video found");
    } catch (e) {
        console.log(`   ⚠️  Pexels Error (${e.message}). Nutze Fallback-Video lautlos.`);
        return getFallbackVideo(industry);
    }
}

function getFallbackImages(industry, count) {
    const pool = FALLBACK_IMAGES[industry] || FALLBACK_IMAGES._default;
    // shuffle
    const shuffled = [...pool].sort(() => 0.5 - Math.random());
    while (shuffled.length < count) {
        shuffled.push(...[...pool].sort(() => 0.5 - Math.random()));
    }
    return shuffled.slice(0, count);
}

function getFallbackVideo(industry) {
    return FALLBACK_VIDEOS[industry] || FALLBACK_VIDEOS._default;
}
