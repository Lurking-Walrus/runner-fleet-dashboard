import type { Env } from "./types";

export async function buildState(env: Env) {
  const [runners, jobs, telemetry, events, pollState] = await Promise.all([
    env.DB.prepare(`SELECT * FROM runners ORDER BY pool, name`).all(),
    env.DB.prepare(`SELECT * FROM current_jobs`).all(),
    env.DB.prepare(`SELECT * FROM telemetry`).all(),
    env.DB.prepare(`SELECT * FROM events ORDER BY ts DESC LIMIT 100`).all(),
    env.DB.prepare(`SELECT last_run_at, last_ok, last_error FROM poll_state WHERE id = 1`).first(),
  ]);

  const jobByRunner = new Map((jobs.results as Record<string, unknown>[]).map((j) => [j.runner_name as string, j]));
  const telemetryByHost = new Map(
    (telemetry.results as Record<string, unknown>[]).map((t) => [t.host as string, t]),
  );

  const enrichedRunners = (runners.results as Record<string, unknown>[]).map((r) => ({
    ...r,
    labels: JSON.parse(r.labels_json as string),
    current_job: jobByRunner.get(r.name as string) ?? null,
    telemetry: telemetryByHost.get(r.pool as string) ?? null,
  }));

  return {
    runners: enrichedRunners,
    events: events.results,
    poll: pollState,
    generated_at: new Date().toISOString(),
  };
}
