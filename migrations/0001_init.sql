-- Latest known state of every self-hosted runner seen across configured scopes.
CREATE TABLE runners (
  name TEXT PRIMARY KEY,
  scope TEXT NOT NULL,          -- e.g. "org:Lurking-Walrus" or "repo:kornsour/gh-automation"
  os TEXT NOT NULL,
  status TEXT NOT NULL,         -- online | offline
  busy INTEGER NOT NULL,        -- 0 | 1
  version TEXT NOT NULL,
  labels_json TEXT NOT NULL,
  pool TEXT NOT NULL,           -- derived grouping label, e.g. "ci-host-a", "ci-host-b"
  first_seen TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- The job currently occupying a busy runner (deleted once the job leaves in_progress).
CREATE TABLE current_jobs (
  runner_name TEXT PRIMARY KEY REFERENCES runners(name),
  repo TEXT NOT NULL,
  run_id INTEGER NOT NULL,
  run_url TEXT NOT NULL,
  job_id INTEGER NOT NULL,
  job_name TEXT NOT NULL,
  workflow_name TEXT NOT NULL,
  job_started_at TEXT NOT NULL,
  pr_number INTEGER,
  pr_url TEXT,
  updated_at TEXT NOT NULL
);

-- Append-only feed: state transitions, job outcomes, detected problems.
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  severity TEXT NOT NULL,      -- info | warning | error
  kind TEXT NOT NULL,          -- runner_offline | runner_online | job_failed | job_succeeded | stale_telemetry | resource_pressure | outdated_version | long_running_job
  runner_name TEXT,
  repo TEXT,
  message TEXT NOT NULL
);
CREATE INDEX idx_events_ts ON events(ts DESC);

-- Latest telemetry snapshot pushed by the agent running on each physical host.
CREATE TABLE telemetry (
  host TEXT PRIMARY KEY,        -- must match a runner's "pool" label
  location TEXT,
  cpu_pct REAL,
  cpu_count INTEGER,
  load_avg_1m REAL,
  mem_used_mb INTEGER,
  mem_total_mb INTEGER,
  disk_used_gb REAL,
  disk_total_gb REAL,
  uptime_s INTEGER,
  agent_version TEXT,
  updated_at TEXT NOT NULL
);

-- One row, tracks when the poller last ran and whether it succeeded.
CREATE TABLE poll_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_run_at TEXT,
  last_ok INTEGER,
  last_error TEXT
);
INSERT INTO poll_state (id, last_run_at, last_ok, last_error) VALUES (1, NULL, 1, NULL);
