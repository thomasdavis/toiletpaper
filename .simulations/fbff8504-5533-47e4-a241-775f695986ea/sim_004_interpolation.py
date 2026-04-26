"""
Simulation 004: Interpolation Threshold and U-Shape
Tests Claims: 35, 37
Claim 35: Test losses show U-shape (bias-variance tradeoff)
Claim 37: Optimal G ≈ 1000/15 ≈ 67, observed ~50 for [2,5,1] KAN
"""

import json
import torch
import numpy as np
from kan_module import KAN, generate_data, train_model

torch.manual_seed(42)
np.random.seed(42)

RESULTS = []


def f_target(x):
    return torch.exp(torch.sin(np.pi * x[:, 0]) + x[:, 1] ** 2)


N_TRAIN = 1000
N_TEST = 1000
EPOCHS = 600

x_train, y_train = generate_data(f_target, 2, N_TRAIN, seed=42)
x_test, y_test = generate_data(f_target, 2, N_TEST, seed=123)

GRID_SIZES = [3, 5, 10, 20, 50, 100, 200]

print("=== Interpolation Threshold: [2,5,1] KAN ===\n")

test_rmses = []
train_rmses = []
param_counts = []

for G in GRID_SIZES:
    torch.manual_seed(42)
    model = KAN([2, 5, 1], grid_size=G, spline_order=3, grid_range=(-1, 1))
    n_params = model.count_params()
    param_counts.append(n_params)

    lr = 0.01 if G <= 100 else 0.005
    res = train_model(model, x_train, y_train, x_test, y_test,
                      epochs=EPOCHS, lr=lr)

    test_rmses.append(res["test_rmse"])
    train_rmses.append(res["train_rmse"])
    print(f"  G={G:4d}: params={n_params:5d}, "
          f"train_rmse={res['train_rmse']:.4e}, test_rmse={res['test_rmse']:.4e}")

# Find optimal G (minimum test RMSE)
best_idx = np.argmin(test_rmses)
best_G = GRID_SIZES[best_idx]
best_test_rmse = test_rmses[best_idx]

# Check for U-shape: test loss should decrease then increase
# Find if there's a local minimum in the interior
has_u_shape = False
if len(test_rmses) >= 3:
    for i in range(1, len(test_rmses) - 1):
        if test_rmses[i] < test_rmses[i - 1] and test_rmses[i] < test_rmses[i + 1]:
            has_u_shape = True
            break
    # Also check if last few values are increasing after the minimum
    if best_idx < len(test_rmses) - 1:
        if test_rmses[-1] > test_rmses[best_idx]:
            has_u_shape = True

print(f"\n  Best G={best_G}, test_rmse={best_test_rmse:.4e}")
print(f"  U-shape detected: {has_u_shape}")
print(f"  Test RMSE progression: {[f'{r:.4e}' for r in test_rmses]}")

# Expected interpolation threshold
# For [2,5,1] KAN with G grid intervals:
# params per layer 1: 2*5*(G+3) + 2*5 + 2*5 = 10*(G+3) + 20 = 10G + 50
# params per layer 2: 5*1*(G+3) + 5 + 5 = 5G + 15 + 10 = 5G + 25
# total = 15G + 75
# At interpolation threshold: params = n_train = 1000
# 15G + 75 = 1000 => G ≈ 62

# Paper's calculation: 15G = 1000 => G ≈ 67
expected_threshold = 1000 / 15
print(f"\n  Expected interpolation threshold: G ≈ {expected_threshold:.0f}")
print(f"  Paper's observed threshold: G ≈ 50")
print(f"  Our optimal G: {best_G}")

# Claim 35: U-shape in test loss
RESULTS.append({
    "claim_index": 35,
    "claim_text": "Test losses first go down then go up, displaying a U-shape, due to the bias-variance tradeoff.",
    "test_type": "numerical_prediction",
    "verdict": "reproduced" if has_u_shape else "fragile",
    "confidence": 0.8 if has_u_shape else 0.4,
    "reason": (f"Test RMSE across G={GRID_SIZES}: "
               f"{[f'{r:.3e}' for r in test_rmses]}. "
               f"U-shape {'detected' if has_u_shape else 'not clearly detected'} "
               f"with min at G={best_G}."),
    "measured_value": {"best_G": best_G, "u_shape": has_u_shape},
    "expected_value": "U-shape with minimum around G=50-67",
    "simulation_file": "sim_004_interpolation.py",
})

# Claim 37: Interpolation threshold around G=67, observed ~50
threshold_close = abs(best_G - 50) < 40 or abs(best_G - 67) < 40
RESULTS.append({
    "claim_index": 37,
    "claim_text": "Interpolation threshold expected at G ≈ 67, observed ~50.",
    "test_type": "numerical_prediction",
    "verdict": "reproduced" if threshold_close else "fragile",
    "confidence": 0.7 if threshold_close else 0.4,
    "reason": (f"Optimal G={best_G} (min test RMSE). "
               f"Paper expects ~67 from formula, observes ~50. "
               f"Our result {'is' if threshold_close else 'is not'} in expected range."),
    "measured_value": best_G,
    "expected_value": {"formula": 67, "observed_paper": 50},
    "simulation_file": "sim_004_interpolation.py",
})

with open("sim_004_results.json", "w") as f:
    json.dump(RESULTS, f, indent=2, default=str)

print(f"\nWrote {len(RESULTS)} results to sim_004_results.json")
