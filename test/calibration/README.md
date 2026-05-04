# Calibration Suite

Gold-standard test cases for measuring verdict accuracy of the toiletpaper simulation pipeline.

## Approach

Two sets of synthetic claims with known ground truth:

- **known_good.json** — claims that are mathematically/empirically true and should receive a "reproduced" verdict
- **known_bad.json** — claims that are mathematically/empirically false and should receive a "contradicted" verdict

## Running

```bash
npx tsx test/calibration/run-calibration.ts
```

## Metrics

The calibration script reports:

- **Overall accuracy** — fraction of correct verdicts
- **False contradiction rate** — true claims wrongly marked "contradicted"
- **False reproduction rate** — false claims wrongly marked "reproduced"
- **Per-test-type breakdown** — accuracy by claim category (algebraic, scaling_law, etc.)

## Adding test cases

Add entries to `known_good.json` or `known_bad.json`. Each entry needs:

```json
{
  "id": "cal_NNN",
  "claim": "Human-readable claim text",
  "expected_verdict": "reproduced" or "contradicted",
  "test_type": "algebraic" | "scaling_law" | "statistical" | "numerical_prediction",
  "test_fn": "name of the test function in run-calibration.ts"
}
```

Then implement the corresponding `test_fn` in `run-calibration.ts`.
