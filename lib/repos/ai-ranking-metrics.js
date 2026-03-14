const crypto = require('crypto');
const storage = require('../storage');

const AI_RANKING_METRICS_KEY = 'ai-ranking-metrics:global';
const DEFAULT_AI_RANKING_METRICS_TTL_SECONDS = 14 * 24 * 60 * 60;
const DEFAULT_AI_RANKING_METRICS_MAX_RECENT = 200;
const DEFAULT_UPDATE_RETRIES = 8;

function readMetricsTtlSeconds() {
  const raw = Number(process.env.AI_RANKING_METRICS_TTL_SECONDS);
  if (Number.isFinite(raw) && raw > 0) {
    return Math.max(60, Math.floor(raw));
  }
  return DEFAULT_AI_RANKING_METRICS_TTL_SECONDS;
}

function readMaxRecentEntries() {
  const raw = Number(process.env.AI_RANKING_METRICS_MAX_RECENT);
  if (Number.isFinite(raw) && raw > 0) {
    return Math.max(1, Math.floor(raw));
  }
  return DEFAULT_AI_RANKING_METRICS_MAX_RECENT;
}

function createEmptyMetricsStore(now = Date.now()) {
  return {
    version: 1,
    updatedAt: now,
    summary: {
      totalRequests: 0,
      successCount: 0,
      partialCount: 0,
      errorCount: 0,
      totalDurationMs: 0,
      totalPosts: 0,
      totalProcessedPosts: 0,
      totalFailedPosts: 0,
      totalBatches: 0,
      successfulBatches: 0,
      failedBatches: 0,
      byRequestedModel: {},
    },
    recent: [],
  };
}

function sanitizeMetric(metric = {}, now = Date.now()) {
  const requestedModel = String(metric.requestedModel || '').trim() || 'unknown';
  const status = ['success', 'partial', 'error'].includes(metric.status) ? metric.status : 'success';
  const modelsUsed = Array.isArray(metric.modelsUsed)
    ? Array.from(new Set(metric.modelsUsed.map((value) => String(value || '').trim()).filter(Boolean))).slice(0, 5)
    : [];
  const batchSizes = Array.isArray(metric.batchSizes)
    ? metric.batchSizes.map((value) => Math.max(0, Number(value) || 0)).filter(Boolean).slice(0, 20)
    : [];
  const batchDurationsMs = Array.isArray(metric.batchDurationsMs)
    ? metric.batchDurationsMs.map((value) => Math.max(0, Number(value) || 0)).slice(0, 20)
    : [];

  return {
    id: String(metric.id || `airank_${crypto.randomUUID()}`),
    recordedAt: Number(metric.recordedAt) || now,
    status,
    requestedModel,
    resolvedModel: String(metric.resolvedModel || '').trim() || requestedModel,
    modelsUsed,
    fallbackUsed: Boolean(metric.fallbackUsed),
    freeModelRequested: Boolean(metric.freeModelRequested),
    postCount: Math.max(0, Number(metric.postCount) || 0),
    processedCount: Math.max(0, Number(metric.processedCount) || 0),
    failedCount: Math.max(0, Number(metric.failedCount) || 0),
    batchCount: Math.max(0, Number(metric.batchCount) || 0),
    successfulBatchCount: Math.max(0, Number(metric.successfulBatchCount) || 0),
    failedBatchCount: Math.max(0, Number(metric.failedBatchCount) || 0),
    durationMs: Math.max(0, Number(metric.durationMs) || 0),
    concurrency: Math.max(1, Number(metric.concurrency) || 1),
    bodySizeBytes: Math.max(0, Number(metric.bodySizeBytes) || 0),
    batchSizes,
    batchDurationsMs,
    promptVersion: String(metric.promptVersion || '').trim() || null,
    errorCode: String(metric.errorCode || '').trim() || null,
    errorMessage: String(metric.errorMessage || '').trim().slice(0, 240) || null,
  };
}

function mergeModelSummary(existing = {}, metric) {
  return {
    requests: Number(existing.requests || 0) + 1,
    successCount: Number(existing.successCount || 0) + (metric.status === 'success' ? 1 : 0),
    partialCount: Number(existing.partialCount || 0) + (metric.status === 'partial' ? 1 : 0),
    errorCount: Number(existing.errorCount || 0) + (metric.status === 'error' ? 1 : 0),
    totalDurationMs: Number(existing.totalDurationMs || 0) + metric.durationMs,
    totalPosts: Number(existing.totalPosts || 0) + metric.postCount,
    totalProcessedPosts: Number(existing.totalProcessedPosts || 0) + metric.processedCount,
    totalFailedPosts: Number(existing.totalFailedPosts || 0) + metric.failedCount,
    totalBatches: Number(existing.totalBatches || 0) + metric.batchCount,
    fallbackCount: Number(existing.fallbackCount || 0) + (metric.fallbackUsed ? 1 : 0),
  };
}

function applyMetric(store, metric) {
  const next = store || createEmptyMetricsStore(metric.recordedAt);
  const summary = next.summary || createEmptyMetricsStore(metric.recordedAt).summary;
  return {
    version: 1,
    updatedAt: metric.recordedAt,
    summary: {
      totalRequests: Number(summary.totalRequests || 0) + 1,
      successCount: Number(summary.successCount || 0) + (metric.status === 'success' ? 1 : 0),
      partialCount: Number(summary.partialCount || 0) + (metric.status === 'partial' ? 1 : 0),
      errorCount: Number(summary.errorCount || 0) + (metric.status === 'error' ? 1 : 0),
      totalDurationMs: Number(summary.totalDurationMs || 0) + metric.durationMs,
      totalPosts: Number(summary.totalPosts || 0) + metric.postCount,
      totalProcessedPosts: Number(summary.totalProcessedPosts || 0) + metric.processedCount,
      totalFailedPosts: Number(summary.totalFailedPosts || 0) + metric.failedCount,
      totalBatches: Number(summary.totalBatches || 0) + metric.batchCount,
      successfulBatches: Number(summary.successfulBatches || 0) + metric.successfulBatchCount,
      failedBatches: Number(summary.failedBatches || 0) + metric.failedBatchCount,
      byRequestedModel: {
        ...(summary.byRequestedModel || {}),
        [metric.requestedModel]: mergeModelSummary(summary.byRequestedModel?.[metric.requestedModel], metric),
      },
    },
    recent: [metric, ...((next.recent || []).filter((entry) => entry?.id !== metric.id))].slice(0, readMaxRecentEntries()),
  };
}

async function recordAiRankingMetric(metric, {
  ttlSeconds = readMetricsTtlSeconds(),
  maxRetries = DEFAULT_UPDATE_RETRIES,
} = {}) {
  const sanitized = sanitizeMetric(metric);
  let current = await storage.get(AI_RANKING_METRICS_KEY);

  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    const nextValue = applyMetric(current, sanitized);
    if (typeof storage.compareAndSwap !== 'function') {
      await storage.set(AI_RANKING_METRICS_KEY, nextValue, ttlSeconds);
      return nextValue;
    }

    const swap = await storage.compareAndSwap(AI_RANKING_METRICS_KEY, current, nextValue, ttlSeconds);
    if (swap?.ok) {
      return nextValue;
    }
    current = swap?.current ?? await storage.get(AI_RANKING_METRICS_KEY);
  }

  throw new Error(`AI_RANKING_METRICS_CAS_RETRY_EXHAUSTED:${AI_RANKING_METRICS_KEY}`);
}

async function getAiRankingMetrics() {
  return storage.get(AI_RANKING_METRICS_KEY);
}

module.exports = {
  AI_RANKING_METRICS_KEY,
  createEmptyMetricsStore,
  sanitizeMetric,
  applyMetric,
  recordAiRankingMetric,
  getAiRankingMetrics,
};
