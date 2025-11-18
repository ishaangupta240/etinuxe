# EtinuxE CLI Commands

- `code-state` — Displays the organism's current vitals. Supports `--field/-f` to limit the output to specific state keys (e.g., `hunger`, `metabolism`). Datetime fields are formatted in IST (UTC+05:30).
- `code-stats` — Shows recent telemetry entries. Accepts `--metric/-m` to select telemetry columns and `--limit` (default 30) for the number of samples. All timestamps are rendered in IST (UTC+05:30).
- `help` — Prints the available commands within the interactive shell.
- `exit`, `quit` — Leave the CLI session.

## Works only on localhost

### Organism state keys (`--field`)

- `hunger`
- `metabolism`
- `mood`
- `last_feed`
- `dream_energy`
- `dream_debt`
- `toxicity_level`
- `sleep_phase`
- `last_sleep`
- `sensitivity_threshold`
- `toxicity_resistance`
- `dream_tolerance`
- `auto_sleep_enabled`
- `sleep_schedule_hour`
- `wake_schedule_hour`
- `sleep_duration_hours`
- `sleep_session_started_at`
- `sleep_session_ends_at`

### Telemetry metrics (`--metric`)

- `timestamp` (always included)
- `hunger`
- `metabolism`
- `dream_energy`
- `toxicity_level`
- `sleep_hours`
- `sleep_phase`
- `dream_debt`
