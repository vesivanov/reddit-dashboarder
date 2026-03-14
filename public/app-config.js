(function initApp(globalScope) {
    const BUILD_INFO = globalScope.RDDBuildInfo || null;

    const DEFAULT_API_URL = "/api/reddit/snapshot";
    const DEFAULT_SUBS = [];
    const STARTER_PACKS = [
      {
        id: 'tech-news',
        label: 'Tech News',
        emoji: '💻',
        subs: ['technology', 'gadgets', 'futurology', 'programming'],
      },
      {
        id: 'design-inspo',
        label: 'Design',
        emoji: '🎨',
        subs: ['design', 'web_design', 'graphic_design', 'productdesign'],
      },
      {
        id: 'data-ai',
        label: 'AI & Data',
        emoji: '🤖',
        subs: ['machinelearning', 'datascience', 'openai', 'artificial'],
      },
    ];
    const POPULAR_SUBREDDITS = [
      'askreddit', 'worldnews', 'news', 'technology', 'programming',
      'todayilearned', 'design', 'dataisbeautiful', 'futurology',
      'productdesign', 'webdev', 'javascript', 'python', 'rust',
    ];
    const UPVOTE_PRESETS = [
      { value: '', label: 'Any' },
      { value: '10', label: '10+' },
      { value: '50', label: '50+' },
      { value: '100', label: '100+' },
      { value: '500', label: '500+' },
    ];
    const COMMENT_PRESETS = [
      { value: '', label: 'Any' },
      { value: '5', label: '5+' },
      { value: '20', label: '20+' },
      { value: '50', label: '50+' },
    ];
    const OPPORTUNITY_PRIORITY_PRESETS = [
      { value: '', label: 'Any' },
      { value: '3', label: '3+' },
      { value: '4', label: '4+' },
      { value: '5', label: '5+' },
    ];
    const AUTO_REFRESH_OPTIONS = [5, 10, 15, 30, 45, 60];
    const MIN_AUTO_REFRESH_MINUTES = 5;
    const DEFAULT_OPENROUTER_MODEL = 'stepfun/step-3.5-flash:free';
    const AI_PROMPT_VERSION = 'v6.0';
    const DEFAULT_LLM_POST_LIMIT = 180;
    const LLM_SCORE_MORE_STEP = 60;
    const MAX_LLM_POST_LIMIT = 1000;
    const LATEST_MODEL_COUNT = 10;
    const AI_CACHE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
    const AI_PRESETS = [
      {
        id: 'leads',
        label: 'Leads',
        emoji: '🎯',
        goals: 'I am looking for people or companies actively asking for help with my services or willing to pay for solutions.',
        avoid: ['memes', 'jokes', 'off-topic'],
        keywords: ['looking for', 'recommend', 'seeking', 'need', 'help', 'agency', 'freelancer', 'consultant', 'budget', 'hire'],
        subreddits: ['forhire', 'freelance', 'startup', 'entrepreneur', 'smallbusiness']
      },
      {
        id: 'research',
        label: 'Research',
        emoji: '🔍',
        goals: 'I want deep research, analyses, and technical breakdowns that help me learn or make decisions.',
        avoid: ['memes', 'low effort', 'speculation'],
        keywords: ['analysis', 'benchmark', 'study', 'paper', 'dataset', 'survey', 'comparison', 'architecture', 'tutorial'],
        subreddits: ['machinelearning', 'datascience', 'programming', 'science', 'research']
      },
      {
        id: 'hiring',
        label: 'Hiring',
        emoji: '👥',
        goals: 'I want to find hiring posts, job leads, or teams recruiting relevant roles.',
        avoid: ['memes', 'off-topic'],
        keywords: ['hiring', 'job', 'role', 'opening', 'recruit', 'position', 'apply', 'career'],
        subreddits: ['hiring', 'forhire', 'jobs', 'cscareerquestions', 'remotework']
      },
      {
        id: 'feedback',
        label: 'Product Feedback',
        emoji: '🧪',
        goals: 'I want product feedback requests, user pain points, and actionable critiques about products or workflows.',
        avoid: ['memes', 'showoff'],
        keywords: ['feedback', 'roast', 'critique', 'pain point', 'frustrating', 'wish', 'feature'],
        subreddits: ['productdesign', 'uxdesign', 'startups', 'sideproject', 'webdev']
      },
      {
        id: 'trends',
        label: 'Trends',
        emoji: '📈',
        goals: 'I want emerging trends, fast-moving topics, and popular conversations to spot opportunities early.',
        avoid: ['old news', 'reposts'],
        keywords: ['trend', 'emerging', 'breaking', 'launch', 'release', 'new', 'announce'],
        subreddits: ['technology', 'futurology', 'producthunt', 'startups', 'news']
      }
    ];
    const FALLBACK_MODELS = [
      { id: 'stepfun/step-3.5-flash:free', name: 'Step 3.5 Flash (Free)', tier: 'free', speed: 'fast' },
      { id: 'z-ai/glm-4.5-air:free', name: 'GLM 4.5 Air (Free)', tier: 'free', speed: 'fast' },
      { id: 'qwen/qwen3-next-80b-a3b-instruct:free', name: 'Qwen3 Next 80B A3B (Free)', tier: 'free', speed: 'balanced' },
      { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Meta Llama 3.3 70B (Free)', tier: 'free', speed: 'balanced' },
      { id: 'openai/gpt-oss-20b:free', name: 'GPT OSS 20B (Free)', tier: 'free', speed: 'fast' },
      { id: 'openrouter/free', name: 'OpenRouter Free Router', tier: 'free', speed: 'balanced' },
      { id: 'openai/gpt-4o', name: 'GPT-4o', tier: 'paid', speed: 'balanced' },
      { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', tier: 'paid', speed: 'fast' },
      { id: 'anthropic/claude-sonnet-4.5', name: 'Claude Sonnet 4.5', tier: 'paid', speed: 'balanced' },
      { id: 'google/gemini-pro-1.5', name: 'Gemini Pro 1.5', tier: 'paid', speed: 'balanced' },
    ];
  globalScope.RDDAppConfig = {
    DEFAULT_API_URL,
    DEFAULT_SUBS,
    STARTER_PACKS,
    POPULAR_SUBREDDITS,
    UPVOTE_PRESETS,
    COMMENT_PRESETS,
    OPPORTUNITY_PRIORITY_PRESETS,
    AUTO_REFRESH_OPTIONS,
    MIN_AUTO_REFRESH_MINUTES,
    DEFAULT_OPENROUTER_MODEL,
    AI_PROMPT_VERSION,
    DEFAULT_LLM_POST_LIMIT,
    LLM_SCORE_MORE_STEP,
    MAX_LLM_POST_LIMIT,
    LATEST_MODEL_COUNT,
    AI_CACHE_EXPIRY_MS,
    AI_PRESETS,
    FALLBACK_MODELS,
    BUILD_INFO,
  };
})(typeof window !== "undefined" ? window : globalThis);
