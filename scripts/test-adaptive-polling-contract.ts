import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  ALERT_POLLING_POLICY,
  CONVERSATION_POLLING_POLICY,
  nextAdaptivePollingDelay,
} from "../lib/terraqo/adaptive-polling";

assert.equal(
  nextAdaptivePollingDelay(0, ALERT_POLLING_POLICY),
  4_000,
  "Alerts must retain the four-second active cadence.",
);
assert.equal(
  nextAdaptivePollingDelay(7, ALERT_POLLING_POLICY),
  4_000,
  "Alert polling must not back off before the configured idle threshold.",
);
assert.equal(
  nextAdaptivePollingDelay(8, ALERT_POLLING_POLICY),
  8_000,
  "Idle alert polling must back off without exceeding eight seconds.",
);
assert.equal(
  nextAdaptivePollingDelay(9, CONVERSATION_POLLING_POLICY),
  3_000,
  "Open conversations must retain the three-second active cadence.",
);
assert.equal(
  nextAdaptivePollingDelay(10, CONVERSATION_POLLING_POLICY),
  6_000,
  "Idle conversations must back off without exceeding six seconds.",
);

const hookSource = readFileSync(
  resolve(process.cwd(), "components/terraqo/use-adaptive-polling.ts"),
  "utf8",
);
assert.match(hookSource, /document\.visibilityState === "visible"/);
assert.match(hookSource, /window\.addEventListener\("online", wake\)/);
assert.match(hookSource, /window\.addEventListener\("offline", pause\)/);
assert.match(hookSource, /new AbortController\(\)/);
assert.match(hookSource, /window\.setTimeout/);
assert.doesNotMatch(
  hookSource,
  /setInterval/,
  "Adaptive polling must schedule from the previous completion, not overlap fixed intervals.",
);

for (const sourcePath of [
  "components/terraqo/portal-realtime-alerts.tsx",
  "components/admin/admin-notification-monitor.tsx",
  "components/terraqo/message-drawer.tsx",
  "components/terraqo/conversation-hub.tsx",
  "components/chat/chat-widget.tsx",
]) {
  const source = readFileSync(resolve(process.cwd(), sourcePath), "utf8");
  assert.match(
    source,
    /useAdaptivePolling/,
    `${sourcePath} must use the shared lifecycle-aware poller.`,
  );
  assert.doesNotMatch(
    source,
    /setInterval/,
    `${sourcePath} must not retain an independent fixed polling loop.`,
  );
}

console.log("Adaptive polling contract: OK");
