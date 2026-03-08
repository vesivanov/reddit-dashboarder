const storage = require('../storage');
const { computeTtlSeconds } = require('./agent-snapshots');

const ANALYSIS_PREFIX = 'agent-analysis:';

function buildAnalysisKey(snapshotId) {
  return `${ANALYSIS_PREFIX}${snapshotId}`;
}

async function getAgentAnalysis(snapshotId) {
  if (!snapshotId) return null;
  return storage.get(buildAnalysisKey(snapshotId));
}

async function saveAgentAnalysis(snapshotId, analysis, { expiresAt, ttlSeconds } = {}) {
  if (!snapshotId || !analysis) return null;
  const effectiveTtl = ttlSeconds || computeTtlSeconds(expiresAt);
  await storage.set(buildAnalysisKey(snapshotId), analysis, effectiveTtl);
  return analysis;
}

module.exports = {
  ANALYSIS_PREFIX,
  buildAnalysisKey,
  getAgentAnalysis,
  saveAgentAnalysis,
};
