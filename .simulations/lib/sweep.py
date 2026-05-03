"""Parameter sweep utilities with convergence testing.

Generic helpers for running simulations across parameter ranges,
fitting scaling laws, and checking convergence.

Usage:
    from sweep import parameter_sweep, fit_scaling_law, convergence_test
"""

import numpy as np
from typing import Callable, Optional


def parameter_sweep(fn, param_values, **fixed_kwargs):
    """Run fn(param, **fixed_kwargs) for each param in param_values.

    Returns list of results (whatever fn returns).
    """
    return [fn(p, **fixed_kwargs) for p in param_values]


def fit_scaling_law(x, y):
    """Fit y = A * x^alpha on log-log scale.

    Returns (alpha, alpha_err, A) where alpha is the exponent,
    alpha_err is the standard error, and A is the prefactor.
    """
    x, y = np.asarray(x, dtype=float), np.asarray(y, dtype=float)
    mask = (x > 0) & (y > 0)
    if mask.sum() < 2:
        return 0.0, float("inf"), 0.0
    lx, ly = np.log(x[mask]), np.log(y[mask])
    n = len(lx)
    sx = lx.sum()
    sy = ly.sum()
    sxy = (lx * ly).sum()
    sx2 = (lx * lx).sum()
    denom = n * sx2 - sx * sx
    if abs(denom) < 1e-15:
        return 0.0, float("inf"), 0.0
    alpha = (n * sxy - sx * sy) / denom
    intercept = (sy - alpha * sx) / n
    A = np.exp(intercept)
    residuals = ly - (alpha * lx + intercept)
    mse = (residuals ** 2).sum() / max(n - 2, 1)
    alpha_err = np.sqrt(mse * n / abs(denom))
    return float(alpha), float(alpha_err), float(A)


def convergence_test(fn, resolutions, **kwargs):
    """Run fn at multiple resolutions and check error decreases.

    fn(resolution, **kwargs) should return a scalar error metric.
    Returns (resolutions, errors, passed, order).
    """
    errors = [float(fn(r, **kwargs)) for r in resolutions]
    passed = len(errors) >= 2 and errors[-1] < errors[0]
    order = None
    if len(errors) >= 2 and errors[0] > 0 and errors[-1] > 0:
        r0, r1 = resolutions[0], resolutions[-1]
        if r0 > 0 and r1 > 0 and r0 != r1:
            order = float(np.log(errors[0] / errors[-1]) / np.log(r1 / r0))
    return resolutions, errors, passed, order


def relative_error(measured, expected):
    """Relative error, handling zero expected value."""
    if abs(expected) < 1e-15:
        return abs(measured)
    return abs(measured - expected) / abs(expected)


def verdict_from_error(rel_error, strict=0.05, fragile=0.15):
    """Map relative error to verdict string."""
    if rel_error < strict:
        return "reproduced"
    elif rel_error < fragile:
        return "fragile"
    else:
        return "contradicted"
