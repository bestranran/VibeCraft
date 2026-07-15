import assert from "node:assert/strict";
import test from "node:test";
import { MVP_EVALUATION_CASES, runMvpEvaluation } from "../lib/mvp-evaluation";

test("the fixed MVP prompt set covers all five target styles", () => {
  assert.deepEqual(MVP_EVALUATION_CASES.map((item) => item.style), ["medieval", "japanese", "desert", "modern", "cyberpunk"]);
  assert.equal(new Set(MVP_EVALUATION_CASES.map((item) => item.prompt)).size, 5);
});

test("all fixed fixtures pass automated release gates", async () => {
  const report = await runMvpEvaluation({ preferMcschematic: false });
  assert.equal(report.automatedReady, true, JSON.stringify(report.cases.filter((item) => !item.passed), null, 2));
  assert.equal(report.metrics.compilationSuccessRate, 1);
  assert.equal(report.metrics.structuralSuccessRate, 1);
  assert.equal(report.metrics.determinismRate, 1);
  assert.equal(report.metrics.styleAdherenceRate, 1);
  assert.equal(report.metrics.schematicSuccessRate, 1);
  assert.ok(report.metrics.distinctSilhouettes >= 4);
  assert.equal(report.metrics.editHistoryCorrect, true);
  assert.equal(report.releaseReady, false);
});

test("the installed mcschematic engine passes every schematic evaluation", async () => {
  const report = await runMvpEvaluation({ preferMcschematic: true });
  assert.equal(report.schematicEngine, "mcschematic");
  assert.equal(report.metrics.schematicSuccessRate, 1);
  assert.equal(report.automatedReady, true, JSON.stringify(report.cases.filter((item) => !item.passed), null, 2));
});

test("external WorldEdit verification is the final explicit release gate", async () => {
  const report = await runMvpEvaluation({ preferMcschematic: false, externalWorldEditVerified: true });
  assert.equal(report.automatedReady, true);
  assert.equal(report.releaseReady, true);
});
