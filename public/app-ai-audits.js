(function initDashboardAiAuditModule(globalScope) {
  const DB_NAME = 'reddit-dashboarder-ai-audits';
  const STORE_NAME = 'runs';
  const DB_VERSION = 1;
  const FALLBACK_KEY = 'dashboard_ai_audit_runs';
  const MAX_RUNS = 8;

  function canUseIndexedDb() {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  }

  function openAuditDb() {
    if (!canUseIndexedDb()) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'runId' });
          store.createIndex('createdAt', 'createdAt');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function withStore(mode, executor) {
    return openAuditDb().then((db) => {
      if (!db) return executor(null);
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        Promise.resolve(executor(store)).then(resolve).catch(reject);
        tx.onerror = () => reject(tx.error);
        tx.oncomplete = () => {
          try { db.close(); } catch {}
        };
      });
    });
  }

  function readFallbackRuns() {
    try {
      const raw = localStorage.getItem(FALLBACK_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writeFallbackRuns(runs) {
    try {
      localStorage.setItem(FALLBACK_KEY, JSON.stringify(runs.slice(0, MAX_RUNS)));
    } catch {}
  }

  function sanitizeRun(run = {}) {
    return {
      runId: String(run.runId || '').trim(),
      createdAt: Number(run.createdAt) || Date.now(),
      status: String(run.status || 'success'),
      requestedModel: String(run.requestedModel || '').trim() || 'unknown',
      resolvedModels: Array.isArray(run.resolvedModels)
        ? Array.from(new Set(run.resolvedModels.map((value) => String(value || '').trim()).filter(Boolean))).slice(0, 10)
        : [],
      totalFeedPosts: Math.max(0, Number(run.totalFeedPosts) || 0),
      chunkCount: Math.max(0, Number(run.chunkCount) || 0),
      llmPostLimit: Math.max(0, Number(run.llmPostLimit) || 0),
      promptVersion: String(run.promptVersion || '').trim() || null,
      scoringMode: String(run.scoringMode || '').trim() || 'hybrid',
      goalText: String(run.goalText || ''),
      contextText: String(run.contextText || ''),
      avoidText: String(run.avoidText || ''),
      examples: run.examples && typeof run.examples === 'object' ? run.examples : {},
      posts: Array.isArray(run.posts) ? run.posts : [],
      chunks: Array.isArray(run.chunks) ? run.chunks : [],
      items: Array.isArray(run.items) ? run.items : [],
      events: Array.isArray(run.events) ? run.events : [],
      summary: run.summary && typeof run.summary === 'object' ? run.summary : {},
      error: run.error ? String(run.error) : null,
    };
  }

  function createAiAuditRunId() {
    return `airun_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  async function pruneIndexedDbRuns(store) {
    if (!store || typeof store.getAll !== 'function') return;
    const allRuns = await new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
      request.onerror = () => reject(request.error);
    });
    const toDelete = allRuns
      .sort((left, right) => (Number(right.createdAt) || 0) - (Number(left.createdAt) || 0))
      .slice(MAX_RUNS);
    await Promise.all(toDelete.map((entry) => new Promise((resolve, reject) => {
      const request = store.delete(entry.runId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    })));
  }

  async function saveAiAuditRun(run) {
    const sanitized = sanitizeRun(run);
    if (!sanitized.runId) return null;

    if (!canUseIndexedDb()) {
      const current = readFallbackRuns().filter((entry) => entry?.runId !== sanitized.runId);
      writeFallbackRuns([sanitized, ...current]);
      return sanitized;
    }

    await withStore('readwrite', async (store) => {
      if (!store) return;
      await new Promise((resolve, reject) => {
        const request = store.put(sanitized);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
      await pruneIndexedDbRuns(store);
    });

    return sanitized;
  }

  async function listAiAuditRuns({ limit = 10 } = {}) {
    const normalizedLimit = Math.max(1, Math.floor(Number(limit) || 10));
    if (!canUseIndexedDb()) {
      return readFallbackRuns()
        .sort((left, right) => (Number(right.createdAt) || 0) - (Number(left.createdAt) || 0))
        .slice(0, normalizedLimit)
        .map((entry) => ({
          runId: entry.runId,
          createdAt: entry.createdAt,
          status: entry.status,
          requestedModel: entry.requestedModel,
          resolvedModels: entry.resolvedModels,
          totalFeedPosts: entry.totalFeedPosts,
          chunkCount: entry.chunkCount,
          llmPostLimit: entry.llmPostLimit,
          summary: entry.summary || {},
          error: entry.error || null,
        }));
    }

    return withStore('readonly', async (store) => {
      if (!store) return [];
      const allRuns = await new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
        request.onerror = () => reject(request.error);
      });
      return allRuns
        .sort((left, right) => (Number(right.createdAt) || 0) - (Number(left.createdAt) || 0))
        .slice(0, normalizedLimit)
        .map((entry) => ({
          runId: entry.runId,
          createdAt: entry.createdAt,
          status: entry.status,
          requestedModel: entry.requestedModel,
          resolvedModels: entry.resolvedModels,
          totalFeedPosts: entry.totalFeedPosts,
          chunkCount: entry.chunkCount,
          llmPostLimit: entry.llmPostLimit,
          summary: entry.summary || {},
          error: entry.error || null,
        }));
    });
  }

  async function getAiAuditRun(runId) {
    const normalizedId = String(runId || '').trim();
    if (!normalizedId) return null;

    if (!canUseIndexedDb()) {
      return readFallbackRuns().find((entry) => entry?.runId === normalizedId) || null;
    }

    return withStore('readonly', async (store) => {
      if (!store) return null;
      return new Promise((resolve, reject) => {
        const request = store.get(normalizedId);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    });
  }

  async function exportAiAuditRun(runId) {
    const run = await getAiAuditRun(runId);
    if (!run || typeof document === 'undefined') return false;
    const blob = new Blob([JSON.stringify(run, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${run.runId}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    return true;
  }

  globalScope.RDDAiAuditClient = {
    createAiAuditRunId,
    saveAiAuditRun,
    listAiAuditRuns,
    getAiAuditRun,
    exportAiAuditRun,
  };
})(typeof window !== 'undefined' ? window : globalThis);
