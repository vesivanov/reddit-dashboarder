const { callOpenRouter, buildBatches } = require('./ai-ranking');
const { getJob, saveJob, JOB_LEASE_MS, isTerminalJobStatus } = require('../api-v1/job-store');
const { getAgentSnapshot } = require('../repos/agent-snapshots');
const { getAgentConfig } = require('../repos/agent-configs');
const { saveAgentAnalysis } = require('../repos/agent-analyses');
const storage = require('../storage');
const { refreshSyncRecord } = require('./sync-records');
const { buildAiOpportunities, getOrMaterializeAgentContext } = require('./agent-collab');

const localActiveJobs = new Set();

function estimateCost(postCount, model) {
  const inputTokens = postCount * 200;
  const outputTokens = postCount * 50;

  const pricing = {
    'google/gemini-2.5-flash': { input: 0.15, output: 0.60 },
    'google/gemini-2.0-flash': { input: 0.10, output: 0.40 },
    'anthropic/claude-3.5-sonnet': { input: 3.00, output: 15.00 },
    'openai/gpt-4o-mini': { input: 0.15, output: 0.60 },
    'openai/gpt-4o': { input: 2.50, output: 10.00 },
  };

  const modelPricing = pricing[model] || pricing['google/gemini-2.5-flash'];
  const inputCost = (inputTokens / 1_000_000) * modelPricing.input;
  const outputCost = (outputTokens / 1_000_000) * modelPricing.output;

  return {
    cents: Math.round((inputCost + outputCost) * 100),
    currency: 'USD',
    breakdown: {
      inputTokens,
      outputTokens,
      inputCost: Math.round(inputCost * 10000) / 10000,
      outputCost: Math.round(outputCost * 10000) / 10000,
    },
  };
}

function buildLease(ownerId, now = Date.now()) {
  return {
    leaseOwnerId: ownerId,
    leaseExpiresAt: now + JOB_LEASE_MS,
  };
}

function isOwnedBy(job, ownerId) {
  return !!job && job.leaseOwnerId === ownerId;
}

async function updateRunningJob(jobId, mutate, ttlSeconds) {
  const currentJob = await getJob(jobId);
  if (!currentJob) return null;
  const nextJob = { ...currentJob };
  mutate(nextJob);
  await saveJob(jobId, nextJob, ttlSeconds);
  return nextJob;
}

async function resolveJobSnapshot(job) {
  if (job?.snapshot?.snapshotId) {
    return job.snapshot;
  }
  if (job?.snapshotId) {
    return getAgentSnapshot(job.snapshotId);
  }
  return null;
}

async function persistAnalysisPosts(job, snapshot, postsWithAnalysis) {
  const token = String(job?.token || snapshot?.sourceSyncToken || '').trim();
  if (!token) {
    return;
  }

  const currentSyncRecord = await storage.get(token);
  if (!currentSyncRecord || currentSyncRecord.syncedAt !== snapshot.sourceSyncedAt) {
    return;
  }

  await refreshSyncRecord(token, {
    ...currentSyncRecord,
    posts: postsWithAnalysis,
  });
}

function buildCompletedAnalysis(snapshot, posts, config, {
  jobId,
  model,
  costEstimate,
  failedPostIds,
  completedAt,
}) {
  const threshold = config?.threshold ?? 4;
  const opportunities = buildAiOpportunities(posts, threshold);

  return {
    snapshotId: snapshot.snapshotId,
    scopeId: snapshot.scopeId,
    status: 'completed',
    source: 'ai_job',
    jobId,
    configVersion: config?.version ?? 0,
    threshold,
    opportunities,
    opportunityCount: opportunities.length,
    totalPosts: posts?.length || 0,
    completedAt,
    modelUsed: model,
    costEstimate,
    failedCount: failedPostIds.length,
    ...(failedPostIds.length > 0 && { failedPostIds }),
  };
}

async function runAnalysisJob(jobId) {
  const ownerId = `runner_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  if (localActiveJobs.has(jobId)) {
    return getJob(jobId);
  }

  localActiveJobs.add(jobId);
  try {
    let job = await getJob(jobId);
    if (!job || isTerminalJobStatus(job.status)) return job;

    const claimTime = Date.now();
    job.status = 'running';
    job.startedAt = job.startedAt || claimTime;
    Object.assign(job, buildLease(ownerId, claimTime));
    await saveJob(jobId, job);

    const claimedJob = await getJob(jobId);
    if (!claimedJob || !isOwnedBy(claimedJob, ownerId)) {
      return claimedJob;
    }
    job = claimedJob;

    const snapshot = await resolveJobSnapshot(job);
    if (!snapshot) {
      throw new Error('Snapshot not found');
    }

    let config = job.config || null;
    if (!config) {
      config = await getAgentConfig(job.scopeId);
    }
    if (!config && snapshot.sourceSyncToken) {
      const context = await getOrMaterializeAgentContext(snapshot.sourceSyncToken, { deriveConfigFromSync: true });
      config = context.config;
    }
    if (!config) {
      throw new Error('Configuration not found');
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    const model = config.model || 'google/gemini-2.5-flash';
    if (!apiKey) {
      throw new Error('No OpenRouter API key available');
    }

    const posts = snapshot.posts || [];
    const userGoals = config.goals || '';
    const userContext = config.aiContext || '';
    const scoringConfig = config.scoringConfig || null;

    const batches = buildBatches(posts);
    const totalPosts = posts.length;
    let postsScored = 0;
    const allScores = {};
    const allMetadata = {};
    const failedPostIds = [];

    for (let i = 0; i < batches.length; i += 1) {
      const batch = batches[i];

      try {
        const result = await callOpenRouter({
          userGoals,
          userContext,
          scoringConfig,
          postsBatch: batch,
          apiKey,
          model,
        });

        for (const [postId, score] of result.scores.entries()) {
          allScores[postId] = score;
          if (score === null) {
            failedPostIds.push(postId);
          }
        }

        for (const [postId, metadata] of result.metadata.entries()) {
          allMetadata[postId] = metadata;
        }

        postsScored += batch.length;
        job.progress = {
          postsScored,
          totalPosts,
          currentBatch: i + 1,
          totalBatches: batches.length,
        };
        Object.assign(job, buildLease(ownerId, Date.now()));
        await saveJob(jobId, job);
      } catch (batchError) {
        console.error(`[job ${jobId}] Batch ${i + 1} failed:`, batchError.message);
        batch.forEach((post) => {
          const postId = String(post.id);
          if (!(postId in allScores)) {
            failedPostIds.push(postId);
          }
        });
      }
    }

    const completedAtMs = Date.now();
    const completedAtIso = new Date(completedAtMs).toISOString();
    const postsWithAnalysis = posts.map((post) => {
      const postId = String(post.id);
      const nextPost = { ...post };

      if (Object.prototype.hasOwnProperty.call(allScores, postId)) {
        nextPost.aiScoreProxy = allScores[postId];
        nextPost.aiRankingFailed = allScores[postId] === null;
        nextPost.aiRankedAt = completedAtIso;
      }

      if (allMetadata[postId]) {
        nextPost.aiMetadata = allMetadata[postId];
      }

      return nextPost;
    });

    const costEstimate = estimateCost(postsScored, model);
    const completedAnalysis = buildCompletedAnalysis(snapshot, postsWithAnalysis, config, {
      jobId,
      model,
      costEstimate,
      failedPostIds,
      completedAt: completedAtIso,
    });

    await persistAnalysisPosts(job, snapshot, postsWithAnalysis);
    await saveAgentAnalysis(snapshot.snapshotId, completedAnalysis, { expiresAt: snapshot.expiresAt });

    job.status = 'completed';
    job.completedAt = completedAtMs;
    delete job.leaseOwnerId;
    delete job.leaseExpiresAt;
    job.result = {
      postsScored,
      opportunityCount: completedAnalysis.opportunityCount,
      modelUsed: model,
      costEstimate,
      failedCount: failedPostIds.length,
      ...(failedPostIds.length > 0 && { failedPostIds }),
    };
    await saveJob(jobId, job);
    return job;
  } catch (error) {
    console.error(`[job ${jobId}] Analysis failed:`, error);
    await updateRunningJob(jobId, (job) => {
      job.status = 'failed';
      job.completedAt = Date.now();
      delete job.leaseOwnerId;
      delete job.leaseExpiresAt;
      job.error = {
        message: error.message,
        code: 'ANALYSIS_ERROR',
      };
    });
    return getJob(jobId);
  } finally {
    localActiveJobs.delete(jobId);
  }
}

module.exports = {
  estimateCost,
  buildLease,
  runAnalysisJob,
};
