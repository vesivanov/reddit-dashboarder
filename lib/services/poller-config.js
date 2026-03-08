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

function buildDerivedGoalText(opportunityConfig = {}, fallbackGoals = '') {
  const lines = [];
  if (opportunityConfig.businessOffering) lines.push(`Offering: ${opportunityConfig.businessOffering}`);
  if (opportunityConfig.idealCustomer) lines.push(`Ideal customer: ${opportunityConfig.idealCustomer}`);
  if (opportunityConfig.problemsSolved) lines.push(`Problems solved: ${opportunityConfig.problemsSolved}`);
  if (Array.isArray(opportunityConfig.opportunityTypes) && opportunityConfig.opportunityTypes.length) {
    lines.push(`Prioritize opportunities: ${opportunityConfig.opportunityTypes.join(', ')}`);
  }
  if (fallbackGoals) lines.push(`Additional goal: ${fallbackGoals}`);
  return lines.join('\n').trim();
}

function buildDerivedContextText(opportunityConfig = {}, fallbackContext = '') {
  const parts = [];
  if (opportunityConfig.preferredEngagement === 'reply') parts.push('Preferred engagement style: public reply first.');
  if (opportunityConfig.preferredEngagement === 'dm') parts.push('Preferred engagement style: direct outreach when appropriate.');
  if (opportunityConfig.preferredEngagement === 'either') parts.push('Preferred engagement style: either public reply or direct outreach.');
  if (opportunityConfig.preferredEngagement === 'research') parts.push('Preferred engagement style: research only.');
  if (opportunityConfig.strategyPreset === 'sales') parts.push('Ranking strategy: optimize for sales opportunities and likely client conversion.');
  if (opportunityConfig.strategyPreset === 'fast_wins') parts.push('Ranking strategy: optimize for easy engagement and fast response.');
  if (opportunityConfig.strategyPreset === 'research') parts.push('Ranking strategy: optimize for research value and messaging insight.');
  if (opportunityConfig.strategyPreset === 'balanced') parts.push('Ranking strategy: balance engagement, fit, urgency, and conversion potential.');
  if (opportunityConfig.strictness === 'strict') parts.push('Strictness: favor precision and conservative ranking.');
  if (opportunityConfig.strictness === 'broad') parts.push('Strictness: favor broader recall.');
  if (opportunityConfig.strictness === 'balanced') parts.push('Strictness: balanced precision and recall.');
  if (fallbackContext) parts.push(fallbackContext);
  return parts.join('\n').trim();
}

function buildSettingsFromAgentConfig(config) {
  const defaults = getDefaultSettings();
  const opportunityConfig = config?.opportunityConfig || null;
  const derivedGoals = opportunityConfig ? buildDerivedGoalText(opportunityConfig, config?.goals || '') : '';
  const derivedContext = opportunityConfig ? buildDerivedContextText(opportunityConfig, config?.aiContext || '') : '';
  return {
    aiGoals: derivedGoals || config?.goals || defaults.aiGoals,
    aiContext: derivedContext || config?.aiContext || '',
    aiThreshold: config?.threshold ?? defaults.aiThreshold,
    openRouterModel: config?.model || defaults.openRouterModel,
    opportunityConfig,
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
  buildDerivedGoalText,
  buildDerivedContextText,
  loadPollerRuntimeConfig,
};
