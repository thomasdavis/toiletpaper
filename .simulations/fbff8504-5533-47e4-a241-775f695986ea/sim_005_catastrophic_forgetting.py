"""
Simulation 005: Catastrophic Forgetting / Local Plasticity
Tests Claims: 67, 68, 69
KAN (spline locality) should retain performance on old data regions
when trained on new data in different regions. MLP should forget.
"""

import json
import torch
import torch.nn.functional as F
import numpy as np
from kan_module import KAN, MLP, train_model

torch.manual_seed(42)
np.random.seed(42)

RESULTS = []


def f_target(x):
    """1D target: sin(5x) + cos(3x)"""
    return torch.sin(5 * x) + torch.cos(3 * x)


def make_data_1d(x_min, x_max, n, seed=42):
    rng = np.random.RandomState(seed)
    x = rng.uniform(x_min, x_max, (n, 1)).astype(np.float32)
    x_t = torch.from_numpy(x)
    y_t = f_target(x_t[:, 0]).unsqueeze(-1)
    return x_t, y_t


# Phase 1: Train on region A = [0, 2]
# Phase 2: Train on region B = [4, 6]
# Test: Does model retain accuracy on region A?

N = 200
EPOCHS_PER_PHASE = 500

x_A_train, y_A_train = make_data_1d(0, 2, N, seed=42)
x_A_test, y_A_test = make_data_1d(0, 2, N, seed=100)
x_B_train, y_B_train = make_data_1d(4, 6, N, seed=43)
x_B_test, y_B_test = make_data_1d(4, 6, N, seed=101)

print("=== Catastrophic Forgetting Experiment ===\n")


def evaluate(model, x, y):
    model.eval()
    with torch.no_grad():
        pred = model(x)
        return torch.sqrt(F.mse_loss(pred, y)).item()


def run_forgetting_experiment(model_name, model):
    print(f"\n--- {model_name} ---")

    # Phase 1: Train on region A
    train_model(model, x_A_train, y_A_train, x_A_test, y_A_test,
                epochs=EPOCHS_PER_PHASE, lr=0.01)
    rmse_A_after_phase1 = evaluate(model, x_A_test, y_A_test)
    rmse_B_after_phase1 = evaluate(model, x_B_test, y_B_test)
    print(f"  After Phase 1 (train on A): RMSE_A={rmse_A_after_phase1:.4e}, "
          f"RMSE_B={rmse_B_after_phase1:.4e}")

    # Phase 2: Train on region B
    train_model(model, x_B_train, y_B_train, x_B_test, y_B_test,
                epochs=EPOCHS_PER_PHASE, lr=0.01)
    rmse_A_after_phase2 = evaluate(model, x_A_test, y_A_test)
    rmse_B_after_phase2 = evaluate(model, x_B_test, y_B_test)
    print(f"  After Phase 2 (train on B): RMSE_A={rmse_A_after_phase2:.4e}, "
          f"RMSE_B={rmse_B_after_phase2:.4e}")

    forgetting = rmse_A_after_phase2 / rmse_A_after_phase1 if rmse_A_after_phase1 > 0 else float("inf")
    print(f"  Forgetting ratio (A): {forgetting:.2f}x")

    return {
        "rmse_A_phase1": rmse_A_after_phase1,
        "rmse_B_phase1": rmse_B_after_phase1,
        "rmse_A_phase2": rmse_A_after_phase2,
        "rmse_B_phase2": rmse_B_after_phase2,
        "forgetting_ratio": forgetting,
    }


# KAN with wide grid range to cover both regions
kan = KAN([1, 5, 1], grid_size=20, spline_order=3, grid_range=(-1, 7))
kan_res = run_forgetting_experiment("KAN [1,5,1] G=20", kan)

# MLP with comparable parameters
mlp = MLP([1, 30, 30, 1], activation="relu")
mlp_res = run_forgetting_experiment("MLP [1,30,30,1]", mlp)

# Also test with SiLU activation for fairer comparison
mlp2 = MLP([1, 30, 30, 1], activation="silu")
mlp2_res = run_forgetting_experiment("MLP [1,30,30,1] SiLU", mlp2)

# Compare
kan_forgets_less = kan_res["forgetting_ratio"] < mlp_res["forgetting_ratio"]
kan_forgets_less2 = kan_res["forgetting_ratio"] < mlp2_res["forgetting_ratio"]

print(f"\n=== Summary ===")
print(f"  KAN forgetting ratio: {kan_res['forgetting_ratio']:.2f}x")
print(f"  MLP (ReLU) forgetting: {mlp_res['forgetting_ratio']:.2f}x")
print(f"  MLP (SiLU) forgetting: {mlp2_res['forgetting_ratio']:.2f}x")
print(f"  KAN forgets less: {kan_forgets_less and kan_forgets_less2}")

# Build results
RESULTS.append({
    "claim_index": 67,
    "claim_text": "KANs have local plasticity and can avoid catastrophic forgetting by leveraging the locality of splines.",
    "test_type": "comparative",
    "verdict": "reproduced" if kan_forgets_less else "fragile",
    "confidence": 0.8 if kan_forgets_less else 0.4,
    "reason": (f"KAN forgetting ratio={kan_res['forgetting_ratio']:.2f}x vs "
               f"MLP={mlp_res['forgetting_ratio']:.2f}x. "
               f"KAN {'retains' if kan_forgets_less else 'does not retain'} "
               f"old region better."),
    "measured_value": kan_res["forgetting_ratio"],
    "expected_value": "< MLP forgetting ratio",
    "simulation_file": "sim_005_catastrophic_forgetting.py",
    "baseline_result": f"MLP forgetting={mlp_res['forgetting_ratio']:.2f}x",
    "proposed_result": f"KAN forgetting={kan_res['forgetting_ratio']:.2f}x",
})

RESULTS.append({
    "claim_index": 68,
    "claim_text": "KAN only remodels regions where data is present, leaving previous regions unchanged.",
    "test_type": "comparative",
    "verdict": "reproduced" if kan_res["forgetting_ratio"] < 2.0 else "fragile",
    "confidence": 0.75 if kan_res["forgetting_ratio"] < 2.0 else 0.4,
    "reason": (f"KAN RMSE on region A: {kan_res['rmse_A_phase1']:.4e} (after phase 1) "
               f"→ {kan_res['rmse_A_phase2']:.4e} (after phase 2). "
               f"Forgetting ratio={kan_res['forgetting_ratio']:.2f}x. "
               f"{'Minimal' if kan_res['forgetting_ratio'] < 2.0 else 'Significant'} degradation."),
    "measured_value": kan_res["forgetting_ratio"],
    "expected_value": "~1.0 (no forgetting)",
    "simulation_file": "sim_005_catastrophic_forgetting.py",
})

RESULTS.append({
    "claim_index": 69,
    "claim_text": "MLPs remodel the whole region after seeing new data, leading to catastrophic forgetting.",
    "test_type": "comparative",
    "verdict": "reproduced" if mlp_res["forgetting_ratio"] > 2.0 else "fragile",
    "confidence": 0.8 if mlp_res["forgetting_ratio"] > 2.0 else 0.4,
    "reason": (f"MLP RMSE on region A: {mlp_res['rmse_A_phase1']:.4e} → "
               f"{mlp_res['rmse_A_phase2']:.4e}. "
               f"Forgetting ratio={mlp_res['forgetting_ratio']:.2f}x. "
               f"{'Significant' if mlp_res['forgetting_ratio'] > 2.0 else 'Mild'} forgetting."),
    "measured_value": mlp_res["forgetting_ratio"],
    "expected_value": ">> 1.0 (significant forgetting)",
    "simulation_file": "sim_005_catastrophic_forgetting.py",
})

with open("sim_005_results.json", "w") as f:
    json.dump(RESULTS, f, indent=2, default=str)

print(f"\nWrote {len(RESULTS)} results to sim_005_results.json")
