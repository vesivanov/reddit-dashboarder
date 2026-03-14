const crypto = require('crypto');

function createAiRankingRequestId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `airank_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function logAiRankingEvent(eventType, payload = {}) {
  const entry = {
    time: new Date().toISOString(),
    eventType: String(eventType || 'unknown'),
    ...payload,
  };
  try {
    console.log('[ai-ranking-event]', JSON.stringify(entry));
  } catch (_error) {
    console.log('[ai-ranking-event]', entry);
  }
}

module.exports = {
  createAiRankingRequestId,
  logAiRankingEvent,
};
