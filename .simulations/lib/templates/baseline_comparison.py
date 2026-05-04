"""Template: Baseline Comparison

Test claims of the form "outperforms Y by Z%" or "X is better than Y on metric M"
by implementing both the baseline and the proposed method, then comparing.

Usage:
    from templates.baseline_comparison import test_baseline_comparison

    result = test_baseline_comparison(
        claim_id="abc-123",
        claim_text="Our method outperforms EWC by 12% on Split-MNIST",
        baseline_fn=lambda: run_ewc(),        # returns metric
        proposed_fn=lambda: run_ours(),        # returns metric
        claimed_improvement=0.12,
        metric_name="accuracy",
        higher_is_better=True,
        evidence_mode="proxy_simulation",
        limitations=["3 epochs", "2 seeds"],
    )
"""

from typing import Callable, Optional


def test_baseline_comparison(
    claim_id: str,
    claim_text: str,
    baseline_fn: Callable[[], float],
    proposed_fn: Callable[[], float],
    claimed_improvement: float,
    metric_name: str = "accuracy",
    higher_is_better: bool = True,
    improvement_type: str = "absolute",
    tolerance: float = 0.05,
    claim_index: int = 0,
    evidence_mode: str = "proxy_simulation",
    limitations: Optional[list[str]] = None,
    simulation_file: Optional[str] = None,
    n_runs: int = 1,
) -> dict:
    """Test a claimed improvement over a baseline.

    Args:
        claim_id: UUID of the claim in the database.
        claim_text: Human-readable claim text.
        baseline_fn: Callable returning the baseline metric value.
        proposed_fn: Callable returning the proposed method's metric value.
        claimed_improvement: The claimed improvement (absolute or relative).
        metric_name: Name of the metric being compared.
        higher_is_better: True if higher metric values are better.
        improvement_type: "absolute" (raw difference) or "relative" (percentage).
        tolerance: Relative tolerance for matching the claimed improvement.
        claim_index: Positional index of the claim.
        evidence_mode: One of the toiletpaper evidence modes.
        limitations: List of limitation strings.
        simulation_file: Name of the simulation script file.
        n_runs: Number of runs to average over.

    Returns:
        dict matching the toiletpaper results.json schema.
    """
    import numpy as np

    baseline_vals = [float(baseline_fn()) for _ in range(n_runs)]
    proposed_vals = [float(proposed_fn()) for _ in range(n_runs)]

    baseline_mean = float(np.mean(baseline_vals))
    proposed_mean = float(np.mean(proposed_vals))

    if improvement_type == "relative":
        if abs(baseline_mean) < 1e-15:
            measured_improvement = float("inf") if proposed_mean > 0 else 0.0
        else:
            measured_improvement = (proposed_mean - baseline_mean) / abs(baseline_mean)
    else:
        measured_improvement = proposed_mean - baseline_mean

    if not higher_is_better:
        measured_improvement = -measured_improvement

    # Compare measured improvement to claimed improvement
    if abs(claimed_improvement) < 1e-15:
        rel_error = abs(measured_improvement)
    else:
        rel_error = abs(measured_improvement - claimed_improvement) / abs(claimed_improvement)

    # Determine verdict
    direction_correct = measured_improvement > 0
    if direction_correct and rel_error <= tolerance:
        verdict = "reproduced"
    elif direction_correct and rel_error <= tolerance * 3:
        verdict = "fragile"
    elif not direction_correct:
        verdict = "contradicted"
    else:
        verdict = "contradicted"

    confidence = max(0.1, min(0.99, 1.0 - rel_error)) if direction_correct else 0.1

    reason = (
        f"Baseline {metric_name}={baseline_mean:.4f}, "
        f"proposed={proposed_mean:.4f}, "
        f"measured improvement={measured_improvement:.4f} "
        f"(claimed {claimed_improvement:.4f}), "
        f"relative error on improvement={rel_error:.2%}"
    )

    result = {
        "claim_id": claim_id,
        "claim_index": claim_index,
        "claim_text": claim_text,
        "test_type": "comparative",
        "verdict": verdict,
        "evidence_mode": evidence_mode,
        "limitations": limitations or [],
        "confidence": round(confidence, 3),
        "reason": reason,
        "measured_value": measured_improvement,
        "expected_value": claimed_improvement,
        "baseline_result": f"{metric_name}={baseline_mean:.4f}",
        "proposed_result": f"{metric_name}={proposed_mean:.4f}",
    }
    if simulation_file:
        result["simulation_file"] = simulation_file

    return result
