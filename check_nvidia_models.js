import OpenAI from 'openai';
import dotenv from 'dotenv';
dotenv.config();

const nvidia = new OpenAI({
    apiKey: process.env.NVIDIA_API_KEY,
    baseURL: 'https://integrate.api.nvidia.com/v1',
});

async function listAvailableModels() {
    try {
        console.log('Fetching available models from NVIDIA API...');
        const models = await nvidia.models.list();
        console.log('Available models:');

        const modelIds = models.data.map(model => model.id);
        modelIds.forEach(modelId => {
            console.log(`- ${modelId}`);
        });

        return modelIds;
    } catch (error) {
        console.error('Error fetching models:', error);
        return [];
    }
}

listAvailableModels();