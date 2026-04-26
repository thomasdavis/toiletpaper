"""
Simulation 003: Parameter Count Verification
Tests Claims: 24, 25, 76
Verifies the parameter count formulas for KAN and MLP.
"""

import json
import torch
import numpy as np
from kan_module import KAN, MLP

RESULTS = []


def kan_param_formula(layer_sizes, G, k):
    """Expected KAN parameter count from paper formula."""
    total = 0
    for i in range(len(layer_sizes) - 1):
        n_in, n_out = layer_sizes[i], layer_sizes[i + 1]
        # Spline coefficients: n_out * n_in * (G + k)
        total += n_out * n_in * (G + k)
        # Base weight: n_out * n_in
        total += n_out * n_in
        # Spline scale weight: n_out * n_in
        total += n_out * n_in
    return total


def mlp_param_formula(layer_sizes):
    """Expected MLP parameter count."""
    total = 0
    for i in range(len(layer_sizes) - 1):
        total += layer_sizes[i] * layer_sizes[i + 1]  # weights
        total += layer_sizes[i + 1]  # biases
    return total


print("=== Parameter Count Verification ===\n")

# Test various KAN configurations
kan_tests = [
    ([2, 5, 1], 5, 3),
    ([2, 1, 1], 10, 3),
    ([4, 2, 2, 1], 5, 3),
    ([17, 1, 14], 3, 3),  # Claim 76
    ([2, 10, 1], 5, 3),
    ([3, 3, 3, 1], 10, 3),
]

print("KAN Parameter Counts:")
print(f"{'Shape':<20} {'G':>4} {'k':>2} {'Actual':>8} {'Formula':>8} {'Match':>6}")
all_kan_match = True
for shape, G, k in kan_tests:
    model = KAN(shape, grid_size=G, spline_order=k)
    actual = model.count_params()
    expected = kan_param_formula(shape, G, k)
    match = actual == expected
    if not match:
        all_kan_match = False
    print(f"{str(shape):<20} {G:>4} {k:>2} {actual:>8} {expected:>8} {'✓' if match else '✗':>6}")

# Test MLP configurations
mlp_tests = [
    [2, 10, 1],
    [2, 100, 1],
    [4, 50, 50, 1],
    [4, 100, 100, 100, 1],
    [2, 100, 100, 100, 100, 1],
]

print("\nMLP Parameter Counts:")
print(f"{'Shape':<30} {'Actual':>8} {'Formula':>8} {'Match':>6}")
all_mlp_match = True
for shape in mlp_tests:
    model = MLP(shape)
    actual = model.count_params()
    expected = mlp_param_formula(shape)
    match = actual == expected
    if not match:
        all_mlp_match = False
    print(f"{str(shape):<30} {actual:>8} {expected:>8} {'✓' if match else '✗':>6}")

# Verify O(N²L(G+k)) scaling for KAN vs O(N²L) for MLP
print("\n=== Scaling Verification ===")
# For uniform width N, depth L:
# KAN params ≈ N² * L * (G + k + 2)  [+2 for base_weight and spline_weight per edge]
# MLP params ≈ N² * L + N * (L+1)    [weights + biases]

N = 10
for L in [2, 3, 4]:
    kan_shape = [N] * (L + 1)
    mlp_shape = [N] * (L + 1)
    G, k = 5, 3

    kan_model = KAN(kan_shape, grid_size=G, spline_order=k)
    mlp_model = MLP(mlp_shape)

    kan_p = kan_model.count_params()
    mlp_p = mlp_model.count_params()
    ratio = kan_p / mlp_p

    print(f"  N={N}, L={L}: KAN={kan_p}, MLP={mlp_p}, "
          f"ratio={ratio:.1f}, expected≈{G+k+2:.0f}")

# Claim 76: [17,1,14] KAN (G=3, k=3) has ~200 parameters
kan_76 = KAN([17, 1, 14], grid_size=3, spline_order=3)
params_76 = kan_76.count_params()
print(f"\n  Claim 76: [17,1,14] KAN (G=3,k=3) has {params_76} params (paper claims ~200)")

# MLP comparison: 4-layer width-300 has ~3*10^5 parameters
mlp_76 = MLP([17, 300, 300, 300, 300, 14])
mlp_params_76 = mlp_76.count_params()
print(f"  4-layer width-300 MLP: {mlp_params_76} params (paper claims ~3×10^5)")

# --- Build results ---

# Claim 24: KAN param count O(N²L(G+k))
RESULTS.append({
    "claim_index": 24,
    "claim_text": "There are in total O(N²L(G+k)) ~ O(N²LG) parameters.",
    "test_type": "algebraic",
    "verdict": "reproduced" if all_kan_match else "contradicted",
    "confidence": 0.95,
    "reason": (f"All KAN parameter counts match formula: "
               f"n_out*n_in*(G+k) spline + n_out*n_in base + n_out*n_in scale per layer."),
    "measured_value": "all_match" if all_kan_match else "mismatch",
    "expected_value": "O(N²L(G+k))",
    "simulation_file": "sim_003_param_count.py",
})

# Claim 25: MLP params O(N²L)
RESULTS.append({
    "claim_index": 25,
    "claim_text": "An MLP with depth L and width N only needs O(N²L) parameters.",
    "test_type": "algebraic",
    "verdict": "reproduced" if all_mlp_match else "contradicted",
    "confidence": 0.95,
    "reason": "All MLP parameter counts match formula: N²L weights + N(L+1) biases.",
    "measured_value": "all_match" if all_mlp_match else "mismatch",
    "expected_value": "O(N²L)",
    "simulation_file": "sim_003_param_count.py",
})

# Claim 76: [17,1,14] KAN has ~200 params
RESULTS.append({
    "claim_index": 76,
    "claim_text": "The [17,1,14] KAN (G=3, k=3) has ≈ 200 parameters.",
    "test_type": "numerical_prediction",
    "verdict": "reproduced" if abs(params_76 - 200) < 100 else "contradicted",
    "confidence": 0.9,
    "reason": f"Measured {params_76} parameters vs claimed ~200.",
    "measured_value": params_76,
    "expected_value": 200,
    "simulation_file": "sim_003_param_count.py",
})

with open("sim_003_results.json", "w") as f:
    json.dump(RESULTS, f, indent=2, default=str)

print(f"\nWrote {len(RESULTS)} results to sim_003_results.json")
