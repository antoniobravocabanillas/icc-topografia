"""Compare direct and deployed catalogs without exposing connection secrets."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

sys.stdout.reconfigure(encoding="utf-8")
root = Path(__file__).resolve().parent.parent
node = shutil.which("node")
cli = Path(os.environ["APPDATA"]) / "npm/node_modules/netlify-cli/bin/run.js"

def run_inventory(url, label):
    environment = dict(os.environ, DATABASE_URL=url, NODE_ENV="production")
    result = subprocess.run([node, "--import", "tsx", "scripts/inventory-database-migration.ts"], cwd=root, env=environment, capture_output=True, text=True, encoding="utf-8", timeout=120)
    if result.returncode:
        print(f"Inventory stage failed: {label}")
        for line in result.stderr.splitlines():
            try:
                error = json.loads(line)
                if error.get("failed"):
                    print(json.dumps({"code": error.get("code"), "phase": error.get("phase")}))
            except ValueError:
                pass
        raise RuntimeError("Database inventory failed; connection details suppressed.")
    return json.loads(result.stdout)

def main():
    result = subprocess.run([node, str(cli), "env:get", "DATABASE_URL", "--context", "production", "--scope", "functions", "--json"], cwd=root, capture_output=True, text=True, encoding="utf-8", timeout=120)
    if result.returncode:
        raise RuntimeError("Cannot resolve production configuration.")
    production = json.loads(result.stdout)["DATABASE_URL"]
    rows = (root / ".env").read_text(encoding="utf-8").splitlines()
    direct = next((line.split("=", 1)[1].strip().strip('\"').strip("'") for line in rows if line.startswith("DATABASE_URL=")), "")
    if not direct.startswith(("postgres://", "postgresql://")):
        raise RuntimeError("No direct PostgreSQL source configured.")
    live_inventory = run_inventory(production, "production")
    direct_inventory = run_inventory(direct, "direct")
    matches = all(live_inventory[key] == direct_inventory[key] for key in ("schemaFingerprint", "columns", "identity", "extensions", "objects"))
    differences = [{"table": a["table_name"], "column": a["column_name"], "properties": [key for key in a if a[key] != b.get(key)]} for a, b in zip(live_inventory.pop("schema"), direct_inventory.pop("schema")) if a != b]
    print(json.dumps({"same_catalog_and_workspace_fingerprint": matches, "schema_differences": differences, "production": live_inventory, "direct": direct_inventory}, ensure_ascii=False, indent=2))
    return 0 if matches else 2

if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (RuntimeError, ValueError, KeyError, OSError, subprocess.TimeoutExpired):
        print("Inventory failed safely; credentials and database errors were not printed.")
        raise SystemExit(1)
