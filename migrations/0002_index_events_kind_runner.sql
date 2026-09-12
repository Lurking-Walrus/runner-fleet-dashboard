-- Migration number: 0002 	 2026-09-12T22:54:53.731Z

-- detectIssues() in poller.ts filters events by (kind, runner_name), and for
-- runner_offline also orders by ts desc limit 1. With only idx_events_ts on ts,
-- those lookups scanned nearly the whole table every 2-minute poll for each
-- offline/stuck runner, driving D1 rows_read to ~75% of the daily free-tier cap
-- from a table with under 1,500 rows.
CREATE INDEX idx_events_kind_runner_ts ON events(kind, runner_name, ts DESC);
