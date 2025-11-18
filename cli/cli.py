"""Wrapper for the EtinuxE CLI for viewing Marova organism state and telemetry."""

from __future__ import annotations

import os
import shlex
import sys
from pathlib import Path
from typing import Any, Iterable, Sequence

from typer.testing import CliRunner
import getpass
import uuid

REQUIRED_PREFIX = "code"


def _find_repo_root(extra_paths: Iterable[Path]) -> Path:
    """Locate the repository root that contains backend/app/cli.py."""

    candidate_dirs: list[Path] = []
    candidate_dirs.extend(extra_paths)
    candidate_dirs.append(Path.cwd())
    candidate_dirs.extend(Path.cwd().parents)

    for base in candidate_dirs:
        cli_path = base / "backend" / "app" / "cli.py"
        if cli_path.exists():
            return base
    raise RuntimeError(
        "Could not connect to EtinuxE servers."
    )


def _load_cli_app() -> "typer.Typer":  # type: ignore[name-defined]
    """Import the Typer application once the repository path is on sys.path."""

    from backend.app.cli import app  # type: ignore import-not-found

    return app


def _render_table(headers: Sequence[str], rows: Sequence[Sequence[str]]) -> str:
    if not headers:
        return ""
    widths = [len(header) for header in headers]
    for row in rows:
        for idx, cell in enumerate(row):
            widths[idx] = max(widths[idx], len(cell))

    def _build_line(left: str, fill: str, right: str, junction: str) -> str:
        segments = [fill * (width + 2) for width in widths]
        return junction.join([left] + segments + [right])

    top = _build_line("+", "-", "+", "+")
    header_cells = "|".join(f" {header.ljust(widths[idx])} " for idx, header in enumerate(headers))
    header_row = f"|{header_cells}|"
    separator = _build_line("+", "-", "+", "+")
    body_lines = []
    for row in rows:
        cells = "|".join(f" {row[idx].ljust(widths[idx])} " for idx in range(len(headers)))
        body_lines.append(f"|{cells}|")
    bottom = _build_line("+", "-", "+", "+")
    return "\n".join([top, header_row, separator, *body_lines, bottom])


def _stringify(value: Any) -> str:
    if value is None:
        return "—"
    if isinstance(value, float):
        return f"{value:.3f}".rstrip("0").rstrip(".")
    return str(value)


def _print_help() -> None:
    """Show supported commands for the interactive shell."""

    message = (
        "\nEtinuxE Organism Console\n"
        "Commands must start with 'code'. Available options:\n"
        "  code-state [--field field ...]         Show organism vitals\n"
        "  code-stats [--metric metric ...]       Show telemetry snapshots\n"
        "Other utilities:\n"
        "  help                                   Show this message\n"
        "  exit | quit                            Leave the console\n"
    )
    print(message)


def _authenticate_admin(*, attempts: int = 3) -> None:
    """Require a valid admin id/password pair before the CLI launches."""

    from backend.app import services
    from backend.app.storage import read_db
    from fastapi import HTTPException

    snapshot = read_db()
    admin_records = {}
    for item in snapshot.get("admins", []):
        identifier = item.get("id")
        if not identifier:
            continue
        try:
            admin_uuid = uuid.UUID(identifier)
        except (ValueError, TypeError):
            continue
        admin_records[admin_uuid] = item
    if not admin_records:
        print("No administrator accounts are configured.", file=sys.stderr)
        sys.exit(1)

    for _ in range(attempts):
        try:
            admin_id_input = input("Admin id: ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            sys.exit(1)

        try:
            admin_id = uuid.UUID(admin_id_input)
        except ValueError:
            print("Invalid admin id format.")
            continue

        record = admin_records.get(admin_id)
        if not record:
            print("Admin account not found.")
            continue

        try:
            password = getpass.getpass("Admin password: ")
        except (EOFError, KeyboardInterrupt):
            print()
            sys.exit(1)

        try:
            auth_result = services.authenticate(record["email"], password)
        except HTTPException:
            print("Access denied.")
            continue
        except Exception as exc:  # pragma: no cover - defensive guard
            print(f"Authentication error: {exc}", file=sys.stderr)
            sys.exit(1)

        if (
            auth_result.get("role") == "admin"
            and auth_result.get("admin", {}).get("id") == str(admin_id)
        ):
            return

        print("Access denied.")

    print("Too many failed attempts.")
    sys.exit(1)


def main() -> None:
    extra_path = os.environ.get("ETINUXE_ROOT")
    extra_candidates: list[Path] = []
    if extra_path:
        extra_candidates.append(Path(extra_path).resolve())
    extra_candidates.append(Path(__file__).resolve().parent)

    try:
        root = _find_repo_root(extra_candidates)
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)

    sys.path.insert(0, str(root))

    _authenticate_admin()

    try:
        app = _load_cli_app()
    except Exception as exc:  # pragma: no cover - defensive import guard
        print(f"Failed to import CLI from backend: {exc}", file=sys.stderr)
        sys.exit(1)

    runner = CliRunner(mix_stderr=False)
    _print_help()

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
            _print_help()
            continue
        if not raw.startswith(REQUIRED_PREFIX):
            print("Commands must begin with 'code'. Type 'help' for usage.")
            continue

        args = shlex.split(raw)
        try:
            result = runner.invoke(app, args, catch_exceptions=False)
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