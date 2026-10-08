"""Apply only the pinned withdrawal receipt DDL after a verified rollback check."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
TABLE = "TerraqoEducationEvidenceWithdrawal"
EXPECTED = "c8f79f50465110bdd886c23cbfbc51ee371876893eb93fa70eefbc8942e3c019"


def main():
    if sys.argv[1:] not in ([], ["--apply"]):
        raise RuntimeError("Unsupported mode")
    spec = importlib.util.spec_from_file_location("withdrawal_inventory", ROOT / "scripts/inventory-database-migration.py")
    inventory = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(inventory)
    cli = Path(os.environ["APPDATA"]) / "npm/node_modules/netlify-cli/bin/run.js"
    configured = subprocess.run([shutil.which("node"), str(cli), "env:get", "DATABASE_URL", "--context", "production", "--scope", "functions", "--json"],
                                cwd=ROOT, capture_output=True, text=True, encoding="utf-8", timeout=120)
    if configured.returncode:
        raise RuntimeError("Configuration unavailable")
    production = json.loads(configured.stdout)["DATABASE_URL"]
    direct = next(line.split("=", 1)[1].strip().strip('"').strip("'") for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines() if line.startswith("DATABASE_URL="))
    if not direct.startswith(("postgres://", "postgresql://")):
        raise RuntimeError("Direct source unavailable")
    before = inventory.run_inventory(direct, "direct")
    live = inventory.run_inventory(production, "runtime")
    keys = ("schemaFingerprint", "columns", "identity", "extensions", "objects")
    if not all(before[key] == live[key] for key in keys):
        raise RuntimeError("Source identity mismatch")
    present = any(row["table_name"] == TABLE for row in before["schema"])
    environment = dict(os.environ, DATABASE_URL=direct, NODE_ENV="production", TEST_PORTAL_URL="https://api.terraqoglobal.com",
                       TERRAQO_MUTATING_TESTS="icc-topografia:20616116313")

    def run(apply=False):
        args = [shutil.which("node"), "--import", "tsx", "scripts/check-education-withdrawal-schema.ts"]
        if apply:
            args.append("--apply")
        result = subprocess.run(args, cwd=ROOT, env=environment, capture_output=True, text=True, encoding="utf-8", timeout=120)
        if result.returncode:
            raise RuntimeError("Pinned catalog check failed; private diagnostics suppressed")
        report = json.loads(result.stdout.strip())
        if report["fingerprint"] != EXPECTED:
            raise RuntimeError("Catalog fingerprint mismatch")
        return report

    report = run()
    checked = inventory.run_inventory(direct, "after-check")
    if not all(before[key] == checked[key] for key in keys):
        raise RuntimeError("Rollback check changed catalog")
    print("PASS pinned withdrawal DDL checked in rollback; source/runtime and previous catalog intact.", flush=True)
    if sys.argv[1:]:
        environment["EDUCATION_WITHDRAWAL_SCHEMA_EXPECTED"] = EXPECTED
        applied = run(True)
        if applied["ledgerFingerprint"] != report["ledgerFingerprint"]:
            raise RuntimeError("Ledger changed between check and apply")
        after = inventory.run_inventory(direct, "after-apply")
        if not all(before[key] == after[key] for key in ("identity", "extensions")):
            raise RuntimeError("Existing identity changed")
        if [row for row in before["schema"] if row["table_name"] != TABLE] != [row for row in after["schema"] if row["table_name"] != TABLE]:
            raise RuntimeError("Existing schema changed")
        first, last = before["objects"][0], after["objects"][0]
        delta = 0 if present else 1
        if int(last["constraints"]) != int(first["constraints"]) + 7 * delta or int(last["indexes"]) != int(first["indexes"]) + 5 * delta or last["functions"] != first["functions"]:
            raise RuntimeError("Unexpected catalog delta")
        deployed = inventory.run_inventory(production, "runtime-after")
        if not all(after[key] == deployed[key] for key in keys):
            raise RuntimeError("Runtime catalog mismatch")
        final = run()  # Recheck the persisted definitions, not merely their counts.
        if final["ledgerFingerprint"] != report["ledgerFingerprint"]:
            raise RuntimeError("Ledger changed after apply")
        print("PASS withdrawal table applied: exactly 7 constraints/5 indexes; existing schema/identity and runtime preserved.")
    print(json.dumps({"mode": "applied" if sys.argv[1:] else "checked-in-rollback", "fingerprint": EXPECTED, "ledgerChanged": False}))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (RuntimeError, ValueError, KeyError, OSError, StopIteration, subprocess.TimeoutExpired):
        print("Withdrawal additive bootstrap failed safely; private diagnostics suppressed.")
        raise SystemExit(1)
