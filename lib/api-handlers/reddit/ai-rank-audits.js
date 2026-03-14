const { withCORS } = require('../../cors');
const { ensureSessionOrBearerAuthorized } = require('../../http/session-or-bearer-auth');
const {
  listAiRankingAudits,
  getAiRankingAudit,
} = require('../../repos/ai-ranking-audits');

function ensureAuthorized(req, res) {
  return ensureSessionOrBearerAuthorized(req, res, {
    methods: 'GET, OPTIONS',
    message: 'AI ranking audit access requires an authenticated session or valid bearer token.',
  });
}

async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return withCORS(req, res, 'GET, OPTIONS').status(204).end();
  }

  if (req.method !== 'GET') {
    return withCORS(req, res, 'GET, OPTIONS').status(405).json({ error: 'Method not allowed' });
  }

  if (!ensureAuthorized(req, res)) return;

  try {
    const auditId = String(req.query?.id || '').trim();
    if (auditId) {
      const audit = await getAiRankingAudit(auditId);
      if (!audit) {
        return withCORS(req, res, 'GET, OPTIONS').status(404).json({
          error: 'Audit not found',
          message: `No AI ranking audit found for id ${auditId}.`,
        });
      }
      return withCORS(req, res, 'GET, OPTIONS').status(200).json({
        audit,
      });
    }

    const limit = Number(req.query?.limit) || 20;
    const clientRunId = String(req.query?.client_run_id || '').trim();
    const audits = await listAiRankingAudits({ limit, clientRunId });
    return withCORS(req, res, 'GET, OPTIONS').status(200).json({
      audits,
      count: audits.length,
    });
  } catch (error) {
    console.error('[ai-ranking-audits] Error:', error.message);
    return withCORS(req, res, 'GET, OPTIONS').status(500).json({
      error: 'Internal error',
      message: 'Unable to read AI ranking audits right now.',
    });
  }
}

module.exports = handler;
