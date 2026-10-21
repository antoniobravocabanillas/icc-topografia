import assert from "node:assert/strict";
import {
  isSyntheticPublicCvRecordId,
  publicCvEvidenceHref,
  requestedPublicCvRecordId,
} from "../lib/terraqo/public-cv-permalink";

assert.equal(
  requestedPublicCvRecordId({ search: "?registro=cmlegacy123", hash: "#ignored" }),
  "cmlegacy123",
);
assert.equal(
  requestedPublicCvRecordId({ search: "", hash: "#cmlegacy123" }),
  "cmlegacy123",
);
assert.equal(
  requestedPublicCvRecordId({
    pathname: "/cv/ana.pe/evidencias/cmworklog123",
    search: "",
    hash: "",
  }),
  "cmworklog123",
);
assert.equal(
  requestedPublicCvRecordId({ search: "", hash: "#%3Cscript%3E" }),
  null,
);
assert.equal(isSyntheticPublicCvRecordId("project-cm123"), true);
assert.equal(isSyntheticPublicCvRecordId("cm123"), false);
assert.equal(
  publicCvEvidenceHref("ana.pe", "cm123"),
  "/cv/ana.pe/evidencias/cm123",
);
assert.equal(
  publicCvEvidenceHref("ana.pe", "project-cm123"),
  "/cv/ana.pe/evidencias?registro=project-cm123",
);

console.log("Public CV permalink compatibility: OK");
