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
  const logMethod = entry.eventType === 'batch_failed' || entry.eventType === 'request_error'
    ? console.error
    : console.warn;
  try {
    logMethod('[ai-ranking-event]', JSON.stringify(entry));
  } catch (_error) {
    logMethod('[ai-ranking-event]', entry);
  }
}

function logAiRankingEvents(eventType, payloads = []) {
  const entries = Array.isArray(payloads) ? payloads : [];
  entries.forEach((payload) => {
    logAiRankingEvent(eventType, payload);
  });
}

module.exports = {
  createAiRankingRequestId,
  logAiRankingEvent,
  logAiRankingEvents,
};
