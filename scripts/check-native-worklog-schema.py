"""Verify the specific native-worklog DDL in rollback only; no apply mode."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent


def main():
    if sys.argv[1:] not in ([], ["--core"], ["--reconciliation"], ["--owner-fence"], ["--decision"], ["--combined"], ["--release"]):
        raise RuntimeError("Unsupported mode")
    spec = importlib.util.spec_from_file_location("worklog_inventory", ROOT / "scripts/inventory-database-migration.py")
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
    environment = dict(os.environ, DATABASE_URL=direct, NODE_ENV="production", TEST_PORTAL_URL="https://api.terraqoglobal.com",
                       TERRAQO_MUTATING_TESTS="icc-topografia:20616116313")
    args = [shutil.which("node"), "--conditions=react-server", "--import", "tsx", "scripts/check-native-worklog-schema.ts", *sys.argv[1:]]
    checked = subprocess.run(args, cwd=ROOT, env=environment, capture_output=True, text=True, encoding="utf-8", timeout=210 if sys.argv[1:] == ["--core"] else 120)
    if checked.returncode:
        # Forward only our bounded diagnostic category/source line, never raw errors.
        for line in checked.stderr.splitlines():
            try:
                diagnostic = json.loads(line)
            except ValueError:
                continue
            if diagnostic.get("outcome") == "failed" and diagnostic.get("category") in ("assertion", "unknown", "P2010", "P2028", "P2034"):
                import re
                location = diagnostic.get("location", "")
                if re.fullmatch(r"(?:test-native-worklog-[a-z-]+|check-native-worklog-schema)\.ts:[0-9]+:[0-9]+", location):
                    safe = {"category": diagnostic["category"], "location": location}
                    if re.fullmatch(r"[0-9A-Z]{5}", str(diagnostic.get("sqlState", ""))):
                        safe["sqlState"] = diagnostic["sqlState"]
                    print(json.dumps(safe))
        raise RuntimeError("Catalog check failed; private diagnostics suppressed")
    report = json.loads(checked.stdout.strip())
    if sys.argv[1:] == ["--combined"]:
        if report != {"mode": "combined-rollback", "combined": {"state": "exact", "fingerprint": "74bf7259e20f0f84330a03567b1fd181d8c645203f71f8606ffb3b2436a624ad", "constraints": 23, "indexes": 12}, "ledgerFingerprint": "63b2a899b04e053157f7212cd53bc2409118fb25a21cda713995450a9be40798", "applied": False}:
            raise RuntimeError("Combined catalog or rollback mode mismatch")
    elif report["fingerprint"] != "d2e17d02f546dc4bf5e2540274633dd1b05a157edd7f02b8ed4a8f623278b3bd" or report["applied"]:
        raise RuntimeError("Pinned fingerprint or mode mismatch")
    if sys.argv[1:] == ["--decision"]:
        decision = report["decisionSchema"]
        if decision != {"fingerprint": "85af9336c4049dc61070ab63ed1a731e35dc4f61daf723c581cdfd8dc6c22499", "constraints": 22, "indexes": 11, "applied": False}:
            raise RuntimeError("Decision catalog or rollback mode mismatch")
    if sys.argv[1:] in (["--core"], ["--release"]):
        decision = report["decisionSchema"]
        if decision != {"fingerprint": "85af9336c4049dc61070ab63ed1a731e35dc4f61daf723c581cdfd8dc6c22499", "constraints": 22, "indexes": 11, "applied": False,
                        "coreSchema": {"fingerprint": "74bf7259e20f0f84330a03567b1fd181d8c645203f71f8606ffb3b2436a624ad", "constraints": 23, "indexes": 12}}:
            raise RuntimeError("Core decision catalog or rollback mode mismatch")
    after = inventory.run_inventory(direct, "after-check")
    if not all(before[key] == after[key] for key in keys):
        raise RuntimeError("Rollback changed catalog or identity")
    print("PASS native worklog DDL rollback; source/runtime and previous catalog/identity intact.")
    print(json.dumps(report))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (RuntimeError, ValueError, KeyError, OSError, StopIteration, subprocess.TimeoutExpired):
        print("Native worklog schema check failed safely; private diagnostics suppressed.")
        raise SystemExit(1)
