#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function evaluateVerificationHistory(history, policy) {
  if (!Array.isArray(history) || history.length === 0) {
    return { status: "REPAIR", reason: "no_verification_cycles", consecutive_passes: 0 };
  }
  if (history.length > policy.max_cycles) {
    return { status: "REJECT", reason: "cycle_budget_exceeded", consecutive_passes: 0 };
  }

  let fingerprint = null;
  let consecutivePasses = 0;
  const repairCounts = new Map();
  for (const [index, cycle] of history.entries()) {
    if (!String(cycle?.fingerprint ?? "").match(/^[a-f0-9]{64}$/)) {
      return { status: "REJECT", reason: `invalid_fingerprint_at_cycle_${index + 1}`, consecutive_passes: 0 };
    }
    const gatesPassed = policy.required_gates.every((gate) => cycle[gate] === true);
    const harnessPassed = Number(cycle.harness_score) === 10;
    const passed = gatesPassed && harnessPassed;

    if (cycle.fingerprint !== fingerprint) {
      fingerprint = cycle.fingerprint;
      consecutivePasses = 0;
    }
    if (passed) {
      consecutivePasses += 1;
    } else {
      consecutivePasses = 0;
      repairCounts.set(fingerprint, (repairCounts.get(fingerprint) ?? 0) + 1);
      if (repairCounts.get(fingerprint) > policy.max_repair_attempts_per_fingerprint) {
        return { status: "REJECT", reason: "repair_budget_exceeded", fingerprint, consecutive_passes: consecutivePasses };
      }
    }
  }

  const latest = history.at(-1);
  const reviews = latest.independent_reviews ?? {};
  const reviewProofPassed = Number(reviews.spec) >= policy.required_independent_reviews.spec
    && Number(reviews.code) >= policy.required_independent_reviews.code;
  const releaseReady = consecutivePasses >= policy.required_same_fingerprint_passes && reviewProofPassed;

  return {
    status: releaseReady ? "VERIFIED" : "REPAIR",
    reason: releaseReady ? "all_proofs_passed" : "proof_streak_or_review_incomplete",
    fingerprint,
    consecutive_passes: consecutivePasses,
    review_proof_passed: reviewProofPassed,
    automatic_actions: {
      human_checkpoint: false,
      commit_push_pr_update: latest.tests_passed === true && latest.private_boundary_passed === true,
      merge: releaseReady,
      direct_main_write: false
    }
  };
}

export function main(argv = process.argv.slice(2)) {
  const inputIndex = argv.indexOf("--input");
  if (inputIndex < 0 || !argv[inputIndex + 1]) {
    throw new Error("Usage: verification-loop.mjs --input <history.json>");
  }
  const policy = readJson(path.join(HERE, "verification-policy.json"));
  const input = readJson(path.resolve(argv[inputIndex + 1]));
  const result = evaluateVerificationHistory(input.cycles, policy);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.status === "REJECT" ? 2 : result.status === "REPAIR" ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
