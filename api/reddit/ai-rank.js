// AI Ranking API Endpoint for Reddit posts
// Uses OpenRouter to analyze post relevance based on user goals
// Returns relevance scores (0-10) for each post

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Default model - using free Meta Llama 3.3 70B for fast, efficient relevance scoring
// Can be overridden via OPENROUTER_MODEL env var
// Other good free options: qwen/qwen-2.5-72b-instruct:free, google/gemini-2.0-flash-exp:free
const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free';

function withCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return res;
}

async function rankPostsWithAI(posts, userGoals) {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY not configured');
  }

  if (!posts || !Array.isArray(posts) || posts.length === 0) {
    return [];
  }

  if (!userGoals || typeof userGoals !== 'string' || !userGoals.trim()) {
    throw new Error('User goals are required');
  }

  // Prepare posts data for AI analysis
  const postsData = posts.map(post => ({
    id: post.id,
    title: post.title || '',
    selftext: (post.selftext || '').substring(0, 500), // Limit text length
    subreddit: post.subreddit || '',
  }));

  // Create system prompt
  const systemPrompt = `You are an expert relevance analyzer specialized in evaluating Reddit posts for business opportunities, lead generation, and goal alignment.

User's specific goals and context: "${userGoals}"

Your task is to analyze each Reddit post and assign a relevance score from 0-10 based on how well it aligns with the user's stated objectives.

SCORING GUIDELINES:
- 0-2: Completely irrelevant, no connection to user's goals
- 3-4: Tangentially related, weak connection, unlikely to be useful
- 5-6: Moderately relevant, some connection but not a strong match
- 7-8: Highly relevant, strong connection, directly addresses user's needs, contains actionable value
- 9-10: Extremely relevant, perfect match, high-value opportunity, immediate actionable potential

EVALUATION CRITERIA (prioritize in this order):
1. Direct relevance: Does the post title/content directly relate to the user's goals?
2. Actionability: Does it provide actionable information, opportunities, or next steps?
3. Value potential: Would engaging with this post help the user achieve their objectives?
4. Opportunity quality: Is this a genuine opportunity (e.g., lead, partnership, learning, etc.)?
5. Context match: Does the subreddit and post content align with the user's industry/needs?

IMPORTANT INSTRUCTIONS:
- Be strict with scoring - only assign 7+ to posts that are genuinely highly relevant
- Consider the full context: title, content preview, and subreddit
- Look for keywords, topics, and themes that match the user's goals
- For business/lead generation goals, prioritize posts mentioning needs, problems, or opportunities
- Return ONLY a valid JSON array - no markdown, no explanations, no additional text

Return format (JSON array only):
[
  {"postId": "abc123", "relevanceScore": 8},
  {"postId": "def456", "relevanceScore": 3}
]`;

  // Create user message with posts
  const userMessage = `Analyze these ${postsData.length} Reddit posts and assign relevance scores based on the user's goals.

For each post, evaluate:
- Title: "${postsData.map(p => p.title).join('", "')}"
- Content preview: First 500 characters of post text
- Subreddit context: Where the post appears

Posts to analyze:
${JSON.stringify(postsData, null, 2)}

Return ONLY a JSON array with this exact format (one entry per post):
[{"postId": "post_id_here", "relevanceScore": number_between_0_and_10}, ...]

Ensure every post has a score. Be precise and consistent in your scoring.`;

  console.log(`AI Ranking: Calling OpenRouter API with model: ${DEFAULT_MODEL}`);
  console.log(`AI Ranking: Ranking ${posts.length} posts`);
  
  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.OPENROUTER_REFERER || 'https://reddit-dashboarder.vercel.app',
        'X-Title': 'Reddit Dashboarder AI Ranking',
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.3, // Lower temperature for more consistent scoring
      }),
    });

    console.log(`AI Ranking: OpenRouter API response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenRouter API error:', response.status, errorText);
      throw new Error(`OpenRouter API error: ${response.status} - ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content in OpenRouter response');
    }

    // Parse JSON response
    let parsed;
    try {
      // Try to extract JSON if wrapped in markdown code blocks
      const jsonMatch = content.match(/```(?:json)?\s*(\[.*?\])\s*```/s) || content.match(/(\[.*?\])/s);
      const jsonStr = jsonMatch ? jsonMatch[1] : content;
      parsed = JSON.parse(jsonStr);
    } catch (parseError) {
      // If it's a JSON object, try to extract the array
      try {
        const obj = JSON.parse(content);
        parsed = obj.scores || obj.results || obj.data || Object.values(obj).find(Array.isArray) || [];
      } catch (e) {
        console.error('Failed to parse AI response:', content);
        throw new Error('Invalid JSON response from AI');
      }
    }

    // Ensure we have an array
    if (!Array.isArray(parsed)) {
      throw new Error('AI response is not an array');
    }

    // Validate and normalize scores
    const results = parsed
      .filter(item => item.postId && typeof item.relevanceScore === 'number')
      .map(item => ({
        postId: String(item.postId),
        relevanceScore: Math.max(0, Math.min(10, Math.round(item.relevanceScore))),
      }));

    // Ensure all posts have scores (default to 0 if missing)
    const postIds = new Set(posts.map(p => String(p.id)));
    const scoredIds = new Set(results.map(r => r.postId));
    const missing = Array.from(postIds).filter(id => !scoredIds.has(id));
    missing.forEach(id => {
      results.push({ postId: id, relevanceScore: 0 });
    });

    return results;
  } catch (error) {
    console.error('Error ranking posts with AI:', error);
    throw error;
  }
}

async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return withCORS(res).status(204).end();
  }

  if (req.method !== 'POST') {
    return withCORS(res).status(405).json({ error: 'Method not allowed' });
  }

  console.log('=== AI Ranking API Request ===');
  console.log('Method:', req.method);
  console.log('URL:', req.url);

  try {
    // Parse request body (works with both Express and Vercel)
    let body;
    if (req.body && typeof req.body === 'object') {
      // Already parsed by Express middleware
      body = req.body;
    } else {
      // Parse manually for Vercel/serverless
      try {
        body = await new Promise((resolve, reject) => {
          let data = '';
          req.on('data', chunk => { data += chunk; });
          req.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(e);
            }
          });
          req.on('error', reject);
        });
      } catch (parseError) {
        return withCORS(res).status(400).json({ error: 'Invalid JSON body' });
      }
    }

    const { posts, userGoals } = body;

    console.log('AI Ranking: Received request for', posts?.length || 0, 'posts');
    console.log('AI Ranking: User goals length:', userGoals?.length || 0);

    if (!posts || !Array.isArray(posts)) {
      console.error('AI Ranking: Invalid posts array');
      return withCORS(res).status(400).json({ error: 'posts array is required' });
    }

    if (!userGoals || typeof userGoals !== 'string' || !userGoals.trim()) {
      console.error('AI Ranking: Invalid user goals');
      return withCORS(res).status(400).json({ error: 'userGoals string is required' });
    }

    if (posts.length === 0) {
      console.log('AI Ranking: No posts to rank');
      return withCORS(res).status(200).json({ scores: [] });
    }

    // Batch process posts (max 20 per request to avoid token limits)
    const BATCH_SIZE = 20;
    const batches = [];
    for (let i = 0; i < posts.length; i += BATCH_SIZE) {
      batches.push(posts.slice(i, i + BATCH_SIZE));
    }

    console.log(`AI Ranking: Processing ${batches.length} batches of up to ${BATCH_SIZE} posts each`);

    const allScores = [];
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      try {
        console.log(`AI Ranking: Processing batch ${i + 1}/${batches.length} (${batch.length} posts)`);
        const batchScores = await rankPostsWithAI(batch, userGoals);
        console.log(`AI Ranking: Batch ${i + 1} returned ${batchScores.length} scores`);
        allScores.push(...batchScores);
        // Small delay between batches to avoid rate limiting
        if (batches.length > 1 && i < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (batchError) {
        console.error(`AI Ranking: Error processing batch ${i + 1}:`, batchError);
        // Don't assign scores on error - let them remain undefined
        // This way the frontend won't show incorrect 0 scores
      }
    }

    console.log(`AI Ranking: Complete! Returning ${allScores.length} total scores`);
    return withCORS(res).status(200).json({
      scores: allScores,
      processed: allScores.length,
    });
  } catch (error) {
    console.error('AI ranking handler error:', error);
    return withCORS(res).status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
}

module.exports = handler;

