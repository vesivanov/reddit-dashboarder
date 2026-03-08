const {
  JOB_LEASE_MS,
  enqueueJob,
  getJob,
  getJobQueue,
  isJobLeaseExpired,
  isTerminalJobStatus,
  listJobs,
  removeQueuedJob,
  saveJob,
} = require('../api-v1/job-store');
const { getAgentSnapshot } = require('../repos/agent-snapshots');
const { runAnalysisJob } = require('./analysis-jobs');

async function requeueRecoverableJobs(now = Date.now()) {
  const jobs = await listJobs();
  for (const job of jobs) {
    if (!job || !job.id || isTerminalJobStatus(job.status)) continue;
    if (job.status === 'queued' || isJobLeaseExpired(job, now)) {
      const recoveredJob = {
        ...job,
        status: 'queued',
        recoveredAt: job.status === 'running' ? now : job.recoveredAt,
        leaseExpiresAt: null,
      };
      delete recoveredJob.progress;
      delete recoveredJob.startedAt;
      await saveJob(job.id, recoveredJob);
      await enqueueJob(job.id);
    }
  }
}

async function processNextJob(now = Date.now()) {
  await requeueRecoverableJobs(now);
  const queue = await getJobQueue();
  const nextJobId = queue[0];
  if (!nextJobId) return false;

  await removeQueuedJob(nextJobId);
  const job = await getJob(nextJobId);
  if (!job || isTerminalJobStatus(job.status)) {
    return false;
  }

  const snapshot = await getAgentSnapshot(job.snapshotId);
  if (!snapshot) {
    const failedJob = {
      ...job,
      status: 'failed',
      completedAt: now,
      leaseExpiresAt: null,
      error: { code: 'SNAPSHOT_NOT_FOUND', message: 'No snapshot available' },
    };
    await saveJob(nextJobId, failedJob);
    return false;
  }

  const runningJob = {
    ...job,
    status: 'running',
    startedAt: job.startedAt || now,
    leaseExpiresAt: now + JOB_LEASE_MS,
  };
  await saveJob(nextJobId, runningJob);
  await runAnalysisJob(nextJobId);
  return true;
}

function kickJobQueueWorker() {
  return processNextJob();
}

function ensureJobQueueWorker() {
  return true;
}

function resetJobQueueWorkerForTests() {
  return true;
}

module.exports = {
  ensureJobQueueWorker,
  kickJobQueueWorker,
  processNextJob,
  requeueRecoverableJobs,
  resetJobQueueWorkerForTests,
};
