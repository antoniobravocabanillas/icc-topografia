"""Apply only the additive CV receipt table through the verified direct source."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent

def main():
    spec = importlib.util.spec_from_file_location("cv_schema_inventory", ROOT / "scripts/inventory-database-migration.py")
    inventory = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(inventory)
    cli = Path(os.environ["APPDATA"]) / "npm/node_modules/netlify-cli/bin/run.js"
    result = subprocess.run([shutil.which("node"), str(cli), "env:get", "DATABASE_URL", "--context", "production", "--scope", "functions", "--json"], cwd=ROOT, capture_output=True, text=True, encoding="utf-8", timeout=120)
    if result.returncode:
        raise RuntimeError("Configuration unavailable")
    production = json.loads(result.stdout)["DATABASE_URL"]
    direct = next(line.split("=", 1)[1].strip().strip('"').strip("'") for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines() if line.startswith("DATABASE_URL="))
    if not direct.startswith(("postgres://", "postgresql://")):
        raise RuntimeError("Direct source unavailable")
    live = inventory.run_inventory(production, "production")
    source = inventory.run_inventory(direct, "direct")
    if not all(live[key] == source[key] for key in ("schemaFingerprint", "columns", "identity", "extensions", "objects")):
        raise RuntimeError("Source identity mismatch")
    print("PASS direct/runtime schema and workspace fingerprints match; credentials remain in child environment only.", flush=True)
    environment = dict(os.environ, DATABASE_URL=direct, NODE_ENV="production")
    environment["TEST_PORTAL_URL"] = "https://api.terraqoglobal.com"
    environment["TERRAQO_MUTATING_TESTS"] = "icc-topografia:20616116313"
    result = subprocess.run([shutil.which("node"), "--import", "tsx", "scripts/apply-cv-publication-schema.ts"], cwd=ROOT, env=environment, timeout=120)
    return result.returncode

if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (RuntimeError, ValueError, KeyError, OSError, StopIteration, subprocess.TimeoutExpired):
        print("CV schema preparation failed safely; no connection details printed.")
        raise SystemExit(1)
