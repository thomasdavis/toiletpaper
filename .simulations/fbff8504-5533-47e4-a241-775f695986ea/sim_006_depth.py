"""
Simulation 006: Depth Comparison
Tests Claims: 53, 54
Claim: [4,2,2,1] (3-layer) KAN much better than [4,9,1] (2-layer) on 4D compositional function.
Deeper KANs have more expressive power.
"""

import json
import torch
import numpy as np
from kan_module import KAN, MLP, generate_data, train_model

torch.manual_seed(42)
np.random.seed(42)

RESULTS = []


def f_4d(x):
    """f(x1..x4) = exp(sin(x1²+x2²) + sin(x3²+x4²)) — compositional structure."""
    return torch.exp(
        torch.sin(x[:, 0] ** 2 + x[:, 1] ** 2)
        + torch.sin(x[:, 2] ** 2 + x[:, 3] ** 2)
    )


N_TRAIN = 2000
N_TEST = 500
EPOCHS = 800

x_train, y_train = generate_data(f_4d, 4, N_TRAIN, seed=42)
x_test, y_test = generate_data(f_4d, 4, N_TEST, seed=123)

print("=== Depth Comparison: Shallow vs Deep KAN ===\n")

configs = [
    ("KAN [4,9,1] G=5", [4, 9, 1], 5),
    ("KAN [4,9,1] G=10", [4, 9, 1], 10),
    ("KAN [4,2,2,1] G=5", [4, 2, 2, 1], 5),
    ("KAN [4,2,2,1] G=10", [4, 2, 2, 1], 10),
    ("KAN [4,3,3,1] G=5", [4, 3, 3, 1], 5),
]

results_by_config = {}
for name, shape, G in configs:
    torch.manual_seed(42)
    model = KAN(shape, grid_size=G, spline_order=3, grid_range=(-1, 1))
    n_params = model.count_params()
    print(f"  {name}: {n_params} params ...", end=" ", flush=True)
    res = train_model(model, x_train, y_train, x_test, y_test,
                      epochs=EPOCHS, lr=0.005)
    print(f"test_rmse={res['test_rmse']:.4e}")
    results_by_config[name] = {"params": n_params, "test_rmse": res["test_rmse"]}

# Also compare with MLPs
mlp_configs = [
    ("MLP [4,50,50,1]", [4, 50, 50, 1]),
    ("MLP [4,100,1]", [4, 100, 1]),
    ("MLP [4,100,100,1]", [4, 100, 100, 1]),
]

for name, shape in mlp_configs:
    torch.manual_seed(42)
    model = MLP(shape, activation="relu")
    n_params = model.count_params()
    print(f"  {name}: {n_params} params ...", end=" ", flush=True)
    res = train_model(model, x_train, y_train, x_test, y_test,
                      epochs=EPOCHS, lr=0.005)
    print(f"test_rmse={res['test_rmse']:.4e}")
    results_by_config[name] = {"params": n_params, "test_rmse": res["test_rmse"]}

# Compare 2-layer vs 3-layer KAN
shallow_best = min(
    results_by_config["KAN [4,9,1] G=5"]["test_rmse"],
    results_by_config["KAN [4,9,1] G=10"]["test_rmse"],
)
deep_best = min(
    results_by_config["KAN [4,2,2,1] G=5"]["test_rmse"],
    results_by_config["KAN [4,2,2,1] G=10"]["test_rmse"],
    results_by_config["KAN [4,3,3,1] G=5"]["test_rmse"],
)

deep_better = deep_best < shallow_best
ratio = shallow_best / deep_best if deep_best > 0 else float("inf")

print(f"\n  2-Layer best RMSE: {shallow_best:.4e}")
print(f"  3-Layer best RMSE: {deep_best:.4e}")
print(f"  Improvement ratio: {ratio:.2f}x")
print(f"  Deeper is better: {deep_better}")

# Claim 53
RESULTS.append({
    "claim_index": 53,
    "claim_text": "For the 4D example, the 2-Layer KAN [4,9,1] behaves much worse than the 3-Layer KAN [4,2,2,1].",
    "test_type": "comparative",
    "verdict": "reproduced" if deep_better else "contradicted",
    "confidence": 0.85 if deep_better else 0.4,
    "reason": (f"3-Layer KAN RMSE={deep_best:.4e} vs "
               f"2-Layer KAN RMSE={shallow_best:.4e}. "
               f"Improvement ratio: {ratio:.2f}x."),
    "measured_value": {"shallow": shallow_best, "deep": deep_best, "ratio": ratio},
    "expected_value": "deep << shallow",
    "simulation_file": "sim_006_depth.py",
    "baseline_result": f"2-Layer RMSE={shallow_best:.4e}",
    "proposed_result": f"3-Layer RMSE={deep_best:.4e}",
})

# Claim 54: deeper KANs more expressive (same as MLPs)
mlp_shallow = results_by_config["MLP [4,100,1]"]["test_rmse"]
mlp_deep = results_by_config["MLP [4,100,100,1]"]["test_rmse"]
mlp_deep_better = mlp_deep < mlp_shallow

RESULTS.append({
    "claim_index": 54,
    "claim_text": "Deeper KANs have more expressive power, same as deeper MLPs.",
    "test_type": "comparative",
    "verdict": "reproduced" if (deep_better and mlp_deep_better) else "fragile",
    "confidence": 0.8 if (deep_better and mlp_deep_better) else 0.5,
    "reason": (f"KAN: 3-layer={deep_best:.4e} vs 2-layer={shallow_best:.4e}; "
               f"MLP: deep={mlp_deep:.4e} vs shallow={mlp_shallow:.4e}. "
               f"Deeper better for both: KAN={deep_better}, MLP={mlp_deep_better}."),
    "measured_value": {"kan_ratio": ratio, "mlp_ratio": mlp_shallow / mlp_deep if mlp_deep > 0 else 0},
    "expected_value": "deeper > shallower for both",
    "simulation_file": "sim_006_depth.py",
})

with open("sim_006_results.json", "w") as f:
    json.dump(RESULTS, f, indent=2, default=str)

print(f"\nWrote {len(RESULTS)} results to sim_006_results.json")
