"""Statistical comparison utilities for simulation verdicts.

Bootstrap confidence intervals, effect sizes, seed averaging, and
significance testing for comparing baseline vs proposed models.

Usage:
    from stats import bootstrap_ci, cohens_d, seed_average, spearman_rank
"""

import numpy as np
from typing import Optional


def bootstrap_ci(data, statistic=np.mean, n_boot=10000, alpha=0.05, seed=42):
    """Bootstrap confidence interval for a statistic.

    Returns (estimate, ci_low, ci_high).
    """
    rng = np.random.default_rng(seed)
    data = np.asarray(data)
    n = len(data)
    boot_stats = np.array([
        statistic(rng.choice(data, size=n, replace=True))
        for _ in range(n_boot)
    ])
    lo = np.percentile(boot_stats, 100 * alpha / 2)
    hi = np.percentile(boot_stats, 100 * (1 - alpha / 2))
    return float(statistic(data)), float(lo), float(hi)


def cohens_d(group1, group2):
    """Cohen's d effect size between two groups."""
    g1, g2 = np.asarray(group1, dtype=float), np.asarray(group2, dtype=float)
    n1, n2 = len(g1), len(g2)
    var1, var2 = g1.var(ddof=1), g2.var(ddof=1)
    pooled_std = np.sqrt(((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2))
    if pooled_std < 1e-15:
        return 0.0
    return float((g1.mean() - g2.mean()) / pooled_std)


def seed_average(fn, seeds, **kwargs):
    """Run fn(seed=s, **kwargs) across multiple seeds, return (mean, std, values)."""
    values = [float(fn(seed=s, **kwargs)) for s in seeds]
    return float(np.mean(values)), float(np.std(values)), values


def spearman_rank(x, y):
    """Spearman rank correlation coefficient and approximate p-value."""
    from scipy.stats import spearmanr
    r, p = spearmanr(x, y)
    return float(r), float(p)


def permutation_test(group1, group2, n_perm=10000, seed=42):
    """Two-sample permutation test for difference in means.

    Returns (observed_diff, p_value).
    """
    rng = np.random.default_rng(seed)
    g1, g2 = np.asarray(group1), np.asarray(group2)
    observed = float(g1.mean() - g2.mean())
    combined = np.concatenate([g1, g2])
    n1 = len(g1)
    count = 0
    for _ in range(n_perm):
        rng.shuffle(combined)
        diff = combined[:n1].mean() - combined[n1:].mean()
        if abs(diff) >= abs(observed):
            count += 1
    return observed, count / n_perm
