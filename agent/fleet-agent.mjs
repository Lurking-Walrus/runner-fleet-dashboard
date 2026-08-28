#!/usr/bin/env node
// Zero-dependency telemetry agent for one physical runner host.
// Reports CPU/RAM/disk/uptime to the runner-fleet-dashboard Worker.
//
// Config via env vars (see .env.example):
//   DASHBOARD_URL       e.g. https://runner-fleet-dashboard.<account>.workers.dev
//   TELEMETRY_TOKEN      bearer token, matches the Worker's TELEMETRY_TOKEN secret
//   HOST_ID               must equal the runner name with any trailing "-N" stripped,
//                            e.g. runners "ci-host-a-linux[-2..-4]" -> HOST_ID=ci-host-a-linux
//   LOCATION               optional free-text label, e.g. "Build host A (Linux)"
//   INTERVAL_SECONDS       default 30; ignored in --once mode
//
// Usage:
//   node fleet-agent.mjs            # runs forever, posts every INTERVAL_SECONDS
//   node fleet-agent.mjs --once     # single reading then exit (for cron / Task Scheduler)

import os from "node:os";
import { spawnSync } from "node:child_process";

const AGENT_VERSION = "0.1.0";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`missing required env var ${name}`);
    process.exit(1);
  }
  return v;
}

const DASHBOARD_URL = requireEnv("DASHBOARD_URL").replace(/\/$/, "");
const TELEMETRY_TOKEN = requireEnv("TELEMETRY_TOKEN");
const HOST_ID = requireEnv("HOST_ID");
const LOCATION = process.env.LOCATION ?? undefined;
const INTERVAL_MS = Number(process.env.INTERVAL_SECONDS ?? 30) * 1000;
const ONCE = process.argv.includes("--once");

function cpuSnapshot() {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus()) {
    for (const t of Object.values(cpu.times)) total += t;
    idle += cpu.times.idle;
  }
  return { idle, total };
}

async function cpuPercent() {
  const a = cpuSnapshot();
  await new Promise((r) => setTimeout(r, 500));
  const b = cpuSnapshot();
  const idleDelta = b.idle - a.idle;
  const totalDelta = b.total - a.total;
  if (totalDelta <= 0) return 0;
  return Math.max(0, Math.min(100, 100 * (1 - idleDelta / totalDelta)));
}

// os.freemem() only counts strictly-idle pages. Both macOS and Linux use most
// "free" RAM for reclaimable disk cache, so that alone overstates usage by a
// lot (macOS especially -- it routinely shows <5% truly free while the box is
// fine). Compute actual available memory the way each OS's own tools do.
function memUsedMb(totalMem) {
  try {
    if (process.platform === "darwin") {
      const res = spawnSync("vm_stat", [], { encoding: "utf8" });
      const pageSize = Number(res.stdout.match(/page size of (\d+) bytes/)[1]);
      const pages = (label) => Number(res.stdout.match(new RegExp(`${label}:\\s+(\\d+)\\.`))[1]);
      const available =
        (pages("Pages free") + pages("Pages inactive") + pages("Pages speculative") + pages("Pages purgeable")) *
        pageSize;
      return (totalMem - available) / 1e6;
    }
    if (process.platform === "linux") {
      const meminfo = spawnSync("cat", ["/proc/meminfo"], { encoding: "utf8" }).stdout;
      const totalKb = Number(meminfo.match(/MemTotal:\s+(\d+)/)[1]);
      const availableKb = Number(meminfo.match(/MemAvailable:\s+(\d+)/)[1]);
      return (totalKb - availableKb) / 1e3;
    }
  } catch (err) {
    console.error("platform-specific memory check failed, falling back to os.freemem():", err.message);
  }
  return (totalMem - os.freemem()) / 1e6;
}

function diskUsageGb() {
  try {
    if (process.platform === "win32") {
      const res = spawnSync(
        "powershell",
        ["-NoProfile", "-Command", "Get-PSDrive -Name C | Select-Object Used,Free | ConvertTo-Json"],
        { encoding: "utf8" },
      );
      const parsed = JSON.parse(res.stdout);
      const usedGb = parsed.Used / 1e9;
      const totalGb = (parsed.Used + parsed.Free) / 1e9;
      return { usedGb, totalGb };
    }
    const res = spawnSync("df", ["-Pk", "/"], { encoding: "utf8" });
    const line = res.stdout.trim().split("\n")[1];
    const parts = line.trim().split(/\s+/);
    const usedKb = Number(parts[2]);
    const totalKb = Number(parts[1]);
    return { usedGb: usedKb / 1e6, totalGb: totalKb / 1e6 };
  } catch (err) {
    console.error("disk usage check failed:", err.message);
    return { usedGb: 0, totalGb: 0 };
  }
}

async function readTelemetry() {
  const disk = diskUsageGb();
  const totalMem = os.totalmem();
  return {
    host: HOST_ID,
    location: LOCATION,
    cpu_pct: await cpuPercent(),
    cpu_count: os.cpus().length,
    load_avg_1m: os.loadavg()[0] ?? 0,
    mem_used_mb: memUsedMb(totalMem),
    mem_total_mb: totalMem / 1e6,
    disk_used_gb: disk.usedGb,
    disk_total_gb: disk.totalGb,
    uptime_s: os.uptime(),
    agent_version: AGENT_VERSION,
  };
}

async function reportOnce() {
  const payload = await readTelemetry();
  const res = await fetch(`${DASHBOARD_URL}/api/telemetry`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${TELEMETRY_TOKEN}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    console.error(`telemetry post failed: ${res.status} ${await res.text()}`);
  } else {
    console.log(`reported: cpu ${payload.cpu_pct.toFixed(0)}% mem ${(payload.mem_used_mb / payload.mem_total_mb * 100).toFixed(0)}% disk ${(payload.disk_used_gb / payload.disk_total_gb * 100).toFixed(0)}%`);
  }
}

if (ONCE) {
  await reportOnce();
} else {
  console.log(`fleet-agent starting: host=${HOST_ID} interval=${INTERVAL_MS / 1000}s target=${DASHBOARD_URL}`);
  for (;;) {
    await reportOnce().catch((err) => console.error("report failed:", err.message));
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
}
