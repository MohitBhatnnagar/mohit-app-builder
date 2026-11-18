// Mohit platform: scheduled jobs that run inside the app's server. Do not edit.
//   import { every } from "./platform/jobs.ts";
//   every("refresh rollups", 5, () => rollup(...));   // every 5 minutes, first run shortly after start
// Jobs never overlap with themselves, errors are logged (app_logs) instead of crashing the server,
// and slow runs are flagged. Keep each run short: SQLite work blocks other requests while it runs.

interface Job { name: string; minutes: number; running: boolean; lastMs: number | null; lastError: string | null; runs: number }
const jobs = new Map<string, Job>();

export function every(name: string, minutes: number, fn: () => unknown | Promise<unknown>, opts: { runAtStart?: boolean } = {}): void {
  if (jobs.has(name)) throw new Error(`A job called "${name}" is already scheduled.`);
  if (!(minutes > 0)) throw new Error("minutes must be positive.");
  const job: Job = { name, minutes, running: false, lastMs: null, lastError: null, runs: 0 };
  jobs.set(name, job);
  const run = async () => {
    if (job.running) return; // never overlap
    job.running = true;
    const started = Date.now();
    try {
      await fn();
      job.lastError = null;
    } catch (err) {
      job.lastError = (err as Error).message;
      console.error(`[job] "${name}" failed: ${job.lastError}`);
    } finally {
      job.running = false;
      job.runs++;
      job.lastMs = Date.now() - started;
      if (job.lastMs > 1000) console.warn(`[job] "${name}" took ${job.lastMs} ms; it blocks requests while it runs, consider doing less per run`);
      else console.log(`[job] "${name}" ran in ${job.lastMs} ms`);
    }
  };
  if (opts.runAtStart !== false) setTimeout(run, 2_000).unref();
  setInterval(run, minutes * 60_000).unref();
}

/** Status of every scheduled job (for an admin page or debugging). */
export function jobStatus(): Omit<Job, "running">[] {
  return [...jobs.values()].map(({ running: _r, ...j }) => j);
}
