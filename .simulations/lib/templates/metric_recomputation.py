"""Template: Metric Recomputation

Test claims of the form "achieves X% accuracy / F1 / BLEU / etc."
by recomputing the metric from predictions and ground truth.

Usage:
    from templates.metric_recomputation import test_metric_claim

    result = test_metric_claim(
        claim_id="abc-123",
        claim_text="Our model achieves 94.2% accuracy on CIFAR-10",
        metric_name="accuracy",
        claimed_value=0.942,
        compute_fn=lambda: train_and_evaluate(),  # returns measured metric
        tolerance=0.05,
        evidence_mode="proxy_simulation",
        limitations=["3 epochs instead of 200", "subset of training data"],
    )
"""

import json
from typing import Callable, Optional


def test_metric_claim(
    claim_id: str,
    claim_text: str,
    metric_name: str,
    claimed_value: float,
    compute_fn: Callable[[], float],
    tolerance: float = 0.05,
    claim_index: int = 0,
    evidence_mode: str = "proxy_simulation",
    limitations: Optional[list[str]] = None,
    simulation_file: Optional[str] = None,
    n_runs: int = 1,
    seed_offset: int = 0,
) -> dict:
    """Test a claimed metric value by recomputing it.

    Args:
        claim_id: UUID of the claim in the database.
        claim_text: Human-readable claim text.
        metric_name: Name of the metric (accuracy, F1, BLEU, etc.).
        claimed_value: The value stated in the paper.
        compute_fn: Callable that returns the measured metric value.
                     If n_runs > 1, called repeatedly (ignore seed management
                     externally or use seed_offset + run_index).
        tolerance: Relative tolerance for "reproduced" verdict (default 5%).
        claim_index: Positional index of the claim.
        evidence_mode: One of the toiletpaper evidence modes.
        limitations: List of strings describing limitations of the test.
        simulation_file: Name of the simulation script file.
        n_runs: Number of runs to average over (for variance estimation).
        seed_offset: Base seed offset for multiple runs.

    Returns:
        dict matching the toiletpaper results.json schema.
    """
    import numpy as np

    measurements = []
    for i in range(n_runs):
        val = compute_fn()
        measurements.append(float(val))

    measured = float(np.mean(measurements))
    measured_std = float(np.std(measurements)) if n_runs > 1 else None

    if abs(claimed_value) < 1e-15:
        rel_error = abs(measured)
    else:
        rel_error = abs(measured - claimed_value) / abs(claimed_value)

    if rel_error <= tolerance:
        verdict = "reproduced"
    elif rel_error <= tolerance * 3:
        verdict = "fragile"
    else:
        verdict = "contradicted"

    confidence = max(0.1, min(0.99, 1.0 - rel_error))

    reason = (
        f"Measured {metric_name}={measured:.4f} "
        f"(claimed {claimed_value:.4f}), "
        f"relative error {rel_error:.2%}"
    )
    if measured_std is not None:
        reason += f", std={measured_std:.4f} over {n_runs} runs"

    result = {
        "claim_id": claim_id,
        "claim_index": claim_index,
        "claim_text": claim_text,
        "test_type": "numerical_prediction",
        "verdict": verdict,
        "evidence_mode": evidence_mode,
        "limitations": limitations or [],
        "confidence": round(confidence, 3),
        "reason": reason,
        "measured_value": measured,
        "expected_value": claimed_value,
    }
    if simulation_file:
        result["simulation_file"] = simulation_file

    return result
