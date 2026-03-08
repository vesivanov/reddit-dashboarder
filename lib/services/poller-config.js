const { getAgentConfig } = require('../repos/agent-configs');
const { getActivePollerWorkspace } = require('../repos/poller-runtime');
const DEFAULT_SUBREDDITS = ['SEO', 'webdev', 'startups', 'freelance', 'marketing'];

function getDefaultSettings() {
  return {
    aiGoals: 'Find SEO and AI search consulting clients',
    aiContext: 'Helping businesses improve visibility in traditional and AI-powered search (ChatGPT, Perplexity)',
    aiThreshold: 4,
    openRouterModel: process.env.POLLER_OPENROUTER_MODEL || 'google/gemini-2.0-flash-exp:free',
    scoringConfig: null,
  };
}

function buildSettingsFromAgentConfig(config) {
  const defaults = getDefaultSettings();
  return {
    aiGoals: config?.goals || defaults.aiGoals,
    aiContext: config?.aiContext || '',
    aiThreshold: config?.threshold ?? defaults.aiThreshold,
    openRouterModel: config?.model || defaults.openRouterModel,
    scoringConfig: config?.scoringConfig || null,
  };
}

async function loadPollerRuntimeConfig() {
  const activeWorkspace = await getActivePollerWorkspace();

  if (activeWorkspace?.workspaceId) {
    const persistedConfig = await getAgentConfig(activeWorkspace.workspaceId);
    if (persistedConfig) {
      return {
        subreddits: persistedConfig.subreddits?.length ? persistedConfig.subreddits : DEFAULT_SUBREDDITS,
        settings: buildSettingsFromAgentConfig(persistedConfig),
        source: 'agent-config',
        activeWorkspace,
        persistedConfig,
      };
    }
  }

  return {
    subreddits: DEFAULT_SUBREDDITS,
    settings: getDefaultSettings(),
    source: 'defaults',
    activeWorkspace: activeWorkspace || null,
    persistedConfig: null,
  };
}

module.exports = {
  DEFAULT_SUBREDDITS,
  getDefaultSettings,
  buildSettingsFromAgentConfig,
  loadPollerRuntimeConfig,
};
