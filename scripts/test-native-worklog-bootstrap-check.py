"""Orchestration regressions only: no DB, credentials, DDL or provider calls."""
import copy
import importlib.util
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    "bootstrap_check", Path(__file__).with_name("check-native-worklog-bootstrap.py"))
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)


class BootstrapCheckTest(unittest.TestCase):
    def setUp(self):
        self.calls = []
        self.snapshot = {"baseline": "a" * 64, "catalog": {"state": "absent"}}
        self.inventory = {key: {"test": key} for key in checker.INVENTORY_KEYS}
        self.report = {"mode": "checked-in-rollback", "fingerprint": checker.PIN,
                       "baseline": "a" * 64, "initialState": "absent",
                       "constraints": 36, "indexes": 16, "applied": False}

    def read_inventory(self, url, label):
        self.calls.append((url, "inventory", label))
        return copy.deepcopy(self.inventory)

    def run_child(self, url, mode, baseline=""):
        self.calls.append((url, mode, baseline))
        return copy.deepcopy(self.report if mode == "--check" else self.snapshot)

    def check(self, **kwargs):
        return checker.check_connections("direct", "runtime", self.read_inventory,
                                         kwargs.pop("run", self.run_child), **kwargs)

    def test_default_is_read_only(self):
        self.assertEqual(self.check()["mode"], "read-only-preflight")
        self.assertFalse(any(call[1] == "--check" for call in self.calls))

    def test_explicit_rehearsal_checks_once_with_pinned_baseline(self):
        self.assertFalse(self.check(rehearse=True)["applied"])
        self.assertEqual([call for call in self.calls if call[1] == "--check"],
                         [("direct", "--check", "a" * 64)])

    def test_exact_catalog_can_be_checked_without_repair(self):
        self.snapshot["catalog"] = {"state": "exact", "fingerprint": checker.PIN,
                                    "constraints": 36, "indexes": 16}
        self.report["initialState"] = "exact"
        self.assertEqual(self.check(rehearse=True)["initial_state"], "exact")

    def test_source_runtime_mismatch_never_rehearses(self):
        def inventory(url, label):
            value = self.read_inventory(url, label)
            if url == "runtime":
                value["identity"] = "different"
            return value
        with self.assertRaises(RuntimeError):
            checker.check_connections("direct", "runtime", inventory, self.run_child, rehearse=True)
        self.assertFalse(any(call[1] == "--check" for call in self.calls))

    def test_snapshot_mismatch_never_rehearses(self):
        def run(url, mode, baseline=""):
            value = self.run_child(url, mode, baseline)
            if url == "runtime":
                value["baseline"] = "b" * 64
            return value
        with self.assertRaises(RuntimeError):
            self.check(run=run, rehearse=True)
        self.assertFalse(any(call[1] == "--check" for call in self.calls))

    def test_proxy_principal_difference_preserves_separate_baselines(self):
        self.snapshot["components"] = {key: "a" * 64 for key in checker.COMPONENT_KEYS}
        def run(url, mode, baseline=""):
            value = self.run_child(url, mode, baseline)
            if url == "runtime" and mode == "--snapshot":
                value["baseline"] = "b" * 64
                value["components"]["principalIdentity"] = "b" * 64
                value["components"]["identity"] = "b" * 64
            return value
        result = self.check(run=run, rehearse=True)
        self.assertFalse(result["connection_principals_equal"])
        self.assertTrue(result["prior_catalog_and_ledgers_preserved"])

    def test_proxy_principal_difference_never_masks_other_drift(self):
        a = {"baseline": "a" * 64, "catalog": {"state": "absent"},
             "components": {key: "a" * 64 for key in checker.COMPONENT_KEYS}}
        for changed in ("databaseIdentity", "ledgers", "columns", "constraints", "indexes", "extensions"):
            with self.subTest(changed=changed):
                b = copy.deepcopy(a)
                b["baseline"] = "b" * 64
                for key in ("identity", "principalIdentity", changed):
                    b["components"][key] = "b" * 64
                self.assertFalse(checker.matching_sources(a, b))

    def test_component_evidence_is_strict(self):
        for parts in ({}, {key: "not-a-hash" for key in checker.COMPONENT_KEYS}):
            with self.subTest(parts=parts), self.assertRaises(RuntimeError):
                checker.verify_snapshot({**self.snapshot, "components": parts})

    def test_invalid_snapshots_rejected_before_ddl(self):
        for value in (None, {}, {"baseline": "secret", "catalog": {"state": "absent"}},
                      {"baseline": "a" * 64, "catalog": {"state": "exact"}},
                      {"baseline": "a" * 64, "catalog": {"state": "partial"}}):
            with self.subTest(value=value), self.assertRaises(RuntimeError):
                checker.verify_snapshot(value)

    def test_invalid_receipt_still_verifies_both_connections(self):
        for field, bad_value in (("applied", True), ("applied", 0), ("fingerprint", "b" * 64),
                                 ("baseline", "b" * 64), ("constraints", 35),
                                 ("indexes", 15), ("initialState", "exact")):
            with self.subTest(field=field):
                self.setUp()
                self.report[field] = bad_value
                with self.assertRaises(RuntimeError):
                    self.check(rehearse=True)
                self.assertEqual([call[0] for call in self.calls if call[2] == "after-check"],
                                 ["direct", "runtime"])

    def test_timeout_still_verifies_both_connections_without_retry(self):
        def run(url, mode, baseline=""):
            result = self.run_child(url, mode, baseline)
            if mode == "--check":
                raise subprocess.TimeoutExpired("private-child", 120)
            return result
        with self.assertRaises(subprocess.TimeoutExpired):
            self.check(run=run, rehearse=True)
        self.assertEqual([call[0] for call in self.calls if call[2] == "after-check"],
                         ["direct", "runtime"])
        self.assertEqual(sum(call[1] == "--check" for call in self.calls), 1)

    def test_post_check_failure_attempts_other_connection_and_fails_closed(self):
        def run(url, mode, baseline=""):
            result = self.run_child(url, mode, baseline)
            if len(self.calls) > 5 and url == "direct":
                raise RuntimeError("private-driver-error")
            return result
        with self.assertRaisesRegex(RuntimeError, "Post check verification failed"):
            self.check(run=run, rehearse=True)
        self.assertIn(("runtime", "inventory", "after-check"), self.calls)
        self.assertEqual(checker.PHASE, "post-check-verification")

    def test_post_check_ledger_drift_fails_closed(self):
        def run(url, mode, baseline=""):
            result = self.run_child(url, mode, baseline)
            if mode == "--check":
                self.snapshot["baseline"] = "b" * 64
            return result
        with self.assertRaisesRegex(RuntimeError, "Post check verification failed"):
            self.check(run=run, rehearse=True)

    def test_unsupported_apply_argument_never_loads_configuration(self):
        with patch.object(checker.sys, "argv", ["checker", "--apply"]), \
                patch.object(checker.subprocess, "run") as child:
            with self.assertRaises(RuntimeError):
                checker.main()
            child.assert_not_called()


if __name__ == "__main__":
    unittest.main()
