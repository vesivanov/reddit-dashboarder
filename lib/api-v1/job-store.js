const storage = require('../storage');

const JOB_KEY_PREFIX = 'api-v1-job:';
const JOB_TTL_SECONDS = 60 * 60;
const JOB_LEASE_MS = 60 * 1000;
const JOB_QUEUE_KEY = 'api-v1-job-queue';
const JOB_INDEX_KEY = 'api-v1-job-index';

function buildJobKey(jobId) {
  return `${JOB_KEY_PREFIX}${jobId}`;
}

async function getJob(jobId) {
  if (!jobId) return null;
  return storage.get(buildJobKey(jobId));
}

async function saveJob(jobId, job, ttlSeconds = JOB_TTL_SECONDS) {
  if (!jobId || !job) return;
  const nextJob = {
    ...job,
    updatedAt: Date.now(),
  };
  await storage.set(buildJobKey(jobId), nextJob, ttlSeconds);
  await addJobToIndex(jobId);
}

function isTerminalJobStatus(status) {
  return status === 'completed' || status === 'failed';
}

function isJobLeaseExpired(job, now = Date.now()) {
  if (!job || isTerminalJobStatus(job.status)) return false;
  if (!job.leaseExpiresAt) return true;
  return job.leaseExpiresAt <= now;
}

async function getJobQueue() {
  const queue = await storage.get(JOB_QUEUE_KEY);
  return Array.isArray(queue) ? queue : [];
}

async function setJobQueue(jobIds) {
  const uniqueJobIds = Array.from(new Set((jobIds || []).filter(Boolean)));
  await storage.set(JOB_QUEUE_KEY, uniqueJobIds, JOB_TTL_SECONDS);
}

async function enqueueJob(jobId) {
  if (!jobId) return;
  const queue = await getJobQueue();
  if (!queue.includes(jobId)) {
    queue.push(jobId);
    await setJobQueue(queue);
  }
  await addJobToIndex(jobId);
}

async function removeQueuedJob(jobId) {
  if (!jobId) return;
  const queue = await getJobQueue();
  await setJobQueue(queue.filter((queuedJobId) => queuedJobId !== jobId));
}

async function getJobIndex() {
  const jobIds = await storage.get(JOB_INDEX_KEY);
  return Array.isArray(jobIds) ? jobIds : [];
}

async function addJobToIndex(jobId) {
  if (!jobId) return;
  const jobIds = await getJobIndex();
  if (!jobIds.includes(jobId)) {
    jobIds.push(jobId);
    await storage.set(JOB_INDEX_KEY, jobIds, JOB_TTL_SECONDS);
  }
}

async function listJobs() {
  const jobIds = await getJobIndex();
  const jobs = await Promise.all(jobIds.map((jobId) => getJob(jobId)));
  return jobs.filter(Boolean);
}

module.exports = {
  JOB_TTL_SECONDS,
  JOB_LEASE_MS,
  enqueueJob,
  getJob,
  getJobQueue,
  isJobLeaseExpired,
  isTerminalJobStatus,
  listJobs,
  removeQueuedJob,
  saveJob,
};
