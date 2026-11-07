const crypto = require("crypto");
const whatsapp = require("./whatsapp");

/*
 * Broadcasts: one approved template to many customers. Sent in the background
 * so the browser can show progress; jobs live in memory, so a restart forgets
 * them (and stops one mid-way — the customers already sent to keep theirs).
 */
const CONCURRENCY = 5; // well under Meta's 80 messages/second
const KEEP_FINISHED_MS = 24 * 60 * 60 * 1000;

const jobs = new Map(); // id -> job

// The job as the browser sees it.
function view(job) {
  return {
    id: job.id,
    storeId: job.storeId,
    template: { name: job.template.name, language: job.template.language },
    by: job.by,
    total: job.total,
    sent: job.sent,
    failed: job.failures.length,
    failures: job.failures.slice(0, 200),
    notLogged: job.notLogged,
    status: job.status, // "running" | "done" | "stopped"
    stopReason: job.stopReason,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt
  };
}

function runningFor(storeId) {
  return [...jobs.values()].find((j) => j.storeId === storeId && j.status === "running") || null;
}

function start({ storeId, template, values, recipients, by }) {
  for (const [id, j] of jobs) {
    if (j.finishedAt && Date.now() - Date.parse(j.finishedAt) > KEEP_FINISHED_MS) jobs.delete(id);
  }

  const job = {
    id: crypto.randomUUID(),
    storeId,
    template,
    values,
    recipients,
    by,
    total: recipients.length,
    sent: 0,
    failures: [],
    notLogged: 0,
    status: "running",
    stopReason: null,
    startedAt: new Date().toISOString(),
    finishedAt: null
  };
  jobs.set(job.id, job);

  console.log(`[broadcast] ${job.id} by ${by}: ${template.name} (${template.language}) -> ${job.total} customers of ${storeId}`);
  run(job).catch((err) => {
    job.status = "stopped";
    job.stopReason = err.message;
    console.error(`[broadcast] ${job.id} crashed:`, err);
  }).finally(() => {
    job.finishedAt = new Date().toISOString();
    console.log(`[broadcast] ${job.id} ${job.status}: sent ${job.sent}, failed ${job.failures.length}${job.stopReason ? ` (${job.stopReason})` : ""}`);
  });

  return view(job);
}

async function run(job) {
  let next = 0;

  async function worker() {
    while (job.status === "running" && next < job.recipients.length) {
      const phone = job.recipients[next++];
      try {
        const { logged } = await whatsapp.sendTemplate(job.storeId, phone, job.template, job.values);
        job.sent += 1;
        if (!logged) job.notLogged += 1;
      } catch (err) {
        job.failures.push({ customerId: phone, error: err.message });
        // Every other send would fail the same way.
        if (err.code === whatsapp.BAD_TOKEN || err.status === 503) {
          job.status = "stopped";
          job.stopReason = err.message;
        }
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  if (job.status === "running") job.status = "done";
}

function get(storeId, id) {
  const job = jobs.get(id);
  return job && job.storeId === storeId ? view(job) : null;
}

function stop(storeId, id) {
  const job = jobs.get(id);
  if (!job || job.storeId !== storeId) return null;
  if (job.status === "running") {
    job.status = "stopped";
    job.stopReason = "Stopped by an admin";
  }
  return view(job);
}

module.exports = {
  start,
  get,
  stop,
  runningFor
};
