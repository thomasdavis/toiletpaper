"""Template: Statistical Significance Verification

Test claims of the form "p < X, effect size d = Y" by recomputing
statistics from data or by running the experiment and comparing groups.

Usage:
    from templates.statistical_significance import test_significance_claim

    result = test_significance_claim(
        claim_id="abc-123",
        claim_text="Treatment improved outcomes (p < 0.01, Cohen's d = 0.8)",
        group_a_fn=lambda: run_control(),      # returns array of values
        group_b_fn=lambda: run_treatment(),     # returns array of values
        claimed_p_threshold=0.01,
        claimed_effect_size=0.8,
        evidence_mode="proxy_simulation",
        limitations=["synthetic data", "n=100 per group"],
    )
"""

from typing import Callable, Optional


def test_significance_claim(
    claim_id: str,
    claim_text: str,
    group_a_fn: Callable[[], list[float]],
    group_b_fn: Callable[[], list[float]],
    claimed_p_threshold: float = 0.05,
    claimed_effect_size: Optional[float] = None,
    effect_size_tolerance: float = 0.20,
    claim_index: int = 0,
    evidence_mode: str = "proxy_simulation",
    limitations: Optional[list[str]] = None,
    simulation_file: Optional[str] = None,
    test_type_stat: str = "t-test",
) -> dict:
    """Test a claimed statistical significance result.

    Args:
        claim_id: UUID of the claim in the database.
        claim_text: Human-readable claim text.
        group_a_fn: Callable returning a list of values for group A (control).
        group_b_fn: Callable returning a list of values for group B (treatment).
        claimed_p_threshold: The p-value threshold claimed (e.g. 0.05, 0.01).
        claimed_effect_size: Claimed Cohen's d (or None if not claimed).
        effect_size_tolerance: Relative tolerance for effect size match.
        claim_index: Positional index of the claim.
        evidence_mode: One of the toiletpaper evidence modes.
        limitations: List of limitation strings.
        simulation_file: Name of the simulation script file.
        test_type_stat: Statistical test to use: "t-test", "mann-whitney", or "permutation".

    Returns:
        dict matching the toiletpaper results.json schema.
    """
    import numpy as np
    from scipy import stats as sp_stats

    a = np.array(group_a_fn(), dtype=float)
    b = np.array(group_b_fn(), dtype=float)

    n_a, n_b = len(a), len(b)

    # Compute p-value
    if test_type_stat == "mann-whitney":
        stat_val, p_value = sp_stats.mannwhitneyu(a, b, alternative="two-sided")
    elif test_type_stat == "permutation":
        observed_diff = float(b.mean() - a.mean())
        combined = np.concatenate([a, b])
        rng = np.random.default_rng(42)
        n_perm = 10000
        count = 0
        for _ in range(n_perm):
            rng.shuffle(combined)
            diff = combined[:n_a].mean() - combined[n_a:].mean()
            if abs(diff) >= abs(observed_diff):
                count += 1
        p_value = count / n_perm
        stat_val = observed_diff
    else:  # t-test
        stat_val, p_value = sp_stats.ttest_ind(a, b, equal_var=False)

    p_value = float(p_value)

    # Compute Cohen's d
    var_a, var_b = float(a.var(ddof=1)), float(b.var(ddof=1))
    pooled_std = float(np.sqrt(((n_a - 1) * var_a + (n_b - 1) * var_b) / (n_a + n_b - 2)))
    if pooled_std > 1e-15:
        cohens_d = float((b.mean() - a.mean()) / pooled_std)
    else:
        cohens_d = 0.0

    # Determine verdict
    sig_reproduced = p_value < claimed_p_threshold

    effect_reproduced = True
    effect_error = None
    if claimed_effect_size is not None:
        if abs(claimed_effect_size) < 1e-15:
            effect_error = abs(cohens_d)
        else:
            effect_error = abs(cohens_d - claimed_effect_size) / abs(claimed_effect_size)
        effect_reproduced = effect_error <= effect_size_tolerance

    if sig_reproduced and effect_reproduced:
        verdict = "reproduced"
    elif sig_reproduced and not effect_reproduced:
        verdict = "fragile"
    elif not sig_reproduced and effect_reproduced:
        verdict = "fragile"
    else:
        verdict = "contradicted"

    confidence_base = 0.8 if sig_reproduced else 0.3
    if claimed_effect_size is not None and effect_error is not None:
        confidence_base *= max(0.3, 1.0 - effect_error)
    confidence = max(0.1, min(0.99, confidence_base))

    reason_parts = [
        f"Group A: n={n_a}, mean={a.mean():.4f}, std={a.std():.4f}",
        f"Group B: n={n_b}, mean={b.mean():.4f}, std={b.std():.4f}",
        f"Test: {test_type_stat}, p={p_value:.6f} ({'<' if sig_reproduced else '>='} {claimed_p_threshold})",
        f"Cohen's d={cohens_d:.4f}",
    ]
    if claimed_effect_size is not None:
        reason_parts.append(
            f"claimed d={claimed_effect_size:.4f}, error={effect_error:.2%}"
        )

    result = {
        "claim_id": claim_id,
        "claim_index": claim_index,
        "claim_text": claim_text,
        "test_type": "algebraic",
        "verdict": verdict,
        "evidence_mode": evidence_mode,
        "limitations": limitations or [],
        "confidence": round(confidence, 3),
        "reason": ". ".join(reason_parts),
        "measured_value": cohens_d if claimed_effect_size is not None else p_value,
        "expected_value": claimed_effect_size if claimed_effect_size is not None else claimed_p_threshold,
    }
    if simulation_file:
        result["simulation_file"] = simulation_file

    return result
