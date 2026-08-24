import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import { evaluateVerificationHistory } from "../masterbook/verification-loop.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const policy = JSON.parse(fs.readFileSync(path.join(ROOT, "masterbook/verification-policy.json"), "utf8"));
const fingerprint = "a".repeat(64);

function cycle(overrides = {}) {
  return {
    fingerprint,
    harness_score: 10,
    tests_passed: true,
    private_boundary_passed: true,
    copyright_gate_passed: true,
    source_provenance_passed: true,
    hard_skip_passed: true,
    independent_reviews: { spec: 1, code: 1 },
    ...overrides
  };
}

test("requires ten unchanged-fingerprint passes and separate spec/code reviews", () => {
  const nine = evaluateVerificationHistory(Array.from({ length: 9 }, () => cycle()), policy);
  assert.equal(nine.status, "REPAIR");
  assert.equal(nine.automatic_actions.merge, false);
  const ten = evaluateVerificationHistory(Array.from({ length: 10 }, () => cycle()), policy);
  assert.equal(ten.status, "VERIFIED");
  assert.equal(ten.automatic_actions.merge, true);
});

test("a candidate change resets the pass streak", () => {
  const changed = "b".repeat(64);
  const result = evaluateVerificationHistory([
    ...Array.from({ length: 9 }, () => cycle()),
    cycle({ fingerprint: changed })
  ], policy);
  assert.equal(result.status, "REPAIR");
  assert.equal(result.consecutive_passes, 1);
  assert.equal(result.fingerprint, changed);
});

test("fails closed when a fingerprint repeatedly fails required gates", () => {
  const result = evaluateVerificationHistory([
    cycle({ tests_passed: false }),
    cycle({ source_provenance_passed: false }),
    cycle({ hard_skip_passed: false })
  ], policy);
  assert.equal(result.status, "REJECT");
  assert.equal(result.reason, "repair_budget_exceeded");
});

test("keeps automatic PR delivery separate from release merge", () => {
  const result = evaluateVerificationHistory([cycle()], policy);
  assert.equal(result.automatic_actions.human_checkpoint, false);
  assert.equal(result.automatic_actions.commit_push_pr_update, true);
  assert.equal(result.automatic_actions.merge, false);
  assert.equal(result.automatic_actions.direct_main_write, false);
});
