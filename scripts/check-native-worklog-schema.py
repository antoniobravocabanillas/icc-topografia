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
    if sys.argv[1:] not in ([], ["--core"], ["--first-decision"], ["--first-creation-reserved"], ["--first-creation-existing"], ["--first-creation-ineligible"], ["--first-settlement"], ["--worker-eligibility-five"], ["--worker-settlement-five"], ["--worker-deferred-five"], ["--worker-ack-five"], ["--reconciliation"], ["--owner-fence"], ["--decision"], ["--combined"], ["--complete"], ["--worker-eligibility"], ["--worker-phases"], ["--worker-preflight"], ["--worker-selection"], ["--worker-backlog"], ["--worker-settlement"], ["--worker-deferred"], ["--worker-ack"], ["--worker-legacy-first"], ["--legacy-validation-5"], ["--legacy-validation-20"], ["--validation-review-5"], ["--validation-preflight-5"], ["--validation-preflight-20"], ["--validation-phases-5"], ["--validation-phases-20"], ["--release"], ["--base-edges"], ["--first-account"], ["--phases"], ["--phase-edges"], ["--legacy-inventory"], ["--accounting-retry"], ["--accounting-authority"], ["--authority-schema"], ["--creation-authority"]):
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
    checked = subprocess.run(args, cwd=ROOT, env=environment, capture_output=True, text=True, encoding="utf-8", timeout=210 if sys.argv[1:] in (["--core"], ["--base-edges"]) else 120)
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
    if sys.argv[1:] in (["--first-decision"], ["--first-creation-reserved"], ["--first-creation-existing"], ["--first-creation-ineligible"], ["--first-settlement"], ["--worker-eligibility-five"], ["--worker-settlement-five"], ["--worker-deferred-five"], ["--worker-ack-five"]):
        if report["mode"] != f"{sys.argv[1][2:]}-rollback" or report["applied"] or report["firstSchema"]["constraints"] != 6 or report["firstSchema"]["indexes"] != 2:
            raise RuntimeError("First decision schema mismatch")
        if report["firstSchema"]["fingerprint"] != "ae4b4d571842674bf07bd1b6391aaa6c39e6f5d37b8d9bea088ae8a29271cd8f" or report["ledgerFingerprint"] != "63b2a899b04e053157f7212cd53bc2409118fb25a21cda713995450a9be40798":
            raise RuntimeError("First decision pin mismatch")
        if report["completeSchema"] != {"state": "exact", "fingerprint": "25a238b070233aee9d5014c03790e73edb8c4daa6d2c4f357c62b37eb6d38880", "constraints": 36, "indexes": 16}:
            raise RuntimeError("Complete first catalog mismatch")
    elif sys.argv[1:] == ["--complete"]:
        if report != {"mode": "complete-rollback", "combined": {"state": "exact", "fingerprint": "25a238b070233aee9d5014c03790e73edb8c4daa6d2c4f357c62b37eb6d38880", "constraints": 36, "indexes": 16}, "ledgerFingerprint": "63b2a899b04e053157f7212cd53bc2409118fb25a21cda713995450a9be40798", "applied": False}:
            raise RuntimeError("Complete catalog or rollback mode mismatch")
    elif sys.argv[1:] in (["--combined"], ["--worker-eligibility"], ["--worker-phases"], ["--worker-preflight"], ["--worker-selection"], ["--worker-backlog"], ["--worker-settlement"], ["--worker-deferred"], ["--worker-ack"], ["--worker-legacy-first"], ["--legacy-validation-5"], ["--legacy-validation-20"], ["--validation-review-5"], ["--validation-preflight-5"], ["--validation-preflight-20"], ["--validation-phases-5"], ["--validation-phases-20"]):
        if report != {"mode": f"{sys.argv[1][2:]}-rollback" if sys.argv[1:] in (["--legacy-validation-5"], ["--legacy-validation-20"], ["--validation-review-5"], ["--validation-preflight-5"], ["--validation-preflight-20"], ["--validation-phases-5"], ["--validation-phases-20"]) else f"{sys.argv[1][2:]}-rollback" if sys.argv[1:] in (["--worker-settlement"], ["--worker-deferred"], ["--worker-ack"]) else "worker-backlog-rollback" if sys.argv[1:] == ["--worker-backlog"] else "worker-selection-rollback" if sys.argv[1:] == ["--worker-selection"] else "worker-legacy-first-rollback" if sys.argv[1:] == ["--worker-legacy-first"] else "worker-preflight-rollback" if sys.argv[1:] == ["--worker-preflight"] else "worker-phases-rollback" if sys.argv[1:] == ["--worker-phases"] else "worker-eligibility-rollback" if sys.argv[1:] == ["--worker-eligibility"] else "combined-rollback", "combined": {"state": "exact", "fingerprint": "55bb6318b6ff7379a6dc12bf801e42e25fb49c26a6ae8760a2eccadf30ac6279", "constraints": 30, "indexes": 14}, "ledgerFingerprint": "63b2a899b04e053157f7212cd53bc2409118fb25a21cda713995450a9be40798", "applied": False}:
            raise RuntimeError("Combined catalog or rollback mode mismatch")
    elif report["fingerprint"] != "d2e17d02f546dc4bf5e2540274633dd1b05a157edd7f02b8ed4a8f623278b3bd" or report["applied"]:
        raise RuntimeError("Pinned fingerprint or mode mismatch")
    if sys.argv[1:] == ["--decision"]:
        decision = report["decisionSchema"]
        if decision != {"fingerprint": "85af9336c4049dc61070ab63ed1a731e35dc4f61daf723c581cdfd8dc6c22499", "constraints": 22, "indexes": 11, "applied": False}:
            raise RuntimeError("Decision catalog or rollback mode mismatch")
    if sys.argv[1:] in (["--core"], ["--release"], ["--base-edges"], ["--first-account"], ["--phases"], ["--phase-edges"], ["--legacy-inventory"], ["--accounting-retry"], ["--accounting-authority"], ["--authority-schema"], ["--creation-authority"]):
        decision = dict(report["decisionSchema"])
        if sys.argv[1:] in (["--authority-schema"], ["--creation-authority"], ["--core"]):
            authority = decision.pop("authoritySchema")
            if authority != {"fingerprint": "4f5a48e679e61fecac2d81855240cbc2895567e64571a91099a6566c89efe503", "constraints": 7, "indexes": 2, "applied": False}:
                raise RuntimeError("Authority catalog mismatch")
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
