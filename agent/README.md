# fleet-agent

Zero-dependency Node script that reports one physical host's CPU/RAM/disk/uptime
to the dashboard. Run one instance per **physical machine**, not per runner —
several runner processes on the same box (e.g. the four `ci-host-a-linux*`
runners) share one host and therefore one agent.

`HOST_ID` must equal the runner name with any trailing `-N` stripped — that's
how the dashboard groups a runner fleet back to the physical box it's on:

| Runners | HOST_ID |
|---|---|
| `ci-host-a-linux`, `-2`, `-3`, `-4` | `ci-host-a-linux` |
| `ci-host-b-arm64-1`, `-2` | `ci-host-b-arm64` |

## Config

Copy `.env.example` to `.env` (or export the vars however your platform prefers)
and fill in:

- `DASHBOARD_URL` — the deployed Worker URL
- `TELEMETRY_TOKEN` — same value as the Worker's `TELEMETRY_TOKEN` secret
- `HOST_ID` — see table above
- `LOCATION` — optional, e.g. `"Build host A (Linux)"`

## Run it

```bash
node fleet-agent.mjs           # daemon, reports every 30s
node fleet-agent.mjs --once    # single reading, for cron / Task Scheduler
```

### Linux / WSL — systemd user timer (recommended over a long-running daemon)

```ini
# ~/.config/systemd/user/fleet-agent.service
[Unit]
Description=fleet-agent telemetry report

[Service]
Type=oneshot
EnvironmentFile=%h/fleet-agent/.env
ExecStart=/usr/bin/node %h/fleet-agent/fleet-agent.mjs --once
```

```ini
# ~/.config/systemd/user/fleet-agent.timer
[Unit]
Description=Run fleet-agent every 30s

[Timer]
OnBootSec=10
OnUnitActiveSec=30s

[Install]
WantedBy=timers.target
```

```bash
systemctl --user daemon-reload
systemctl --user enable --now fleet-agent.timer
```

### macOS — launchd

```xml
<!-- ~/Library/LaunchAgents/com.example.fleet-agent.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.example.fleet-agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/opt/fleet-agent/fleet-agent.mjs</string>
    <string>--once</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>DASHBOARD_URL</key><string>https://runner-fleet-dashboard.YOUR-SUBDOMAIN.workers.dev</string>
    <key>TELEMETRY_TOKEN</key><string>REPLACE_ME</string>
    <key>HOST_ID</key><string>ci-host-b-arm64</string>
  </dict>
  <key>StartInterval</key><integer>30</integer>
  <key>StandardErrorPath</key><string>/tmp/fleet-agent.err.log</string>
</dict>
</plist>
```

```bash
launchctl load ~/Library/LaunchAgents/com.example.fleet-agent.plist
```

### Windows — Task Scheduler

```powershell
$action = New-ScheduledTaskAction -Execute "node.exe" -Argument "C:\fleet-agent\fleet-agent.mjs --once" -WorkingDirectory "C:\fleet-agent"
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Seconds 30) -RepetitionDuration ([TimeSpan]::MaxValue)
Register-ScheduledTask -TaskName "fleet-agent" -Action $action -Trigger $trigger
```

Set `DASHBOARD_URL`, `TELEMETRY_TOKEN`, `HOST_ID` as system environment
variables first (`setx` or System Properties → Environment Variables) so the
scheduled task inherits them.
