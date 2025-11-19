"""Remote EtinuxE CLI for interacting with a deployed backend over HTTP."""

from __future__ import annotations

import json
import os
import shlex
import sys
from datetime import datetime, timedelta, timezone
from typing import Any, List, Sequence
import urllib.error
import urllib.parse
import urllib.request

import typer
from typer.testing import CliRunner
import getpass

REQUIRED_PREFIX = "code"
DEFAULT_BASE_URL = "https://exun.codeclub.co.in"
IST_ZONE = timezone(timedelta(hours=5, minutes=30))

app = typer.Typer(help="EtinuxE remote organism diagnostics console")


class RemoteError(Exception):
    """Raised when the remote API returns an error response."""


class RemoteClient:
    def __init__(self, base_url: str) -> None:
        self.base_url = base_url.rstrip("/") or DEFAULT_BASE_URL

    def request(self, method: str, path: str, *, query: dict[str, Any] | None = None, payload: dict[str, Any] | None = None) -> Any:
        url = urllib.parse.urljoin(self.base_url + "/", path.lstrip("/"))
        if query:
            encoded = urllib.parse.urlencode(query, doseq=True)
            url = f"{url}?{encoded}"

        headers = {"Accept": "application/json"}
        data: bytes | None = None
        if payload is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(payload).encode("utf-8")

        request = urllib.request.Request(url=url, data=data, headers=headers, method=method.upper())
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                body = response.read()
                if not body:
                    return None
                return json.loads(body.decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.reason
            try:
                payload_text = exc.read().decode("utf-8")
                payload_json = json.loads(payload_text)
                detail = payload_json.get("detail", detail)
            except Exception:  # pragma: no cover - non-json error payloads
                detail = detail or exc.reason
            raise RemoteError(f"{exc.code} {exc.reason}: {detail}")
        except urllib.error.URLError as exc:
            raise RemoteError(f"Failed to contact {self.base_url}: {exc.reason}") from exc

    def get_state(self) -> dict[str, Any]:
        data = self.request("GET", "/organism/state")
        if not isinstance(data, dict):
            raise RemoteError("Unexpected response payload for organism state")
        return data

    def get_telemetry(self, limit: int) -> dict[str, Any]:
        data = self.request("GET", "/organism/telemetry", query={"limit": limit})
        if not isinstance(data, dict):
            raise RemoteError("Unexpected response payload for telemetry")
        return data

    def set_auto_sleep(self, enabled: bool) -> dict[str, Any]:
        data = self.request("POST", "/organism/auto-sleep", payload={"enabled": enabled})
        if not isinstance(data, dict):
            raise RemoteError("Unexpected response payload for auto sleep toggle")
        return data

    def authenticate_admin(self, email: str, password: str) -> dict[str, Any]:
        data = self.request("POST", "/auth/login", payload={"email": email, "password": password})
        if not isinstance(data, dict):
            raise RemoteError("Unexpected response payload for login")
        if data.get("role") != "admin":
            raise RemoteError("Account lacks administrator privileges")
        return data


@app.callback()
def main_callback(ctx: typer.Context, base_url: str | None = typer.Option(None, "--base-url", help="Override the remote API base URL.")) -> None:
    resolved = base_url or os.environ.get("ETINUXE_REMOTE_BASE_URL") or DEFAULT_BASE_URL
    ctx.obj = RemoteClient(resolved)


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


def _authenticate_admin(client: RemoteClient, attempts: int = 3) -> None:
    for _ in range(attempts):
        try:
            email_input = input("Admin email: ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            sys.exit(1)

        if not email_input:
            print("Admin email is required.")
            continue

        try:
            password = getpass.getpass("Admin password: ")
        except (EOFError, KeyboardInterrupt):
            print()
            sys.exit(1)

        try:
            client.authenticate_admin(email_input, password)
        except RemoteError as exc:
            print(f"Access denied: {exc}")
            continue
        except Exception as exc:  # pragma: no cover - defensive guard
            print(f"Authentication error: {exc}", file=sys.stderr)
            sys.exit(1)
        else:
            return

    print("Too many failed attempts.")
    sys.exit(1)


@app.command("code-state")
def code_state(
    ctx: typer.Context,
    fields: List[str] = typer.Option([], "--field", "-f", help="Specific organism state keys to include."),
) -> None:
    client: RemoteClient = ctx.obj
    try:
        state = client.get_state()
    except RemoteError as exc:
        typer.echo(f"Error fetching organism state: {exc}", err=True)
        raise typer.Exit(code=1) from exc

    state = _convert_mapping_to_ist(state)
    if not state:
        typer.echo("No organism state available.")
        return

    if state.get("sleep_session_started_at") in (None, ""):
        state["sleep_session_started_at"] = "Idle"
    if state.get("sleep_session_ends_at") in (None, ""):
        state["sleep_session_ends_at"] = "Pending"

    selected = state
    if fields:
        missing = [field for field in fields if field not in state]
        if missing:
            typer.echo(f"Unknown state field(s): {', '.join(sorted(set(missing)))}", err=True)
            raise typer.Exit(code=1)
        selected = {key: state[key] for key in fields}

    rows = [[key, _stringify(value)] for key, value in selected.items()]
    typer.echo(_render_table(["Field", "Value"], rows))


@app.command("code-stats")
def code_stats(
    ctx: typer.Context,
    limit: int = typer.Option(30, min=1, help="Number of telemetry samples to return (latest first)."),
    metrics: List[str] = typer.Option([], "--metric", "-m", help="Telemetry metrics to include (timestamp is always shown)."),
) -> None:
    client: RemoteClient = ctx.obj
    try:
        snapshot = client.get_telemetry(limit)
    except RemoteError as exc:
        typer.echo(f"Error fetching telemetry: {exc}", err=True)
        raise typer.Exit(code=1) from exc

    entries = snapshot.get("entries", [])
    entries = [_convert_mapping_to_ist(entry) for entry in entries if isinstance(entry, dict)]

    if metrics:
        filtered_entries: List[dict[str, Any]] = []
        missing = set()
        for entry in entries:
            current = {"timestamp": entry.get("timestamp")}
            for metric in metrics:
                if metric in entry:
                    current[metric] = entry[metric]
                else:
                    missing.add(metric)
            filtered_entries.append(current)
        if missing:
            typer.echo(f"Warning: missing telemetry metrics: {', '.join(sorted(missing))}", err=True)
        entries = filtered_entries

    typer.echo("Telemetry")
    if not entries:
        typer.echo("(none)")
        return

    headers = list(entries[0].keys())
    rows = [[_stringify(entry.get(column)) for column in headers] for entry in entries]
    typer.echo(_render_table(headers, rows))


@app.command("code-auto-sleep")
def auto_sleep(
    ctx: typer.Context,
    disable: bool = typer.Option(False, "--disable", help="Disable automatic sleep scheduling."),
    enable: bool = typer.Option(False, "--enable", help="Enable automatic sleep scheduling."),
) -> None:
    if disable and enable:
        typer.echo("Choose either --enable or --disable when calling auto-sleep.", err=True)
        raise typer.Exit(code=1)

    client: RemoteClient = ctx.obj

    try:
        if disable:
            state = client.set_auto_sleep(False)
            action = "disabled"
        elif enable:
            state = client.set_auto_sleep(True)
            action = "enabled"
        else:
            state = client.get_state()
            action = None
    except RemoteError as exc:
        typer.echo(f"Auto sleep command failed: {exc}", err=True)
        raise typer.Exit(code=1) from exc

    state = _convert_mapping_to_ist(state)
    start_label = state.get("sleep_session_started_at") or "Idle"
    end_label = state.get("sleep_session_ends_at") or "Pending"

    if action:
        typer.echo(f"Auto sleep {action}.")
    typer.echo(f"Status: {'enabled' if state.get('auto_sleep_enabled') else 'disabled'}")
    typer.echo(f"Sleep session start: {start_label}")
    typer.echo(f"Sleep session ends: {end_label}")


def _print_help(base_url: str) -> None:
    message = (
        "\nEtinuxE Remote Organism Console\n"
        f"Target API base URL: {base_url}\n"
        "Commands must start with 'code'. Available options:\n"
        "  code-state [--field field ...]         Show organism vitals\n"
        "  code-stats [--metric metric ...]       Show telemetry snapshots\n"
        "  code-auto-sleep [--enable|--disable]   Toggle or inspect auto sleep\n"
        "Other utilities:\n"
        "  help                                   Show this message\n"
        "  exit | quit                            Leave the console\n"
    )
    print(message)


def main() -> None:
    base_url_env = os.environ.get("ETINUXE_REMOTE_BASE_URL", "").strip()
    prompt_default = base_url_env or DEFAULT_BASE_URL
    if base_url_env:
        base_url = base_url_env
    else:
        try:
            raw = input(f"API base URL [{prompt_default}]: ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            sys.exit(1)
        base_url = raw or prompt_default
    os.environ["ETINUXE_REMOTE_BASE_URL"] = base_url

    auth_client = RemoteClient(base_url)
    _authenticate_admin(auth_client)

    runner = CliRunner(mix_stderr=False)
    _print_help(base_url)

    env = {**os.environ}
    while True:
        try:
            raw = input("exun> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break

        if not raw:
            continue
        if raw.lower() in {"exit", "quit"}:
            break
        if raw.lower() == "help":
            _print_help(base_url)
            continue
        if not raw.startswith(REQUIRED_PREFIX):
            print("Commands must begin with 'code'. Type 'help' for usage.")
            continue

        args = shlex.split(raw)
        try:
            result = runner.invoke(app, args, env=env, catch_exceptions=False)
        except Exception as exc:  # pragma: no cover - Typer surfaced exception
            print(f"Command error: {exc}", file=sys.stderr)
            continue

        stdout_text = result.stdout or ""
        stderr_text = getattr(result, "stderr", "")

        if stdout_text:
            print(stdout_text, end="")
        if stderr_text:
            print(stderr_text, end="", file=sys.stderr)

        if result.exit_code != 0:
            print(f"Command exited with status {result.exit_code}")


if __name__ == "__main__":
    main()
