from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, List, Sequence

import typer

from . import services

app = typer.Typer(help="EtinuxE organism diagnostics console")


IST_ZONE = timezone(timedelta(hours=5, minutes=30))


def _render_table(headers: Sequence[str], rows: Sequence[Sequence[str]]) -> str:
    if not headers:
        return ""

    widths = [len(header) for header in headers]
    for row in rows:
        for idx, cell in enumerate(row):
            widths[idx] = max(widths[idx], len(cell))

    def build_border(left: str, fill: str, right: str, junction: str) -> str:
        segments = [fill * (width + 2) for width in widths]
        return junction.join([left] + segments + [right])

    def build_row(cells: Sequence[str]) -> str:
        content = "|".join(f" {cells[idx].ljust(widths[idx])} " for idx in range(len(headers)))
        return f"|{content}|"

    top = build_border("+", "-", "+", "+")
    header_row = build_row(headers)
    separator = build_border("+", "-", "+", "+")
    body = [build_row(row) for row in rows]
    bottom = build_border("+", "-", "+", "+")
    return "\n".join([top, header_row, separator, *body, bottom])


def _stringify(value: Any) -> str:
    if value is None:
        return "—"
    if isinstance(value, float):
        return f"{value:.3f}".rstrip("0").rstrip(".")
    return str(value)


def _parse_datetime(value: str) -> datetime | None:
    candidate = value.strip()
    if not candidate:
        return None
    normalized = candidate.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    else:
        parsed = parsed.astimezone(timezone.utc)
    return parsed


def _convert_value_to_ist(value: Any) -> Any:
    if isinstance(value, str):
        parsed = _parse_datetime(value)
        if parsed is not None:
            return parsed.astimezone(IST_ZONE).isoformat()
    return value


def _convert_mapping_to_ist(payload: dict[str, Any]) -> dict[str, Any]:
    return {key: _convert_value_to_ist(value) for key, value in payload.items()}


def _select_keys(payload: dict, keys: List[str], label: str) -> dict:
    if not keys:
        return payload
    missing = [key for key in keys if key not in payload]
    if missing:
        typer.echo(f"Unknown {label}: {', '.join(sorted(set(missing)))}", err=True)
        raise typer.Exit(code=1)
    return {key: payload[key] for key in keys}


@app.command("code-state")
def code_state(
    fields: List[str] = typer.Option([], "--field", "-f", help="Specific organism state keys to include."),
) -> None:
    """Show the current organism vitals."""

    state = services.get_organism_state().model_dump(mode="json")
    state = _select_keys(state, fields, "state field")
    state = _convert_mapping_to_ist(state)
    if state.get("sleep_session_started_at") in (None, ""):
        state["sleep_session_started_at"] = "Idle"
    if state.get("sleep_session_ends_at") in (None, ""):
        state["sleep_session_ends_at"] = "Pending"

    if not state:
        typer.echo("No organism state available.")
        return

    rows = [[key, _stringify(value)] for key, value in state.items()]
    typer.echo(_render_table(["Field", "Value"], rows))


@app.command("code-stats")
def code_stats(
    limit: int = typer.Option(30, min=1, help="Number of telemetry samples to return (latest first)."),
    metrics: List[str] = typer.Option([], "--metric", "-m", help="Telemetry metrics to include (timestamp is always shown)."),
) -> None:
    """Inspect recent organism telemetry samples."""

    snapshot = services.get_organism_telemetry(limit=limit)

    entries = snapshot.get("entries", [])
    entries = [_convert_mapping_to_ist(entry) for entry in entries]
    if metrics:
        filtered = []
        missing = set()
        for entry in entries:
            current = {"timestamp": entry.get("timestamp")}
            for metric in metrics:
                if metric in entry:
                    current[metric] = entry[metric]
                else:
                    missing.add(metric)
            filtered.append(current)
        if missing:
            typer.echo(f"Warning: missing telemetry metrics: {', '.join(sorted(missing))}", err=True)
        entries = filtered

    typer.echo("Telemetry")
    if entries:
        headers = list(entries[0].keys())
        rows = [[_stringify(entry.get(column)) for column in headers] for entry in entries]
        typer.echo(_render_table(headers, rows))
    else:
        typer.echo("(none)")


@app.command("code-auto-sleep")
def auto_sleep(
    disable: bool = typer.Option(False, "--disable", help="Disable automatic sleep scheduling."),
    enable: bool = typer.Option(False, "--enable", help="Enable automatic sleep scheduling."),
) -> None:
    """Inspect or configure the auto sleep scheduler."""

    if disable and enable:
        typer.echo("Choose either --enable or --disable when calling auto-sleep.", err=True)
        raise typer.Exit(code=1)

    if disable:
        state = services.set_auto_sleep_mode(False)
        action = "disabled"
    elif enable:
        state = services.set_auto_sleep_mode(True)
        action = "enabled"
    else:
        state = services.get_organism_state()
        action = None

    snapshot = _convert_mapping_to_ist(state.model_dump(mode="json"))
    start_label = snapshot.get("sleep_session_started_at") or "Idle"
    end_label = snapshot.get("sleep_session_ends_at") or "Pending"

    if action:
        typer.echo(f"Auto sleep {action}.")
    typer.echo(f"Status: {'enabled' if state.auto_sleep_enabled else 'disabled'}")
    typer.echo(f"Sleep session start: {start_label}")
    typer.echo(f"Sleep session ends: {end_label}")


if __name__ == "__main__":
    app()
