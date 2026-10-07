"""Check/apply only three additive education tables against the verified source."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
TABLES = {"TerraqoEducationEvidence", "TerraqoEducationEvidenceOperation", "TerraqoEducationEvidenceAttempt"}


def main():
    if sys.argv[1:] not in ([], ["--apply"]):
        raise RuntimeError("Unsupported mode")
    spec = importlib.util.spec_from_file_location("education_apply_inventory", ROOT / "scripts/inventory-database-migration.py")
    inventory = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(inventory)
    cli = Path(os.environ["APPDATA"]) / "npm/node_modules/netlify-cli/bin/run.js"
    result = subprocess.run([shutil.which("node"), str(cli), "env:get", "DATABASE_URL", "--context", "production", "--scope", "functions", "--json"],
                            cwd=ROOT, capture_output=True, text=True, encoding="utf-8", timeout=120)
    if result.returncode:
        raise RuntimeError("Configuration unavailable")
    production = json.loads(result.stdout)["DATABASE_URL"]
    direct = next(line.split("=", 1)[1].strip().strip('"').strip("'") for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines() if line.startswith("DATABASE_URL="))
    if not direct.startswith(("postgres://", "postgresql://")):
        raise RuntimeError("Direct source unavailable")
    live = inventory.run_inventory(production, "production")
    before = inventory.run_inventory(direct, "direct")
    keys = ("schemaFingerprint", "columns", "identity", "extensions", "objects")
    if not all(live[key] == before[key] for key in keys):
        raise RuntimeError("Source identity mismatch")
    print("PASS direct/runtime source fingerprints match; credentials remain in child environment only.", flush=True)
    present = {row["table_name"] for row in before["schema"]} & TABLES
    if present and present != TABLES:
        raise RuntimeError("Partial prerequisite schema requires review")
    environment = dict(os.environ, DATABASE_URL=direct, NODE_ENV="production", TEST_PORTAL_URL="https://api.terraqoglobal.com",
                       TERRAQO_MUTATING_TESTS="icc-topografia:20616116313")

    def run(mode):
        process = subprocess.run([shutil.which("node"), "--import", "tsx", "scripts/apply-education-evidence-schema.ts", mode],
                                 cwd=ROOT, env=environment, capture_output=True, text=True, encoding="utf-8", timeout=120)
        if process.returncode:
            raise RuntimeError("Additive catalog verification failed; private diagnostics suppressed")
        return json.loads(process.stdout.strip())

    checked = run("--check")
    if sys.argv[1:]:
        environment["EDUCATION_SCHEMA_EXPECTED"] = checked["fingerprint"]
        applied = run("--apply")
        if applied["fingerprint"] != checked["fingerprint"]:
            raise RuntimeError("Catalog changed between check and apply")
    after = inventory.run_inventory(direct, "after")
    if not all(before[key] == after[key] for key in ("identity", "extensions")):
        raise RuntimeError("Source identity changed")
    old_schema = [row for row in before["schema"] if row["table_name"] not in TABLES]
    after_old_schema = [row for row in after["schema"] if row["table_name"] not in TABLES]
    if old_schema != after_old_schema:
        raise RuntimeError("Unexpected existing schema change")
    if sys.argv[1:]:
        delta = 0 if present else 1
        first, last = before["objects"][0], after["objects"][0]
        if int(last["constraints"]) != int(first["constraints"]) + 23 * delta or int(last["indexes"]) != int(first["indexes"]) + 12 * delta or last["functions"] != first["functions"]:
            raise RuntimeError("Unexpected catalog object delta")
    if not sys.argv[1:] and not all(before[key] == after[key] for key in keys):
        raise RuntimeError("Check-only rollback changed catalog")
    if sys.argv[1:]:
        deployed = inventory.run_inventory(production, "production-after")
        if not all(after[key] == deployed[key] for key in keys):
            raise RuntimeError("Runtime catalog does not match source")
    print("PASS three-table catalog verified; existing schema/workspace identity preserved; no Prisma ledger writes.")
    print(json.dumps({"mode": "applied" if sys.argv[1:] else "checked-in-rollback", "fingerprint": checked["fingerprint"]}))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (RuntimeError, ValueError, KeyError, OSError, StopIteration, subprocess.TimeoutExpired):
        print("Education additive preparation failed safely; no connection details printed.")
        raise SystemExit(1)
