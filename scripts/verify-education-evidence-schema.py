"""Verify education schema/rollback cases or scoped physical fixtures on the matched source."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent


def main():
    spec = importlib.util.spec_from_file_location("education_schema_inventory", ROOT / "scripts/inventory-database-migration.py")
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
    source = inventory.run_inventory(direct, "direct")
    keys = ("schemaFingerprint", "columns", "identity", "extensions", "objects")
    if not all(live[key] == source[key] for key in keys):
        raise RuntimeError("Source identity mismatch")
    print("PASS direct/runtime schema and workspace fingerprints match; credentials remain in child environment only.", flush=True)
    environment = dict(os.environ, DATABASE_URL=direct, NODE_ENV="production", TEST_PORTAL_URL="https://api.terraqoglobal.com",
                       TERRAQO_MUTATING_TESTS="icc-topografia:20616116313")
    if sys.argv[1:] not in ([], ["--cleanup"], ["--commit"], ["--physical"], ["--physical-cleanup"], ["--operations"]):
        raise RuntimeError("Unsupported verification mode")
    script = {"--cleanup": "scripts/test-icc-education-evidence-cleanup.ts", "--commit": "scripts/test-icc-education-evidence-commit.ts",
              "--physical": "scripts/test-icc-education-evidence-physical.ts",
              "--physical-cleanup": "scripts/test-icc-education-evidence-physical.ts",
              "--operations": "scripts/test-icc-education-evidence-operations.ts"}.get(
        sys.argv[1] if sys.argv[1:] else "", "scripts/test-icc-education-evidence-schema.ts")
    arguments = ["--cleanup-interrupted"] if sys.argv[1:] == ["--physical-cleanup"] else []
    if sys.argv[1:] == ["--operations"]:
        configured = subprocess.run([shutil.which("node"), str(cli), "env:get", "PROFESSIONAL_DOCUMENT_CLEANUP_SECRET",
                                    "--context", "production", "--scope", "functions", "--json"],
                                   cwd=ROOT, capture_output=True, text=True, encoding="utf-8", timeout=120)
        if configured.returncode:
            raise RuntimeError("Operational configuration unavailable")
        environment["PROFESSIONAL_DOCUMENT_CLEANUP_SECRET"] = json.loads(configured.stdout)["PROFESSIONAL_DOCUMENT_CLEANUP_SECRET"]
    result = subprocess.run([shutil.which("node"), "--conditions=react-server", "--import", "tsx", script, *arguments],
                            cwd=ROOT, env=environment, timeout=300 if sys.argv[1:] in (["--physical"], ["--operations"]) else 120)
    if result.returncode:
        return result.returncode
    after = inventory.run_inventory(direct, "direct-after-rollback")
    if not all(source[key] == after[key] for key in keys):
        raise RuntimeError("Rollback catalog mismatch")
    print("PASS post-test schema/workspace fingerprints unchanged; no migration ledger writes.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (RuntimeError, ValueError, KeyError, OSError, StopIteration, subprocess.TimeoutExpired):
        print("Education schema verification failed safely; no connection details printed.")
        raise SystemExit(1)
