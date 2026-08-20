import OpenAI from 'openai';
import dotenv from 'dotenv';
dotenv.config();

const kimi = new OpenAI({
    apiKey: process.env.KIMI_API_KEY,
    baseURL: 'https://api.moonshot.cn/v1',
});

async function test() {
    try {
        console.log("Teste API Key:", process.env.KIMI_API_KEY ? process.env.KIMI_API_KEY.substring(0, 8) + '...' : 'FEHLT');
        const response = await kimi.models.list();
        console.log("Erfolg!");
    } catch (e) {
        console.error("Fehler:", e.status, e.message);
    }
}
test();
