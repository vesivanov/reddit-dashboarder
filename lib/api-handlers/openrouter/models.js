const { readSignedCookie } = require('../../cookies');
const { withCORS } = require('../../cors');

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return withCORS(req, res, 'GET, OPTIONS').status(204).end();
  }

  if (req.method !== 'GET') {
    return withCORS(req, res, 'GET, OPTIONS').status(405).json({ error: 'Method not allowed' });
  }

  const cookieApiKey = readSignedCookie(req, 'openrouter_key');
  const apiKey = cookieApiKey || process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return withCORS(req, res, 'GET, OPTIONS').status(401).json({
      error: 'OpenRouter API key required',
      message: 'Add an OpenRouter API key to load available models.'
    });
  }

  try {
    const response = await fetch(OPENROUTER_MODELS_URL, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.OPENROUTER_REFERER || 'https://reddit-dashboarder.vercel.app',
        'X-Title': 'Reddit Dashboarder Model List',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      return withCORS(req, res, 'GET, OPTIONS').status(response.status).json({
        error: 'Failed to load models',
        message: text.slice(0, 300),
      });
    }

    const data = await response.json();
    const models = Array.isArray(data?.data) ? data.data : [];
    const simplified = models
      .map((model) => ({
        id: model.id || model.model || model.name,
        name: model.name || model.id || model.model,
        description: model.description || '',
        context_length: model.context_length || model.context_length_tokens || null,
        pricing: model.pricing || null,
        top_provider: model.top_provider || null,
        architecture: model.architecture || null,
        created: model.created || model.created_at || model.createdAt || null,
        updated: model.updated || model.updated_at || model.updatedAt || model.last_updated || model.last_updated_at || null,
      }))
      .filter((model) => model.id);

    return withCORS(req, res, 'GET, OPTIONS').status(200).json({
      models: simplified,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    return withCORS(req, res, 'GET, OPTIONS').status(500).json({
      error: 'Failed to load models',
      message: error.message,
    });
  }
};
