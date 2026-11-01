"""Capture independent Rust processor results and complete structured errors."""

from __future__ import annotations

import argparse
import json
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "tests/fixtures/processor_reference.json"


def main() -> None:
    """Refresh or verify committed results; all files live in a temporary directory."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="textforge-processor-reference-") as directory:
        output = subprocess.check_output(
            [
                "cargo",
                "run",
                "--quiet",
                "--locked",
                "--features",
                "test-reference",
                "--example",
                "processor_reference",
                "--",
                directory,
            ],
            cwd=ROOT,
            text=True,
        )
    rows: dict[str, object] = {}
    for line in output.splitlines():
        if not line.startswith("REF\t"):
            continue
        _, name, status, *fields = line.split("\t")
        if status == "ok":
            rows[name] = {"ok": bytes.fromhex(fields[0]).decode()}
        else:
            rows[name] = {
                "error": {
                    "code": int(fields[0]),
                    "stage": fields[1].lower(),
                    **{
                        key: bytes.fromhex(value).decode()
                        for key, value in zip(
                            ("message", "instruction", "input"), fields[2:], strict=True
                        )
                    },
                }
            }
    fixture = (
        json.dumps(
            {
                "core_revision": (ROOT / "vendor/CORE_REVISION")
                .read_text(encoding="utf-8")
                .strip(),
                "cases": rows,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n"
    )
    if args.check:
        if FIXTURE.read_text(encoding="utf-8") != fixture:
            raise SystemExit("Processor reference changed; review before regenerating")
    else:
        FIXTURE.write_text(fixture, encoding="utf-8")
    print(f"Verified {len(rows)} independent processor reference cases")


if __name__ == "__main__":
    main()
