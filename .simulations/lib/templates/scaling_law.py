"""Template: Scaling Law Verification

Test claims of the form "scales as O(n^k)" or "loss follows L = A * N^{-alpha}"
by fitting a power law on log-log scale across multiple problem sizes.

Usage:
    from templates.scaling_law import test_scaling_law

    result = test_scaling_law(
        claim_id="abc-123",
        claim_text="Training loss scales as L = 1.2 * N^{-0.076}",
        measure_fn=lambda n: train_and_measure_loss(n),
        sizes=[100, 500, 1000, 5000, 10000],
        claimed_exponent=-0.076,
        evidence_mode="proxy_simulation",
        limitations=["5 sizes only", "synthetic data"],
    )
"""

from typing import Callable, Optional


def test_scaling_law(
    claim_id: str,
    claim_text: str,
    measure_fn: Callable[[int], float],
    sizes: list[int],
    claimed_exponent: float,
    claimed_prefactor: Optional[float] = None,
    tolerance: float = 0.10,
    claim_index: int = 0,
    evidence_mode: str = "proxy_simulation",
    limitations: Optional[list[str]] = None,
    simulation_file: Optional[str] = None,
) -> dict:
    """Test a claimed scaling law by measuring at multiple sizes and fitting.

    Args:
        claim_id: UUID of the claim in the database.
        claim_text: Human-readable claim text.
        measure_fn: Callable(n) -> metric. Runs the experiment at size n.
        sizes: List of problem sizes to test at.
        claimed_exponent: The claimed power-law exponent (alpha in y = A*x^alpha).
        claimed_prefactor: Optional claimed prefactor A.
        tolerance: Relative tolerance for exponent match (default 10%).
        claim_index: Positional index of the claim.
        evidence_mode: One of the toiletpaper evidence modes.
        limitations: List of limitation strings.
        simulation_file: Name of the simulation script file.

    Returns:
        dict matching the toiletpaper results.json schema.
    """
    import numpy as np

    measurements = []
    for n in sizes:
        val = float(measure_fn(n))
        measurements.append(val)

    x = np.array(sizes, dtype=float)
    y = np.array(measurements, dtype=float)

    # Filter out non-positive values for log-log fit
    mask = (x > 0) & (y > 0)
    if mask.sum() < 2:
        return {
            "claim_id": claim_id,
            "claim_index": claim_index,
            "claim_text": claim_text,
            "test_type": "scaling_law",
            "verdict": "underdetermined",
            "evidence_mode": evidence_mode,
            "limitations": limitations or [],
            "confidence": 0.1,
            "reason": "Insufficient positive data points for log-log regression",
        }

    log_x = np.log(x[mask])
    log_y = np.log(y[mask])

    n_pts = len(log_x)
    sx = log_x.sum()
    sy = log_y.sum()
    sxy = (log_x * log_y).sum()
    sx2 = (log_x ** 2).sum()

    denom = n_pts * sx2 - sx * sx
    if abs(denom) < 1e-15:
        return {
            "claim_id": claim_id,
            "claim_index": claim_index,
            "claim_text": claim_text,
            "test_type": "scaling_law",
            "verdict": "underdetermined",
            "evidence_mode": evidence_mode,
            "limitations": limitations or [],
            "confidence": 0.1,
            "reason": "Degenerate data — all x values identical on log scale",
        }

    alpha = float((n_pts * sxy - sx * sy) / denom)
    intercept = float((sy - alpha * sx) / n_pts)
    A = float(np.exp(intercept))

    # Fit quality (R^2)
    y_pred = alpha * log_x + intercept
    ss_res = float(np.sum((log_y - y_pred) ** 2))
    ss_tot = float(np.sum((log_y - log_y.mean()) ** 2))
    r_squared = 1.0 - ss_res / ss_tot if ss_tot > 1e-15 else 0.0

    # Standard error of alpha
    mse = ss_res / max(n_pts - 2, 1)
    alpha_se = float(np.sqrt(mse * n_pts / abs(denom)))

    # Compare exponents
    if abs(claimed_exponent) < 1e-15:
        exp_rel_error = abs(alpha)
    else:
        exp_rel_error = abs(alpha - claimed_exponent) / abs(claimed_exponent)

    if exp_rel_error <= tolerance and r_squared > 0.8:
        verdict = "reproduced"
    elif exp_rel_error <= tolerance * 2 or r_squared > 0.7:
        verdict = "fragile"
    else:
        verdict = "contradicted"

    confidence = max(0.1, min(0.99, r_squared * (1.0 - exp_rel_error)))

    reason = (
        f"Fitted exponent alpha={alpha:.4f} +/- {alpha_se:.4f} "
        f"(claimed {claimed_exponent:.4f}), "
        f"relative error={exp_rel_error:.2%}, "
        f"R^2={r_squared:.4f}, prefactor A={A:.4f}"
    )
    if claimed_prefactor is not None:
        pf_err = abs(A - claimed_prefactor) / abs(claimed_prefactor) if abs(claimed_prefactor) > 1e-15 else abs(A)
        reason += f" (claimed A={claimed_prefactor:.4f}, error={pf_err:.2%})"

    result = {
        "claim_id": claim_id,
        "claim_index": claim_index,
        "claim_text": claim_text,
        "test_type": "scaling_law",
        "verdict": verdict,
        "evidence_mode": evidence_mode,
        "limitations": limitations or [],
        "confidence": round(confidence, 3),
        "reason": reason,
        "measured_value": alpha,
        "expected_value": claimed_exponent,
    }
    if simulation_file:
        result["simulation_file"] = simulation_file

    return result
