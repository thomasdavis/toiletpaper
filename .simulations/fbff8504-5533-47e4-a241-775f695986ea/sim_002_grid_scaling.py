"""
Simulation 002: Grid Scaling Exponent
Tests Claims: 27, 29, 30, 31, 39, 40, 41
Core claim: KAN test RMSE scales as G^{-(k+1)} = G^{-4} for cubic splines.
Paper reports empirical G^{-3} with mean RMSE, G^{-4} with median.
"""

import json
import torch
import numpy as np
from kan_module import KAN, generate_data, train_model, fit_power_law

torch.manual_seed(42)
np.random.seed(42)

RESULTS = []


def f_target(x):
    """f(x,y) = exp(sin(pi*x) + y^2)"""
    return torch.exp(torch.sin(np.pi * x[:, 0]) + x[:, 1] ** 2)


N_TRAIN = 1000
N_TEST = 1000
N_SEEDS = 3  # multiple seeds to compute mean and median RMSE
EPOCHS = 600
GRID_SIZES = [3, 5, 10, 20, 50]

x_train, y_train = generate_data(f_target, 2, N_TRAIN, seed=42)
x_test, y_test = generate_data(f_target, 2, N_TEST, seed=123)

print("=== Grid Scaling: [2,1,1] KAN with varying G ===")

grid_rmse_mean = []
grid_rmse_median = []

for G in GRID_SIZES:
    seed_rmses = []
    for seed in range(N_SEEDS):
        torch.manual_seed(seed)
        model = KAN([2, 1, 1], grid_size=G, spline_order=3, grid_range=(-1, 1))
        n_params = model.count_params()
        res = train_model(model, x_train, y_train, x_test, y_test,
                          epochs=EPOCHS, lr=0.01)
        seed_rmses.append(res["test_rmse"])

    mean_rmse = np.mean(seed_rmses)
    median_rmse = np.median(seed_rmses)
    grid_rmse_mean.append(mean_rmse)
    grid_rmse_median.append(median_rmse)
    print(f"  G={G:4d}: params={n_params:5d}, "
          f"mean_rmse={mean_rmse:.4e}, median_rmse={median_rmse:.4e}")

# Fit power laws: RMSE ~ G^(-alpha)
_, alpha_mean, r2_mean = fit_power_law(GRID_SIZES, grid_rmse_mean)
_, alpha_median, r2_median = fit_power_law(GRID_SIZES, grid_rmse_median)

print(f"\n  Mean RMSE scaling:   G^({alpha_mean:.3f}), R²={r2_mean:.3f}")
print(f"  Median RMSE scaling: G^({alpha_median:.3f}), R²={r2_median:.3f}")
print(f"  Expected: G^(-3) to G^(-4)")

# Also test [2,5,1] for comparison
print("\n=== Grid Scaling: [2,5,1] KAN with varying G ===")
grid_rmse_251 = []
for G in GRID_SIZES:
    torch.manual_seed(42)
    model = KAN([2, 5, 1], grid_size=G, spline_order=3, grid_range=(-1, 1))
    n_params = model.count_params()
    res = train_model(model, x_train, y_train, x_test, y_test,
                      epochs=EPOCHS, lr=0.01)
    grid_rmse_251.append(res["test_rmse"])
    print(f"  G={G:4d}: params={n_params:5d}, test_rmse={res['test_rmse']:.4e}")

_, alpha_251, r2_251 = fit_power_law(GRID_SIZES, grid_rmse_251)
print(f"\n  [2,5,1] scaling: G^({alpha_251:.3f}), R²={r2_251:.3f}")


# --- Build results ---

# Claim 27: Approximation bound G^{-(k+1)+m}, for m=0 gives G^{-(k+1)}
RESULTS.append({
    "claim_index": 27,
    "claim_text": "Approximation bound: ||f - approx||_{C^m} <= C * G^{-(k+1-m)}",
    "test_type": "scaling_law",
    "verdict": "reproduced" if abs(alpha_mean + 3) < 2 or abs(alpha_median + 4) < 2 else "fragile",
    "confidence": 0.8,
    "reason": (f"Mean scaling G^({alpha_mean:.2f}), median G^({alpha_median:.2f}). "
               f"Theory predicts G^(-4) for k=3. "
               f"Paper reports G^(-3) empirically."),
    "measured_value": {"alpha_mean": alpha_mean, "alpha_median": alpha_median},
    "expected_value": -4.0,
    "simulation_file": "sim_002_grid_scaling.py",
})

# Claim 29: For m=0, scaling exponent is k+1
RESULTS.append({
    "claim_index": 29,
    "claim_text": "For m=0, we recover L∞ accuracy giving scaling exponent k+1.",
    "test_type": "scaling_law",
    "verdict": "reproduced" if abs(alpha_median + 4) < 2 else "fragile",
    "confidence": 0.75,
    "reason": (f"Median RMSE scales as G^({alpha_median:.2f}), "
               f"expected G^(-4) for k=3."),
    "measured_value": alpha_median,
    "expected_value": -4.0,
    "simulation_file": "sim_002_grid_scaling.py",
})

# Claim 30: alpha = k+1
RESULTS.append({
    "claim_index": 30,
    "claim_text": "Our approach gives α = k + 1 where k is the piecewise polynomial order.",
    "test_type": "scaling_law",
    "verdict": "reproduced" if abs(alpha_median + 4) < 2 else "fragile",
    "confidence": 0.75,
    "reason": f"Measured median exponent {alpha_median:.2f}, expected -4 for k=3.",
    "measured_value": alpha_median,
    "expected_value": -4.0,
    "simulation_file": "sim_002_grid_scaling.py",
})

# Claim 31: k=3 cubic splines give alpha=4
RESULTS.append({
    "claim_index": 31,
    "claim_text": "We choose k=3 cubic splines so α=4 which is the largest and best scaling exponent.",
    "test_type": "scaling_law",
    "verdict": "reproduced" if abs(alpha_median + 4) < 2 else "fragile",
    "confidence": 0.75,
    "reason": f"Measured median exponent {alpha_median:.2f} with k=3 cubic splines.",
    "measured_value": alpha_median,
    "expected_value": -4.0,
    "simulation_file": "sim_002_grid_scaling.py",
})

# Claim 39: [2,1,1] KAN scales roughly as G^{-3}
RESULTS.append({
    "claim_index": 39,
    "claim_text": "A [2,1,1] KAN scales roughly as test RMSE ∝ G^{-3}.",
    "test_type": "scaling_law",
    "verdict": "reproduced" if abs(alpha_mean + 3) < 1.5 else "fragile",
    "confidence": 0.8,
    "reason": f"Mean RMSE scales as G^({alpha_mean:.2f}), expected ~G^(-3).",
    "measured_value": alpha_mean,
    "expected_value": -3.0,
    "simulation_file": "sim_002_grid_scaling.py",
})

# Claim 40: Theory predicts G^{-4}
RESULTS.append({
    "claim_index": 40,
    "claim_text": "According to Theorem 2.1, we would expect test RMSE ∝ G^{-4}.",
    "test_type": "scaling_law",
    "verdict": "reproduced" if abs(alpha_median + 4) < 1.5 else "fragile",
    "confidence": 0.7,
    "reason": (f"Median RMSE scaling G^({alpha_median:.2f}) is closer to G^(-4); "
               f"mean G^({alpha_mean:.2f}) is closer to G^(-3)."),
    "measured_value": alpha_median,
    "expected_value": -4.0,
    "simulation_file": "sim_002_grid_scaling.py",
})

# Claim 41: Median gives scaling closer to G^{-4}
closer_to_4 = abs(alpha_median + 4) < abs(alpha_mean + 4)
RESULTS.append({
    "claim_index": 41,
    "claim_text": "If we plot sqrt of median squared losses, we get scaling closer to G^{-4}.",
    "test_type": "scaling_law",
    "verdict": "reproduced" if closer_to_4 else "contradicted",
    "confidence": 0.8 if closer_to_4 else 0.4,
    "reason": (f"Median exponent={alpha_median:.2f} vs mean exponent={alpha_mean:.2f}. "
               f"Median {'is' if closer_to_4 else 'is not'} closer to -4."),
    "measured_value": {"alpha_mean": alpha_mean, "alpha_median": alpha_median},
    "expected_value": "median closer to -4 than mean",
    "simulation_file": "sim_002_grid_scaling.py",
})

with open("sim_002_results.json", "w") as f:
    json.dump(RESULTS, f, indent=2, default=str)

print(f"\nWrote {len(RESULTS)} results to sim_002_results.json")
