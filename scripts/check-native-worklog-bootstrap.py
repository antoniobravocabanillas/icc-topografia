"""Read-only preflight by default; explicit --check rehearses DDL in rollback only."""
import importlib.util
import json
import os
import re
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
PHASE = "startup"
PIN = "25a238b070233aee9d5014c03790e73edb8c4daa6d2c4f357c62b37eb6d38880"
INVENTORY_KEYS = ("schemaFingerprint", "columns", "identity", "extensions", "objects")
COMPONENT_KEYS = ("columns", "constraints", "indexes", "extensions", "identity", "ledgers",
                  "databaseIdentity", "principalIdentity")


def verify_snapshot(value):
    """Fail closed on malformed child output, including an incomplete exact catalog."""
    if not isinstance(value, dict) or set(value) not in ({"baseline", "catalog"}, {"baseline", "catalog", "components"}):
        raise RuntimeError("Invalid snapshot")
    baseline = value["baseline"]
    if not isinstance(baseline, str) or len(baseline) != 64 or any(c not in "0123456789abcdef" for c in baseline):
        raise RuntimeError("Invalid baseline")
    if value["catalog"] not in ({"state": "absent"}, {
        "state": "exact", "fingerprint": PIN, "constraints": 36, "indexes": 16,
    }):
        raise RuntimeError("Invalid catalog")
    if "components" in value:
        parts = value["components"]
        if (not isinstance(parts, dict) or set(parts) != set(COMPONENT_KEYS) or
            any(not isinstance(item, str) or not re.fullmatch("[a-f0-9]{64}", item) for item in parts.values())):
            raise RuntimeError("Invalid baseline evidence")
    return value


def matching_sources(direct, runtime):
    if direct == runtime:
        return True
    # Accelerate may use a different DB principal. Preserve each complete baseline
    # independently; never ignore a database, DDL, extension or ledger difference.
    a, b = direct.get("components"), runtime.get("components")
    return (a is not None and b is not None and direct["catalog"] == runtime["catalog"] and
            a["principalIdentity"] != b["principalIdentity"] and
            all(a[key] == b[key] for key in COMPONENT_KEYS if key not in ("identity", "principalIdentity")))


def check_connections(direct, runtime, inventory, run, *, rehearse=False):
    """Ports allow orchestration tests without credentials, SQL or provider access."""
    global PHASE
    PHASE = "source-runtime-inventory"
    before = inventory(direct, "direct")
    live = inventory(runtime, "runtime")
    if any(before[key] != live[key] for key in INVENTORY_KEYS):
        raise RuntimeError("Source runtime mismatch")
    PHASE = "direct-snapshot"
    first = verify_snapshot(run(direct, "--snapshot"))
    PHASE = "runtime-snapshot"
    live_snapshot = verify_snapshot(run(runtime, "--snapshot"))
    PHASE = "source-runtime-baseline-comparison"
    if not matching_sources(first, live_snapshot):
        print(json.dumps({"baseline_matches": first["baseline"] == live_snapshot["baseline"],
                          "catalog_matches": first["catalog"] == live_snapshot["catalog"],
                          "different_components": [key for key in COMPONENT_KEYS if
                              first.get("components", {}).get(key) != live_snapshot.get("components", {}).get(key)]}))
        raise RuntimeError("Baseline or native catalog mismatch")

    try:
        if rehearse:
            PHASE = "rollback-rehearsal"
            report = run(direct, "--check", first["baseline"])
            expected = {"mode": "checked-in-rollback", "fingerprint": PIN,
                        "baseline": first["baseline"], "initialState": first["catalog"]["state"],
                        "constraints": 36, "indexes": 16, "applied": False}
            if report != expected or report.get("applied") is not False:
                raise RuntimeError("Invalid rollback result")
    finally:
        # A timeout or lost child response is not proof of rollback. Re-read BOTH
        # connections even after failure; never issue an automatic second rehearsal.
        failed_phase = PHASE
        PHASE = "post-check-verification"
        verification_failed = False
        for url, expected_snapshot in ((direct, first), (runtime, live_snapshot)):
            try:
                if verify_snapshot(run(url, "--snapshot")) != expected_snapshot:
                    raise RuntimeError("Post check baseline changed")
                after = inventory(url, "after-check")
                if any(before[key] != after[key] for key in INVENTORY_KEYS):
                    raise RuntimeError("Post check inventory changed")
            except (RuntimeError, ValueError, KeyError, TypeError, OSError, subprocess.TimeoutExpired):
                verification_failed = True
        if verification_failed:
            raise RuntimeError("Post check verification failed; do not retry automatically")
        PHASE = failed_phase
    return {"mode": "checked-in-rollback" if rehearse else "read-only-preflight",
            "source_runtime_equal": True, "prior_catalog_and_ledgers_preserved": True,
            "initial_state": first["catalog"]["state"], "baseline": first["baseline"],
            "connection_principals_equal": first.get("components", {}).get("principalIdentity") == live_snapshot.get("components", {}).get("principalIdentity"),
            "expected_fingerprint": PIN, "applied": False}


def load_configuration():
    global PHASE
    PHASE = "configuration"
    spec = importlib.util.spec_from_file_location("native_inventory", ROOT / "scripts/inventory-database-migration.py")
    inventory = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(inventory)
    cli = Path(os.environ["APPDATA"]) / "npm/node_modules/netlify-cli/bin/run.js"
    configured = subprocess.run([shutil.which("node"), str(cli), "env:get", "DATABASE_URL", "--context", "production", "--scope", "functions", "--json"],
                                cwd=ROOT, capture_output=True, text=True, encoding="utf-8", timeout=120)
    if configured.returncode:
        raise RuntimeError("Configuration unavailable")
    runtime = json.loads(configured.stdout)["DATABASE_URL"]
    direct = next(line.split("=", 1)[1].strip().strip('"').strip("'") for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines() if line.startswith("DATABASE_URL="))
    if not direct.startswith(("postgres://", "postgresql://")):
        raise RuntimeError("Direct source unavailable")
    def run(url, mode, baseline=""):
        environment = dict(os.environ, DATABASE_URL=url, NODE_ENV="production",
                           TERRAQO_MUTATING_TESTS="icc-topografia:20616116313",
                           TERRAQO_NATIVE_BOOTSTRAP_BASELINE=baseline)
        result = subprocess.run([shutil.which("node"), "--conditions=react-server", "--import", "tsx",
                                 "scripts/check-native-worklog-bootstrap.ts", mode], cwd=ROOT, env=environment,
                                capture_output=True, text=True, encoding="utf-8", timeout=120)
        if result.returncode:
            for line in result.stderr.splitlines():
                try:
                    diagnostic = json.loads(line)
                except ValueError:
                    continue
                if (isinstance(diagnostic, dict) and diagnostic.get("outcome") == "failed"
                    and diagnostic.get("phase") in ("startup", "snapshot-read-only", "snapshot-baseline",
                                                     "snapshot-catalog", "workspace-identity", "rollback-rehearsal")
                    and re.fullmatch(r"(?:P[0-9]{4}|ERR_ASSERTION|unknown)", str(diagnostic.get("category", "")))):
                    print(json.dumps({"child_phase": diagnostic["phase"], "category": diagnostic["category"]}))
            raise RuntimeError("Bootstrap check failed; private diagnostics suppressed")
        return json.loads(result.stdout.strip())

    return direct, runtime, inventory.run_inventory, run


def main():
    arguments = sys.argv[1:]
    if arguments not in ([], ["--preflight"], ["--check"]):
        raise RuntimeError("Only --preflight or --check supported; no apply mode")
    direct, runtime, inventory, run = load_configuration()
    print(json.dumps(check_connections(direct, runtime, inventory, run,
                                      rehearse=arguments == ["--check"])))


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, ValueError, KeyError, TypeError, OSError, StopIteration, subprocess.TimeoutExpired):
        print(json.dumps({"outcome": "failed", "phase": PHASE, "private_diagnostics_suppressed": True}))
        raise SystemExit(1)
