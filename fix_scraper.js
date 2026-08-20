import fs from 'fs/promises';
import path from 'path';

async function main() {
  const scraperContent = await fs.readFile('scraper.js', 'utf-8');
  
  // Modify scraper.js to skip screenshots if a valid one exists
  let newContent = scraperContent.replace(
    /await page\.screenshot\(\{ path: screenshotPath, fullPage: true \}\);/g,
    `
    const stats = await fs.stat(screenshotPath).catch(() => null);
    if (stats && stats.size > 100000) {
      console.log(\`[$\{domain}\] Screenshot already exists and is large enough, skipping capture.\`);
    } else {
      await page.screenshot({ path: screenshotPath, fullPage: true });
    }
    `
  );
  
  await fs.writeFile('scraper.js', newContent);
  console.log('scraper.js updated to protect existing screenshots');
}

main().catch(console.error);
