"""Run the exact allowed HTTPS fixture test without exposing provider secrets."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent


def main():
    if sys.argv[1:]:
        raise RuntimeError("No alternate endpoint or source accepted")
    spec = importlib.util.spec_from_file_location("bootstrap_check", ROOT / "scripts/check-native-worklog-bootstrap.py")
    checker = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(checker)
    direct, _, _, _ = checker.load_configuration()
    cli = Path(os.environ["APPDATA"]) / "npm/node_modules/netlify-cli/bin/run.js"
    config = subprocess.run([shutil.which("node"), str(cli), "env:get", "AUTH_SECRET", "--context", "production", "--scope", "functions", "--json"],
                            cwd=ROOT, capture_output=True, text=True, encoding="utf-8", timeout=90)
    if config.returncode:
        raise RuntimeError("Runtime signing configuration unavailable")
    environment = dict(os.environ, DATABASE_URL=direct, AUTH_SECRET=json.loads(config.stdout)["AUTH_SECRET"],
                       NODE_ENV="production", TERRAQO_MUTATING_TESTS="icc-topografia:20616116313",
                       TEST_PORTAL_URL="https://api.terraqoglobal.com")
    result = subprocess.run([shutil.which("node"), "--conditions=react-server", "--import", "tsx",
                             "scripts/test-deployed-native-worklog.ts"], cwd=ROOT, env=environment,
                            capture_output=True, text=True, encoding="utf-8", timeout=300)
    allowed = {"outcome", "stage", "category", "deployed_https", "concurrent_requests", "own_receipts",
               "own_audits", "accounting_credits", "cross_owner_isolation", "legacy_rejected",
               "revocation_checked", "network_cut_proved", "own_fixtures_absent", "http_statuses", "cache_controls", "nosniff"}
    for line in (result.stdout + "\n" + result.stderr).splitlines():
        try:
            report = json.loads(line)
        except ValueError:
            continue
        if isinstance(report, dict) and set(report) <= allowed:
            print(json.dumps(report))
    if result.returncode:
        raise RuntimeError("Own HTTPS verification failed")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, ValueError, KeyError, TypeError, OSError, subprocess.TimeoutExpired):
        print(json.dumps({"outcome": "failed", "private_diagnostics_suppressed": True}))
        raise SystemExit(1)
