"""Application coordination tests with controlled ports; no SQL or secrets."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("bootstrap_apply", Path(__file__).with_name("apply-native-worklog-bootstrap.py"))
apply = importlib.util.module_from_spec(spec)
spec.loader.exec_module(apply)


class ApplicationTest(unittest.TestCase):
    def setUp(self):
        self.reads = 0
        self.writes = 0
        self.baseline = "a" * 64
        self.state = "absent"
        self.fault = None

    def read(self):
        self.reads += 1
        return {"baseline": self.baseline, "initial_state": self.state}

    def write(self):
        self.writes += 1
        self.state = "exact"
        if self.fault:
            raise self.fault
        return {"outcome": "created", "baseline": self.baseline, "fingerprint": apply.checker.PIN,
                "constraints": 36, "indexes": 16}

    def test_application_requires_post_commit_verification(self):
        result = apply.apply_once(self.read, self.write, self.baseline)
        self.assertTrue(result["post_commit_verified"])
        self.assertEqual((self.reads, self.writes), (2, 1))

    def test_existing_schema_does_not_repeat_ddl(self):
        self.state = "exact"
        self.assertEqual(apply.apply_once(self.read, self.write, self.baseline)["outcome"], "existing")
        self.assertEqual(self.writes, 0)

    def test_changed_baseline_rejects_before_write(self):
        with self.assertRaises(RuntimeError):
            apply.apply_once(self.read, self.write, "b" * 64)
        self.assertEqual(self.writes, 0)

    def test_partial_schema_rejects_before_write(self):
        self.state = "partial"
        with self.assertRaises(RuntimeError):
            apply.apply_once(self.read, self.write, self.baseline)
        self.assertEqual(self.writes, 0)

    def test_lost_commit_response_is_verified_without_retry_or_success_claim(self):
        self.fault = TimeoutError("private child timeout")
        with self.assertRaises(apply.ApplicationUncertain):
            apply.apply_once(self.read, self.write, self.baseline)
        self.assertEqual((self.reads, self.writes, self.state), (2, 1, "exact"))

    def test_invalid_ack_is_verified_without_retry(self):
        def invalid():
            self.write()
            return {"outcome": "created"}
        with self.assertRaises(apply.ApplicationUncertain):
            apply.apply_once(self.read, invalid, self.baseline)
        self.assertEqual((self.reads, self.writes), (2, 1))

    def test_post_commit_drift_never_reports_success(self):
        def drift():
            result = self.write()
            self.baseline = "b" * 64
            return result
        with self.assertRaises(apply.ApplicationUncertain):
            apply.apply_once(self.read, drift, self.baseline)
        self.assertEqual((self.reads, self.writes), (2, 1))

    def test_missing_explicit_flags_never_loads_configuration(self):
        for args in ([], ["--apply"], ["--apply", "--expected-baseline", self.baseline]):
            with self.subTest(args=args), patch.object(apply.sys, "argv", ["apply", *args]), \
                    patch.object(apply.checker, "load_configuration") as load:
                with self.assertRaises(RuntimeError):
                    apply.main()
                load.assert_not_called()


if __name__ == "__main__":
    unittest.main()
