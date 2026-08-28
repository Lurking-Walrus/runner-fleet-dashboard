export interface Secrets {
  // Fine-grained PAT: org self-hosted runners (read), repo actions (read), metadata (read).
  GH_PAT: string;
  // Gates the dashboard UI and API (HTTP Basic Auth).
  DASHBOARD_USER: string;
  DASHBOARD_PASSWORD: string;
  // Bearer token the host telemetry agents authenticate with.
  TELEMETRY_TOKEN: string;
}

export type Env = Cloudflare.Env & Secrets;

export interface GhRunner {
  id: number;
  name: string;
  os: string;
  status: string;
  busy: boolean;
  version: string;
  labels: { name: string; type: string }[];
}

export interface GhJob {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  started_at: string;
  runner_name: string | null;
}

export interface GhRun {
  id: number;
  name: string;
  html_url: string;
  status: string;
  pull_requests: { number: number; url: string }[];
}

export interface ResolvedJob {
  runnerName: string;
  repo: string;
  runId: number;
  runUrl: string;
  jobId: number;
  jobName: string;
  workflowName: string;
  jobStartedAt: string;
  prNumber: number | null;
  prUrl: string | null;
}

export interface PollScope {
  kind: "org" | "repo";
  owner: string;
  repo?: string;
}
