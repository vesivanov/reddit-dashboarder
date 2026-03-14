const crypto = require('crypto');
const storage = require('../storage');

const AI_RANKING_AUDIT_INDEX_KEY = 'ai-ranking-audits:index';
const AI_RANKING_AUDIT_PREFIX = 'ai-ranking-audit:';
const DEFAULT_AI_RANKING_AUDIT_TTL_SECONDS = 14 * 24 * 60 * 60;
const DEFAULT_AI_RANKING_AUDIT_MAX_RECENT = 100;
const DEFAULT_AI_RANKING_AUDIT_CHUNK_SIZE = 50;
const DEFAULT_UPDATE_RETRIES = 8;

function readAuditTtlSeconds() {
  const raw = Number(process.env.AI_RANKING_AUDIT_TTL_SECONDS);
  if (Number.isFinite(raw) && raw > 0) return Math.max(60, Math.floor(raw));
  return DEFAULT_AI_RANKING_AUDIT_TTL_SECONDS;
}

function readMaxRecentAudits() {
  const raw = Number(process.env.AI_RANKING_AUDIT_MAX_RECENT);
  if (Number.isFinite(raw) && raw > 0) return Math.max(1, Math.floor(raw));
  return DEFAULT_AI_RANKING_AUDIT_MAX_RECENT;
}

function readAuditChunkSize() {
  const raw = Number(process.env.AI_RANKING_AUDIT_CHUNK_SIZE);
  if (Number.isFinite(raw) && raw > 0) return Math.max(1, Math.floor(raw));
  return DEFAULT_AI_RANKING_AUDIT_CHUNK_SIZE;
}

function buildAiRankingAuditMetaKey(auditId) {
  return `${AI_RANKING_AUDIT_PREFIX}${auditId}:meta`;
}

function buildAiRankingAuditChunkKey(auditId, chunkIndex) {
  return `${AI_RANKING_AUDIT_PREFIX}${auditId}:chunk:${chunkIndex}`;
}

function createAuditId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `airaudit_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function clampLimit(limit, fallback = 20) {
  const normalized = Number(limit);
  if (!Number.isFinite(normalized) || normalized <= 0) return fallback;
  return Math.max(1, Math.floor(normalized));
}

function sanitizeText(value, maxLen = 4000) {
  return String(value || '').trim().slice(0, maxLen);
}

function sanitizePost(post = {}) {
  if (!post || typeof post !== 'object') return null;
  return {
    id: String(post.id || '').trim(),
    title: String(post.title || ''),
    selftext: String(post.selftext || ''),
    subreddit: String(post.subreddit || ''),
    url: String(post.url || ''),
    external_url: String(post.external_url || ''),
    domain: String(post.domain || ''),
    score: Number(post.score) || 0,
    num_comments: Number(post.num_comments) || 0,
    created_utc: Number(post.created_utc) || 0,
    link_flair_text: String(post.link_flair_text || ''),
  };
}

function sanitizeRankingOutcome(item = {}) {
  return {
    postId: String(item.postId || item.post?.id || '').trim(),
    score: item.score ?? null,
    metadata: item.metadata || null,
    opportunity: item.opportunity || null,
    review: item.review || null,
  };
}

function splitIntoChunks(entries, chunkSize = readAuditChunkSize()) {
  const normalizedChunkSize = Math.max(1, Math.floor(Number(chunkSize) || readAuditChunkSize()));
  const chunks = [];
  for (let index = 0; index < entries.length; index += normalizedChunkSize) {
    chunks.push(entries.slice(index, index + normalizedChunkSize));
  }
  return chunks;
}

function buildAuditSummary(meta = {}) {
  return {
    auditId: meta.auditId,
    requestId: meta.requestId || null,
    recordedAt: meta.recordedAt || Date.now(),
    status: meta.status || 'success',
    requestedModel: meta.requestedModel || 'unknown',
    resolvedModel: meta.resolvedModel || meta.requestedModel || 'unknown',
    postCount: Number(meta.postCount) || 0,
    processedCount: Number(meta.processedCount) || 0,
    failedCount: Number(meta.failedCount) || 0,
    llmReviewedCount: Number(meta.llmReviewedCount) || 0,
    heuristicOnlyCount: Number(meta.heuristicOnlyCount) || 0,
    failedReviewCount: Number(meta.failedReviewCount) || 0,
    durationMs: Number(meta.durationMs) || 0,
    fallbackUsed: Boolean(meta.fallbackUsed),
    routingFallbackUsed: Boolean(meta.routingFallbackUsed),
    clientRunId: String(meta.auditContext?.clientRunId || '').trim() || null,
    chunkIndex: Number(meta.auditContext?.chunkIndex) || 0,
    totalChunks: Number(meta.auditContext?.totalChunks) || 1,
    totalFeedPosts: Number(meta.auditContext?.totalFeedPosts) || Number(meta.postCount) || 0,
    promptVersion: meta.promptVersion || null,
    scoringMode: meta.scoringMode || 'hybrid',
  };
}

function sanitizeAuditMeta(audit = {}, now = Date.now()) {
  const auditId = String(audit.auditId || createAuditId());
  const auditContext = audit.auditContext && typeof audit.auditContext === 'object'
    ? {
        clientRunId: String(audit.auditContext.clientRunId || '').trim() || null,
        chunkIndex: Math.max(0, Number(audit.auditContext.chunkIndex) || 0),
        totalChunks: Math.max(1, Number(audit.auditContext.totalChunks) || 1),
        totalFeedPosts: Math.max(0, Number(audit.auditContext.totalFeedPosts) || 0),
      }
    : null;

  return {
    auditId,
    requestId: String(audit.requestId || '').trim() || null,
    recordedAt: Number(audit.recordedAt) || now,
    status: ['success', 'partial', 'error'].includes(audit.status) ? audit.status : 'success',
    requestedModel: String(audit.requestedModel || '').trim() || 'unknown',
    resolvedModel: String(audit.resolvedModel || '').trim() || String(audit.requestedModel || '').trim() || 'unknown',
    modelsUsed: Array.isArray(audit.modelsUsed)
      ? Array.from(new Set(audit.modelsUsed.map((value) => String(value || '').trim()).filter(Boolean))).slice(0, 5)
      : [],
    requestStrategiesUsed: Array.isArray(audit.requestStrategiesUsed)
      ? Array.from(new Set(audit.requestStrategiesUsed.map((value) => String(value || '').trim()).filter(Boolean))).slice(0, 10)
      : [],
    fallbackUsed: Boolean(audit.fallbackUsed),
    routingFallbackUsed: Boolean(audit.routingFallbackUsed),
    promptVersion: String(audit.promptVersion || '').trim() || null,
    scoringMode: String(audit.scoringMode || '').trim() || 'hybrid',
    postCount: Math.max(0, Number(audit.postCount) || 0),
    processedCount: Math.max(0, Number(audit.processedCount) || 0),
    failedCount: Math.max(0, Number(audit.failedCount) || 0),
    llmReviewedCount: Math.max(0, Number(audit.llmReviewedCount) || 0),
    heuristicOnlyCount: Math.max(0, Number(audit.heuristicOnlyCount) || 0),
    failedReviewCount: Math.max(0, Number(audit.failedReviewCount) || 0),
    batchCount: Math.max(0, Number(audit.batchCount) || 0),
    successfulBatchCount: Math.max(0, Number(audit.successfulBatchCount) || 0),
    failedBatchCount: Math.max(0, Number(audit.failedBatchCount) || 0),
    durationMs: Math.max(0, Number(audit.durationMs) || 0),
    bodySizeBytes: Math.max(0, Number(audit.bodySizeBytes) || 0),
    failedPostIds: Array.isArray(audit.failedPostIds)
      ? audit.failedPostIds.map((value) => String(value || '').trim()).filter(Boolean).slice(0, 250)
      : [],
    errorCode: String(audit.errorCode || '').trim() || null,
    errorMessage: sanitizeText(audit.errorMessage || '', 500) || null,
    goalText: sanitizeText(audit.goalText || '', 4000),
    userContext: sanitizeText(audit.userContext || '', 4000),
    scoringConfig: audit.scoringConfig && typeof audit.scoringConfig === 'object'
      ? {
          lookingFor: sanitizeText(audit.scoringConfig.lookingFor || '', 4000),
          avoid: sanitizeText(audit.scoringConfig.avoid || '', 2000),
          examples: {
            perfect: sanitizeText(audit.scoringConfig.examples?.perfect || '', 2000),
            strong: sanitizeText(audit.scoringConfig.examples?.strong || '', 2000),
            reject: sanitizeText(audit.scoringConfig.examples?.reject || '', 2000),
          },
        }
      : null,
    metrics: audit.metrics && typeof audit.metrics === 'object'
      ? {
          batchCount: Math.max(0, Number(audit.metrics.batchCount) || 0),
          successfulBatchCount: Math.max(0, Number(audit.metrics.successfulBatchCount) || 0),
          failedBatchCount: Math.max(0, Number(audit.metrics.failedBatchCount) || 0),
          postCount: Math.max(0, Number(audit.metrics.postCount) || 0),
          processedCount: Math.max(0, Number(audit.metrics.processedCount) || 0),
          failedCount: Math.max(0, Number(audit.metrics.failedCount) || 0),
          llmReviewedCount: Math.max(0, Number(audit.metrics.llmReviewedCount) || 0),
          heuristicOnlyCount: Math.max(0, Number(audit.metrics.heuristicOnlyCount) || 0),
          failedReviewCount: Math.max(0, Number(audit.metrics.failedReviewCount) || 0),
          durationMs: Math.max(0, Number(audit.metrics.durationMs) || 0),
          requestedModel: String(audit.metrics.requestedModel || '').trim() || null,
          modelsUsed: Array.isArray(audit.metrics.modelsUsed)
            ? Array.from(new Set(audit.metrics.modelsUsed.map((value) => String(value || '').trim()).filter(Boolean))).slice(0, 5)
            : [],
          requestStrategiesUsed: Array.isArray(audit.metrics.requestStrategiesUsed)
            ? Array.from(new Set(audit.metrics.requestStrategiesUsed.map((value) => String(value || '').trim()).filter(Boolean))).slice(0, 10)
            : [],
          fallbackUsed: Boolean(audit.metrics.fallbackUsed),
          routingFallbackUsed: Boolean(audit.metrics.routingFallbackUsed),
        }
      : null,
    auditContext,
  };
}

function sanitizeAuditEntries(entries = []) {
  return (Array.isArray(entries) ? entries : [])
    .map((entry) => {
      const post = sanitizePost(entry?.post || {});
      const ranking = sanitizeRankingOutcome(entry);
      if (!ranking.postId) return null;
      return {
        postId: ranking.postId,
        post,
        ranking,
      };
    })
    .filter(Boolean);
}

async function updateAuditIndex(summary, {
  ttlSeconds = readAuditTtlSeconds(),
  maxRetries = DEFAULT_UPDATE_RETRIES,
} = {}) {
  let current = await storage.get(AI_RANKING_AUDIT_INDEX_KEY);
  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    const currentList = Array.isArray(current) ? current : [];
    const nextValue = [summary, ...currentList.filter((entry) => entry?.auditId !== summary.auditId)]
      .slice(0, readMaxRecentAudits());

    if (typeof storage.compareAndSwap !== 'function') {
      await storage.set(AI_RANKING_AUDIT_INDEX_KEY, nextValue, ttlSeconds);
      return nextValue;
    }

    const swap = await storage.compareAndSwap(AI_RANKING_AUDIT_INDEX_KEY, current, nextValue, ttlSeconds);
    if (swap?.ok) return nextValue;
    current = swap?.current ?? await storage.get(AI_RANKING_AUDIT_INDEX_KEY);
  }

  throw new Error(`AI_RANKING_AUDIT_INDEX_CAS_RETRY_EXHAUSTED:${AI_RANKING_AUDIT_INDEX_KEY}`);
}

async function saveAiRankingAudit(audit, {
  ttlSeconds = readAuditTtlSeconds(),
  chunkSize = readAuditChunkSize(),
} = {}) {
  const meta = sanitizeAuditMeta(audit);
  const entries = sanitizeAuditEntries(audit?.entries || audit?.items || []);
  const chunks = splitIntoChunks(entries, chunkSize);

  await Promise.all(chunks.map((chunkEntries, chunkIndex) => storage.set(
    buildAiRankingAuditChunkKey(meta.auditId, chunkIndex),
    chunkEntries,
    ttlSeconds
  )));

  const metaRecord = {
    ...meta,
    chunkCount: chunks.length,
    chunkSize: Math.max(1, Math.floor(Number(chunkSize) || readAuditChunkSize())),
  };
  await storage.set(buildAiRankingAuditMetaKey(meta.auditId), metaRecord, ttlSeconds);
  await updateAuditIndex(buildAuditSummary(metaRecord), { ttlSeconds });
  return metaRecord;
}

async function listAiRankingAudits({ limit = 20, clientRunId = '' } = {}) {
  const current = await storage.get(AI_RANKING_AUDIT_INDEX_KEY);
  const entries = Array.isArray(current) ? current : [];
  const normalizedRunId = String(clientRunId || '').trim();
  const filtered = normalizedRunId
    ? entries.filter((entry) => String(entry?.clientRunId || '').trim() === normalizedRunId)
    : entries;
  return filtered.slice(0, clampLimit(limit, 20));
}

async function getAiRankingAudit(auditId) {
  const normalizedId = String(auditId || '').trim();
  if (!normalizedId) return null;
  const meta = await storage.get(buildAiRankingAuditMetaKey(normalizedId));
  if (!meta || typeof meta !== 'object') return null;

  const chunkCount = Math.max(0, Number(meta.chunkCount) || 0);
  const chunkResults = await Promise.all(Array.from({ length: chunkCount }, (_value, index) => (
    storage.get(buildAiRankingAuditChunkKey(normalizedId, index))
  )));
  return {
    ...meta,
    entries: chunkResults.flatMap((chunk) => (Array.isArray(chunk) ? chunk : [])),
  };
}

module.exports = {
  AI_RANKING_AUDIT_INDEX_KEY,
  AI_RANKING_AUDIT_PREFIX,
  buildAiRankingAuditMetaKey,
  buildAiRankingAuditChunkKey,
  buildAuditSummary,
  sanitizeAuditMeta,
  sanitizeAuditEntries,
  saveAiRankingAudit,
  listAiRankingAudits,
  getAiRankingAudit,
};
