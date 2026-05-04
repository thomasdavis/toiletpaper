"""Template: Seed Sensitivity / Robustness Test

Test claim robustness by running the same experiment across multiple random seeds.
Flags results as fragile if there is high variance, or contradicted if the claimed
value falls outside the confidence interval of seed runs.

Usage:
    from templates.seed_sensitivity import test_seed_sensitivity

    result = test_seed_sensitivity(
        claim_id="abc-123",
        claim_text="Our method achieves 85% accuracy on Split-MNIST",
        run_fn=lambda seed: train_and_evaluate(seed=seed),
        claimed_value=0.85,
        seeds=[0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
        metric_name="accuracy",
        evidence_mode="proxy_simulation",
        limitations=["3 epochs per task", "reduced hidden size"],
    )
"""

from typing import Callable, Optional


def test_seed_sensitivity(
    claim_id: str,
    claim_text: str,
    run_fn: Callable[[int], float],
    claimed_value: float,
    seeds: Optional[list[int]] = None,
    metric_name: str = "accuracy",
    tolerance: float = 0.05,
    max_cv: float = 0.15,
    claim_index: int = 0,
    evidence_mode: str = "proxy_simulation",
    limitations: Optional[list[str]] = None,
    simulation_file: Optional[str] = None,
) -> dict:
    """Test whether a claimed value holds across random seeds.

    Args:
        claim_id: UUID of the claim in the database.
        claim_text: Human-readable claim text.
        run_fn: Callable(seed) -> metric value. Runs the full experiment
                with the given random seed.
        claimed_value: The value stated in the paper.
        seeds: List of random seeds to test. Default: [0..9].
        metric_name: Name of the metric being measured.
        tolerance: Relative tolerance for mean matching claimed value.
        max_cv: Maximum coefficient of variation before flagging as fragile.
        claim_index: Positional index of the claim.
        evidence_mode: One of the toiletpaper evidence modes.
        limitations: List of limitation strings.
        simulation_file: Name of the simulation script file.

    Returns:
        dict matching the toiletpaper results.json schema, with additional
        seed_results and coefficient_of_variation fields.
    """
    import numpy as np

    if seeds is None:
        seeds = list(range(10))

    values = []
    for s in seeds:
        val = float(run_fn(s))
        values.append(val)

    arr = np.array(values)
    mean_val = float(arr.mean())
    std_val = float(arr.std())
    min_val = float(arr.min())
    max_val = float(arr.max())

    cv = std_val / abs(mean_val) if abs(mean_val) > 1e-15 else float("inf")

    # Bootstrap 95% CI
    rng = np.random.default_rng(42)
    n_boot = 5000
    boot_means = np.array([
        rng.choice(arr, size=len(arr), replace=True).mean()
        for _ in range(n_boot)
    ])
    ci_lo = float(np.percentile(boot_means, 2.5))
    ci_hi = float(np.percentile(boot_means, 97.5))

    # Compare mean to claimed value
    if abs(claimed_value) < 1e-15:
        rel_error = abs(mean_val)
    else:
        rel_error = abs(mean_val - claimed_value) / abs(claimed_value)

    claimed_in_ci = ci_lo <= claimed_value <= ci_hi

    # Determine verdict
    if rel_error <= tolerance and cv <= max_cv:
        verdict = "reproduced"
    elif claimed_in_ci and cv <= max_cv * 2:
        verdict = "fragile"
    elif not claimed_in_ci:
        verdict = "contradicted"
    else:
        verdict = "fragile"

    confidence = max(0.1, min(0.99, (1.0 - rel_error) * (1.0 - min(cv, 1.0))))

    reason = (
        f"Across {len(seeds)} seeds: {metric_name} mean={mean_val:.4f}, "
        f"std={std_val:.4f}, CV={cv:.3f}, "
        f"range=[{min_val:.4f}, {max_val:.4f}], "
        f"95% CI=[{ci_lo:.4f}, {ci_hi:.4f}]. "
        f"Claimed {claimed_value:.4f}, "
        f"{'within' if claimed_in_ci else 'outside'} CI, "
        f"rel_error={rel_error:.2%}"
    )

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
        "measured_value": mean_val,
        "expected_value": claimed_value,
        "seed_results": {str(s): v for s, v in zip(seeds, values)},
        "coefficient_of_variation": round(cv, 4),
    }
    if simulation_file:
        result["simulation_file"] = simulation_file

    return result
