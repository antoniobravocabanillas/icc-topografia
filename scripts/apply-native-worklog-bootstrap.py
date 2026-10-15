"""Explicit pinned additive bootstrap, with direct/runtime pre/post verification."""
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("bootstrap_check", ROOT / "scripts/check-native-worklog-bootstrap.py")
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)


class ApplicationUncertain(RuntimeError):
    pass


def apply_once(preflight, write, expected):
    before = preflight()
    if before["baseline"] != expected:
        raise RuntimeError("Baseline changed before application")
    if before["initial_state"] == "exact":
        return {"outcome": "existing", "applied": True, "post_commit_verified": True,
                "fingerprint": checker.PIN, "automatic_retry": False}
    if before["initial_state"] != "absent":
        raise RuntimeError("Unsupported initial state")
    result = None
    try:
        result = write()
        if result != {"outcome": "created", "baseline": expected, "fingerprint": checker.PIN,
                      "constraints": 36, "indexes": 16}:
            raise ApplicationUncertain("Invalid application acknowledgement")
    except Exception as error:
        # Read the actual state even after a lost response, without repeating DDL.
        try:
            preflight()
        except Exception:
            pass
        raise ApplicationUncertain("Application response uncertain; inspect without automatic retry") from error
    try:
        after = preflight()
        if after["baseline"] != expected or after["initial_state"] != "exact":
            raise ApplicationUncertain("Post commit verification mismatch")
    except Exception as error:
        raise ApplicationUncertain("Post commit verification uncertain") from error
    return {"outcome": result["outcome"], "applied": True, "post_commit_verified": True,
            "fingerprint": checker.PIN, "constraints": 36, "indexes": 16, "automatic_retry": False}


def main():
    if (len(sys.argv) != 5 or sys.argv[1:3] != ["--apply", "--expected-baseline"] or
        not re.fullmatch("[a-f0-9]{64}", sys.argv[3]) or sys.argv[4] != "--maintenance"):
        raise RuntimeError("Explicit apply, expected baseline and maintenance are required")
    expected = sys.argv[3]
    direct, runtime, inventory, run = checker.load_configuration()

    def write():
        environment = dict(os.environ, DATABASE_URL=direct, NODE_ENV="production",
                           TERRAQO_NATIVE_BOOTSTRAP_BASELINE=expected,
                           TERRAQO_NATIVE_BOOTSTRAP_MAINTENANCE="native-worklog:maintenance")
        result = subprocess.run([shutil.which("node"), "--conditions=react-server", "--import", "tsx",
                                 "scripts/apply-native-worklog-bootstrap.ts", "--apply"], cwd=ROOT, env=environment,
                                capture_output=True, text=True, encoding="utf-8", timeout=120)
        if result.returncode:
            raise ApplicationUncertain("Private child diagnostics suppressed")
        return json.loads(result.stdout.strip())

    print(json.dumps(apply_once(lambda: checker.check_connections(direct, runtime, inventory, run), write, expected)))


if __name__ == "__main__":
    try:
        main()
    except ApplicationUncertain:
        print(json.dumps({"outcome": "uncertain", "applied": "unknown", "automatic_retry": False,
                          "private_diagnostics_suppressed": True}))
        raise SystemExit(1)
    except (RuntimeError, ValueError, KeyError, TypeError, OSError, StopIteration, subprocess.TimeoutExpired):
        print(json.dumps({"outcome": "rejected-before-write", "applied": False,
                          "private_diagnostics_suppressed": True}))
        raise SystemExit(1)
