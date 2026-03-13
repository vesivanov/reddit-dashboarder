// Agent API v1 — Async Analysis Jobs
// POST /api/v1/analyze — Trigger async analysis → returns { jobId }
// GET /api/v1/jobs/:jobId — Check status/result

const { withCORS } = require('../../cors');
const {
  createSuccessResponse,
  createErrorResponse,
  ERROR_CODES,
} = require('../response-helpers');
const { enqueueJob, getJob, saveJob, JOB_TTL_SECONDS } = require('../job-store');
const { parseRequest, getQueryValue } = require('../../request-utils');
const { processNextJob } = require('../../services/analysis-job-queue');
const { verifyAgentApiKey } = require('../auth');
const { getWorkspaceContext, resolveWorkspace } = require('../../services/workspace-service');

function generateJobId() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `job_${timestamp}_${random}`;
}

async function postHandler(req, res, { workspaceId, token }) {
  const startTime = Date.now();
  const authResult = verifyAgentApiKey(req);
  if (!authResult.valid) {
    const error = createErrorResponse(ERROR_CODES.UNAUTHORIZED.code, authResult.error);
    error.timings.totalMs = Date.now() - startTime;
    return withCORS(req, res).status(401).json(error);
  }

  if (!workspaceId && !token) {
    const error = createErrorResponse(ERROR_CODES.VALIDATION_ERROR.code, 'Missing workspace identifier');
    error.timings.totalMs = Date.now() - startTime;
    return withCORS(req, res).status(400).json(error);
  }

  const context = await getWorkspaceContext({ workspaceId, token });
  if (!context.snapshot) {
    const error = createErrorResponse(ERROR_CODES.NOT_FOUND.code, 'No snapshot available');
    error.timings.totalMs = Date.now() - startTime;
    return withCORS(req, res).status(404).json(error);
  }

  const posts = context.snapshot.posts || [];
  if (posts.length === 0) {
    const error = createErrorResponse(ERROR_CODES.VALIDATION_ERROR.code, 'No posts to analyze');
    error.timings.totalMs = Date.now() - startTime;
    return withCORS(req, res).status(400).json(error);
  }

  const jobId = generateJobId();
  const estimatedDuration = Math.ceil(posts.length / 30) * 30;
  const job = {
    id: jobId,
    status: 'queued',
      createdAt: Date.now(),
    token: token || context.token || context.workspace?.sourceSyncToken || '',
    scopeId: context.workspaceId,
    workspaceId: context.workspaceId,
    snapshotId: context.snapshot.snapshotId,
    configVersion: context.config?.version ?? 0,
    estimatedDurationSeconds: estimatedDuration,
  };

  await saveJob(jobId, job, JOB_TTL_SECONDS);
  await enqueueJob(jobId);

  const response = createSuccessResponse({
    job: {
      id: jobId,
      status: 'queued',
      workspaceId: context.workspaceId,
      createdAt: new Date(job.createdAt).toISOString(),
      estimatedDurationSeconds: estimatedDuration,
      snapshotId: job.snapshotId,
      configVersion: job.configVersion,
    },
  }, { totalMs: Date.now() - startTime });

  return withCORS(req, res).status(202).json(response);
}

async function getHandler(req, res, jobId, workspaceId = '') {
  const startTime = Date.now();
  const authResult = verifyAgentApiKey(req);
  if (!authResult.valid) {
    const error = createErrorResponse(ERROR_CODES.UNAUTHORIZED.code, authResult.error);
    error.timings.totalMs = Date.now() - startTime;
    return withCORS(req, res).status(401).json(error);
  }

  let job = await getJob(jobId);
  if (!job) {
    const error = createErrorResponse(ERROR_CODES.NOT_FOUND.code, 'Job not found');
    error.timings.totalMs = Date.now() - startTime;
    return withCORS(req, res).status(404).json(error);
  }
  if (workspaceId && job.scopeId !== workspaceId && job.workspaceId !== workspaceId) {
    const error = createErrorResponse(ERROR_CODES.NOT_FOUND.code, 'Job not found');
    error.timings.totalMs = Date.now() - startTime;
    return withCORS(req, res).status(404).json(error);
  }

  const jobResponse = {
    id: job.id,
    status: job.status,
    workspaceId: job.workspaceId || job.scopeId || null,
    createdAt: new Date(job.createdAt).toISOString(),
    snapshotId: job.snapshotId || null,
    configVersion: job.configVersion ?? null,
  };

  if (job.status === 'running') {
    jobResponse.progress = job.progress;
    jobResponse.startedAt = new Date(job.startedAt).toISOString();
  }

  if (job.status === 'completed') {
    jobResponse.result = job.result;
    jobResponse.startedAt = new Date(job.startedAt).toISOString();
    jobResponse.completedAt = new Date(job.completedAt).toISOString();
  }

  if (job.status === 'failed') {
    jobResponse.error = job.error;
    jobResponse.startedAt = job.startedAt ? new Date(job.startedAt).toISOString() : null;
    jobResponse.completedAt = new Date(job.completedAt).toISOString();
  }

  const response = createSuccessResponse({ job: jobResponse }, { totalMs: Date.now() - startTime });
  return withCORS(req, res).status(200).json(response);
}

async function drainHandler(req, res) {
  const startTime = Date.now();
  const authResult = verifyAgentApiKey(req);
  if (!authResult.valid) {
    const error = createErrorResponse(ERROR_CODES.UNAUTHORIZED.code, authResult.error);
    error.timings.totalMs = Date.now() - startTime;
    return withCORS(req, res).status(401).json(error);
  }

  const processed = await processNextJob();
  const response = createSuccessResponse({
    processed,
  }, { totalMs: Date.now() - startTime });
  return withCORS(req, res).status(200).json(response);
}

async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return withCORS(req, res, 'GET, POST, OPTIONS').status(204).end();
  }

  const { url, query } = parseRequest(req);
  const pathname = url.pathname;
  const routeWorkspaceId = req.params?.workspaceId || getQueryValue(query, 'workspace_id', '').trim();
  const token = getQueryValue(query, 'token', process.env.DIGEST_SYNC_TOKEN || '').trim();
  const resolved = await resolveWorkspace({ workspaceId: routeWorkspaceId, token });
  const target = {
    workspaceId: resolved?.workspaceId || routeWorkspaceId || null,
    token: resolved?.token || token,
  };

  if (req.method === 'POST' && (pathname === '/api/v1/analyze' || pathname === `/api/workspaces/${target.workspaceId}/analyze`)) {
    return postHandler(req, res, target);
  }

  if (req.method === 'POST' && pathname === '/api/v1/jobs/drain') {
    return drainHandler(req, res);
  }

  if (req.method === 'GET') {
    const match = pathname.match(/^\/api\/v1\/jobs\/(\w+)$/) || pathname.match(/^\/api\/workspaces\/([^/]+)\/jobs\/(\w+)$/);
    if (match) {
      const jobId = match[2] || match[1];
      const workspaceId = match[2] ? match[1] : target.workspaceId;
      return getHandler(req, res, jobId, workspaceId || '');
    }
  }

  const error = createErrorResponse(ERROR_CODES.VALIDATION_ERROR.code, 'Method not allowed');
  return withCORS(req, res).status(405).json(error);
}

module.exports = handler;
