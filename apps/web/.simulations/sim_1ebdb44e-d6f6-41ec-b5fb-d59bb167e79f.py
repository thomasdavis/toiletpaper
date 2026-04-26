#!/usr/bin/env python3
import json
import sys
import time
import signal
import math
import traceback
import numpy as np
from scipy import optimize

# Self-contained toy simulation comparing computation graph size needed
# by an MLP baseline vs a KAN-like proposed model to reach matched accuracy
# on smooth 1D supervised tasks.
#
# We define graph size as a simple hardware-independent operation count proxy:
# number of scalar multiply-add style edges plus nonlinear node evaluations.
#
# Baseline MLP:
#   1D input -> hidden width W -> 1D output, tanh activation
#   parameter count / graph proxy ~ 3W + 1
#
# Proposed KAN-like model:
#   sum_j c_j * phi_j(x), where phi_j are fixed local spline-like hat functions
#   on a uniform grid. This is a toy KAN-style edge-function representation.
#   Graph proxy ~ number of basis functions + local interpolation ops ~ O(K)
#
# We sweep target accuracy A by sweeping tolerated MSE epsilon over 2+ decades.
# For each task and each model, we find the smallest graph size reaching epsilon.
# Then average over tasks to compare G_KAN(A) and G_MLP(A).
#
# Convergence test:
#   repeat with two dataset resolutions and compare resulting average graph sizes.
#
# Conservation:
#   not physically applicable; we report training objective monotonicity violations
#   for the least-squares KAN fit and optimization consistency for MLP as a proxy.

TIME_LIMIT_SECONDS = 110

def _timeout_handler(signum, frame):
    raise TimeoutError("Simulation timed out")

signal.signal(signal.SIGALRM, _timeout_handler)
signal.alarm(TIME_LIMIT_SECONDS)

start_time = time.time()

def safe_float(x):
    if x is None:
        return None
    x = float(x)
    if not np.isfinite(x):
        return None
    return x

def make_tasks():
    # Smooth 1D tasks in the "small to medium supervised learning" toy regime.
    return [
        ("sin_1", lambda x: np.sin(2*np.pi*x)),
        ("sin_mix", lambda x: np.sin(2*np.pi*x) + 0.3*np.sin(6*np.pi*x)),
        ("poly_4", lambda x: x**4 - x**2 + 0.2*x),
        ("exp_sin", lambda x: np.exp(0.5*x) * np.sin(2*np.pi*x)),
        ("rational", lambda x: 1.0 / (1.0 + 25.0*(x-0.3)**2)),
    ]

def mse(yhat, y):
    d = yhat - y
    return float(np.mean(d*d))

def mlp_predict(params, x, W):
    # params = [a_1..a_W, b_1..b_W, c_1..c_W, d]
    a = params[0:W]
    b = params[W:2*W]
    c = params[2*W:3*W]
    d = params[-1]
    z = np.outer(x, a) + b[None, :]
    h = np.tanh(z)
    return h.dot(c) + d

def fit_mlp_lbfgs(x, y, W, n_restarts=3, maxiter=250):
    best = None
    best_loss = np.inf
    rng = np.random.default_rng(1234 + 17*W + len(x))

    x_scale = max(1e-8, np.std(x))
    y_scale = max(1e-8, np.std(y))

    for r in range(n_restarts):
        a0 = rng.normal(scale=1.0/x_scale, size=W)
        b0 = rng.normal(scale=0.5, size=W)
        c0 = rng.normal(scale=y_scale/np.sqrt(max(W,1)), size=W)
        d0 = np.array([np.mean(y)])
        p0 = np.concatenate([a0, b0, c0, d0])

        def obj(p):
            yp = mlp_predict(p, x, W)
            return 0.5*np.mean((yp - y)**2)

        try:
            res = optimize.minimize(
                obj, p0, method="L-BFGS-B",
                options={"maxiter": maxiter, "ftol": 1e-12, "gtol": 1e-8}
            )
            loss = float(res.fun) if np.isfinite(res.fun) else np.inf
            if loss < best_loss:
                best_loss = loss
                best = res.x.copy()
        except Exception:
            continue

    if best is None:
        raise RuntimeError(f"MLP optimization failed for width {W}")
    return best, 2.0 * best_loss

def hat_basis_matrix(x, K):
    # Uniform hat basis on [0,1], K basis functions centered on uniform knots.
    # Local support, piecewise linear.
    if K < 2:
        raise ValueError("K must be >= 2")
    centers = np.linspace(0.0, 1.0, K)
    h = centers[1] - centers[0]
    X = np.abs(x[:, None] - centers[None, :]) / h
    Phi = np.maximum(1.0 - X, 0.0)
    return Phi

def fit_kan_ls(x, y, K):
    Phi = hat_basis_matrix(x, K)
    coef, *_ = np.linalg.lstsq(Phi, y, rcond=None)
    yp = Phi.dot(coef)
    return coef, mse(yp, y)

def graph_size_mlp(W):
    # Edges + nonlinear nodes proxy for 1-hidden-layer MLP
    # input->hidden: W mult/add edges
    # hidden biases: W
    # hidden activations: W
    # hidden->output: W
    # output bias: 1
    return int(4*W + 1)

def graph_size_kan(K):
    # Local basis evaluation + weighted sum proxy
    # K basis nodes, K coefficient edges, plus local interpolation structure ~ K
    return int(3*K)

def find_min_graph_for_target(task_fn, n_samples, epsilons, mlp_widths, kan_basis_sizes):
    x = np.linspace(0.0, 1.0, n_samples)
    y = task_fn(x)

    mlp_results = []
    kan_results = []
    conservation_entries = []

    prev_kan_err = None
    kan_monotonic_violations = 0

    # Precompute KAN errors over K
    kan_errs = {}
    for K in kan_basis_sizes:
        _, err = fit_kan_ls(x, y, K)
        kan_errs[K] = err
        if prev_kan_err is not None and err > prev_kan_err + 1e-12:
            kan_monotonic_violations += 1
        prev_kan_err = min(prev_kan_err, err) if prev_kan_err is not None else err

    # Precompute MLP errors over W
    mlp_errs = {}
    mlp_failures = 0
    for W in mlp_widths:
        try:
            _, err = fit_mlp_lbfgs(x, y, W)
            mlp_errs[W] = err
        except Exception:
            mlp_errs[W] = np.inf
            mlp_failures += 1

    conservation_entries.append({
        "name": "kan_training_error_monotonicity_violation_fraction",
        "max_drift": safe_float(kan_monotonic_violations / max(1, len(kan_basis_sizes)-1))
    })
    conservation_entries.append({
        "name": "mlp_optimization_failure_fraction",
        "max_drift": safe_float(mlp_failures / max(1, len(mlp_widths)))
    })

    for eps in epsilons:
        g_mlp = None
        for W in mlp_widths:
            if mlp_errs[W] <= eps:
                g_mlp = graph_size_mlp(W)
                break
        if g_mlp is None:
            g_mlp = graph_size_mlp(mlp_widths[-1])

        g_kan = None
        for K in kan_basis_sizes:
            if kan_errs[K] <= eps:
                g_kan = graph_size_kan(K)
                break
        if g_kan is None:
            g_kan = graph_size_kan(kan_basis_sizes[-1])

        mlp_results.append(g_mlp)
        kan_results.append(g_kan)

    return np.array(mlp_results, dtype=float), np.array(kan_results, dtype=float), conservation_entries

def aggregate_over_tasks(n_samples, epsilons, mlp_widths, kan_basis_sizes):
    tasks = make_tasks()
    all_mlp = []
    all_kan = []
    conservation = []

    for name, fn in tasks:
        gm, gk, cons = find_min_graph_for_target(fn, n_samples, epsilons, mlp_widths, kan_basis_sizes)
        all_mlp.append(gm)
        all_kan.append(gk)
        conservation.extend(cons)

    avg_mlp = np.mean(np.vstack(all_mlp), axis=0)
    avg_kan = np.mean(np.vstack(all_kan), axis=0)
    return avg_mlp, avg_kan, conservation

def main():
    # Sweep target accuracy A via tolerated MSE epsilon over >2 decades.
    epsilons = np.logspace(-1, -4, 10)
    # Report x as accuracy A = 1 - normalized error proxy; but for matched target protocol
    # we use A = -log10(epsilon), monotone with stricter target.
    A_values = -np.log10(epsilons)

    mlp_widths = list(range(2, 41, 2))
    kan_basis_sizes = list(range(3, 81, 2))

    # Two resolutions for convergence
    resolutions = [128, 256]
    coarse_mlp, coarse_kan, cons1 = aggregate_over_tasks(resolutions[0], epsilons, mlp_widths, kan_basis_sizes)
    fine_mlp, fine_kan, cons2 = aggregate_over_tasks(resolutions[1], epsilons, mlp_widths, kan_basis_sizes)

    # Use fine resolution as reported result
    baseline_y = fine_mlp.tolist()
    proposed_y = fine_kan.tolist()

    # Convergence error: relative difference between coarse and fine average graph sizes
    conv_errors = []
    for b_c, b_f, p_c, p_f in zip(coarse_mlp, fine_mlp, coarse_kan, fine_kan):
        denom_b = max(1.0, abs(b_f))
        denom_p = max(1.0, abs(p_f))
        e = 0.5 * (abs(b_c - b_f)/denom_b + abs(p_c - p_f)/denom_p)
        conv_errors.append(float(e))
    convergence = {
        "resolutions": resolutions,
        "errors": [float(np.mean(conv_errors)), float(np.max(conv_errors))]
    }

    # Exponent not applicable for this baseline_contrast claim
    fitted_exponent = None
    fitted_exponent_error = None

    # Aggregate conservation/proxy checks
    all_cons = cons1 + cons2
    grouped = {}
    for item in all_cons:
        name = item["name"]
        grouped.setdefault(name, []).append(item["max_drift"])
    conservation = {
        "quantities": [
            {"name": name, "max_drift": safe_float(np.max(vals))}
            for name, vals in grouped.items()
        ]
    }

    result = {
        "baseline": {
            "x": [float(v) for v in A_values],
            "y": [float(v) for v in baseline_y]
        },
        "proposed": {
            "x": [float(v) for v in A_values],
            "y": [float(v) for v in proposed_y]
        },
        "fitted_exponent": fitted_exponent,
        "fitted_exponent_error": fitted_exponent_error,
        "convergence": convergence,
        "conservation": conservation,
        "execution_time": safe_float(time.time() - start_time)
    }

    print(json.dumps(result, separators=(",", ":")))

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        fallback = {
            "baseline": {"x": [], "y": []},
            "proposed": {"x": [], "y": []},
            "fitted_exponent": None,
            "fitted_exponent_error": None,
            "convergence": {"resolutions": [], "errors": []},
            "conservation": {"quantities": [{"name": "exception", "max_drift": None}]},
            "execution_time": safe_float(time.time() - start_time),
            "error": str(e),
            "traceback": traceback.format_exc().splitlines()[-5:]
        }
        print(json.dumps(fallback, separators=(",", ":")))
        sys.exit(1)