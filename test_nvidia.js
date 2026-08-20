import OpenAI from 'openai';
import dotenv from 'dotenv';
dotenv.config();

const nvidia = new OpenAI({
    apiKey: process.env.NVIDIA_API_KEY,
    baseURL: 'https://integrate.api.nvidia.com/v1',
});

async function test() {
    const endpoints = [
        'https://integrate.api.nvidia.com/v1',
        'https://api.nvidia.com/v1',
    ];

    for (const url of endpoints) {
        console.log(`\nTesting endpoint: ${url}`);
        const client = new OpenAI({
            apiKey: process.env.NVIDIA_API_KEY,
            baseURL: url,
        });

        try {
            const models = await client.models.list();
            const modelId = 'meta/llama-3.1-70b-instruct';
            const hasModel = models.data.some(m => m.id === modelId);
            
            if (hasModel) {
                console.log(`Calling ${modelId}...`);
                const res = await client.chat.completions.create({
                    model: modelId,
                    messages: [{ role: 'user', content: 'Say hello' }],
                });
                console.log(`Success calling ${modelId}:`, res.choices[0].message.content);
            } else {
                console.log(`${modelId} not found in list.`);
            }
        } catch (e) {
            console.log(`Failed at ${url}:`, e.message, e.status);
        }
    }
}

test();
