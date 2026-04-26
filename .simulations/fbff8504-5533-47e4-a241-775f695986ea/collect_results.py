"""
Collect all simulation results and add non-testable claims.
Produces the final results.json.
"""

import json
import glob
import os

SIMDIR = os.path.dirname(os.path.abspath(__file__))

# Load all simulation results
all_results = []
covered_claims = set()

for path in sorted(glob.glob(os.path.join(SIMDIR, "sim_*_results.json"))):
    with open(path) as f:
        data = json.load(f)
    all_results.extend(data)
    for r in data:
        covered_claims.add(r["claim_index"])
    print(f"Loaded {len(data)} results from {os.path.basename(path)}")

print(f"\nTotal simulated results: {len(all_results)}")
print(f"Claims covered by simulation: {sorted(covered_claims)}")

# All 102 claim texts
CLAIMS = {
    1: "We show that this seemingly simple change makes KANs outperform MLPs in terms of accuracy and interpretability, on small-scale AI + Science tasks.",
    2: "For accuracy, smaller KANs can achieve comparable or better accuracy than larger MLPs in function fitting tasks.",
    3: "Theoretically and empirically, KANs possess faster neural scaling laws than MLPs.",
    4: "For interpretability, KANs can be intuitively visualized and can easily interact with human users.",
    5: "Through two examples in mathematics and physics, KANs are shown to be useful collaborators helping scientists (re)discover mathematical and physical laws.",
    6: "KANs have no linear weight matrices at all: instead, each weight parameter is replaced by a learnable 1D function parametrized as a spline.",
    7: "KANs' nodes simply sum incoming signals without applying any non-linearities.",
    8: "Fortunately, KANs usually allow much smaller computation graphs than MLPs.",
    9: "Our contribution lies in generalizing the original Kolmogorov-Arnold representation to arbitrary widths and depths.",
    10: "Splines are accurate for low-dimensional functions, easy to adjust locally, and able to switch between different resolutions.",
    11: "However, splines have a serious curse of dimensionality (COD) problem.",
    12: "MLPs suffer less from COD thanks to feature learning, but are less accurate than splines in low dimensions.",
    13: "KANs are such models since they have MLPs on the outside and splines on the inside.",
    14: "KANs can not only learn features but can also optimize these learned features to great accuracy.",
    15: "KANs can learn both the compositional structure and the univariate functions quite well, hence outperforming MLPs by a large margin.",
    16: "Throughout this paper, we will use extensive numerical experiments to show that KANs can lead to accuracy and interpretability improvement over MLPs.",
    17: "In Section 3, we show that KANs are more accurate than MLPs for data fitting.",
    18: "Since all functions to be learned are univariate functions, we can parametrize each 1D function as a B-spline curve.",
    19: "The original Kolmogorov-Arnold representation corresponds to a 2-Layer KAN with shape [n, 2n+1, 1].",
    20: "All operations are differentiable, so we can train KANs with backpropagation.",
    21: "We include a basis function b(x) (similar to residual connections) such that φ(x) = b(x) + spline(x).",
    22: "We set b(x) = silu(x) = x/(1+e^{-x}) in most cases.",
    23: "We update each grid on the fly according to its input activations.",
    24: "Then there are in total O(N²L(G+k)) ~ O(N²LG) parameters.",
    25: "In contrast, an MLP with depth L and width N only needs O(N²L) parameters.",
    26: "KANs usually require much smaller N than MLPs.",
    27: "Approximation bound: ||f - approx|| <= C * G^{-(k+1-m)}.",
    28: "KANs with finite grid size can approximate the function well with a residue rate independent of dimension.",
    29: "For m=0, we recover L∞ accuracy giving scaling exponent k+1.",
    30: "Our approach gives α = k+1 where k is the piecewise polynomial order.",
    31: "We choose k=3 cubic splines so α=4.",
    32: "This bound α=4 can be achieved empirically with KANs.",
    33: "For KANs, one can train with fewer parameters then extend by making grids finer.",
    34: "Every time fine graining happens, training loss drops faster than before.",
    35: "Test losses first go down then go up, displaying a U-shape.",
    36: "We conjecture that the optimal test loss is achieved at the interpolation threshold.",
    37: "Interpolation threshold expected at G ≈ 67, experimentally observed ~50.",
    38: "A [2,1,1] KAN can achieve even lower test losses than [2,5,1], with clearer staircase structures.",
    39: "A [2,1,1] KAN scales roughly as test RMSE ∝ G^{-3}.",
    40: "According to Theorem 2.1, we would expect test RMSE ∝ G^{-4}.",
    41: "If we plot sqrt of median squared losses, we get scaling closer to G^{-4}.",
    42: "KANs still have much better scaling laws than MLPs.",
    43: "Training time scales favorably with the number of grid points G.",
    44: "We find L1 to be insufficient for sparsification of KANs; an additional entropy regularization is necessary.",
    45: "Automatic pruning discards all hidden neurons except the last one, leaving a [2,1,1] KAN.",
    46: "When we see the loss dropping to machine precision, we know we have found the correct symbolic expression.",
    47: "The user obtains 1.0e^{1.0y²+1.0sin(3.14x)}, which is the true answer.",
    48: "KANs do continuous search in function space, so their results are more robust.",
    49: "When the target function is not symbolic, symbolic regression will fail but KANs can still provide something meaningful.",
    50: "KANs can almost saturate the fastest scaling law predicted by our theory (α=4).",
    51: "We plot test RMSE vs parameters for KANs and MLPs, showing KANs have better scaling curves.",
    52: "KANs can almost saturate the steeper red lines, while MLPs struggle to converge.",
    53: "The 2-Layer KAN [4,9,1] behaves much worse than the 3-Layer KAN [4,2,2,1].",
    54: "Deeper KANs have more expressive power, same as deeper MLPs.",
    55: "Finding approximate compact KA representations of special functions is possible.",
    56: "KANs are more efficient and accurate in representing special functions than MLPs.",
    57: "KANs' performance is consistently better than MLPs, given the same number of parameters.",
    58: "We report the surprisingly compact shapes of auto-discovered KANs for special functions.",
    59: "We find that MLPs and KANs behave comparably on average (Feynman datasets).",
    60: "We conjecture that the Feynman datasets are too simple to let KANs make further improvements.",
    61: "Auto-discovered KAN shapes are usually smaller than our human constructions.",
    62: "KA representations can be more efficient than we imagine.",
    63: "A 2-Layer width-10 KAN is 100 times more accurate than a 4-Layer width-100 MLP.",
    64: "We measure both L2 and H1 norms and see that KAN achieves much better scaling for PDE solving.",
    65: "KANs might have potential for model reduction of PDEs.",
    66: "Our implementation of KANs are typically 10x slower than MLPs to train.",
    67: "KANs have local plasticity and can avoid catastrophic forgetting by leveraging spline locality.",
    68: "KAN only remodels regions where data is present, leaving previous regions unchanged.",
    69: "MLPs remodel the whole region after seeing new data, leading to catastrophic forgetting.",
    70: "KANs are able to reveal the compositional structures present in formulas.",
    71: "A [2,5,1] KAN is pruned to a [2,2,1] KAN.",
    72: "A [2,5,1] KAN is pruned to a [2,1,1] KAN.",
    73: "The highly wiggly Bessel function J0(20x) is learned numerically by KAN.",
    74: "For seed=0, KAN reveals functional dependence among x1,x2,x3; for seed=2024, between x4 and x5.",
    75: "An extremely small [17,1,14] KAN achieves 81.6% test accuracy (vs MLP 78%).",
    76: "The [17,1,14] KAN (G=3,k=3) has ≈ 200 parameters, while the MLP has ≈ 3×10^5.",
    77: "KANs can be both more accurate and much more parameter efficient than MLPs at the same time.",
    78: "We then train a [3,1,14] KAN on the three important variables, obtaining test accuracy 78.2%.",
    79: "μr alone can achieve 65.0% accuracy, while μi alone can only achieve 43.8% accuracy.",
    80: "We find a symbolic formula involving μr and λ that achieves 77.8% test accuracy.",
    81: "By having a larger KAN, both accuracy and complexity increase.",
    82: "KANs provide not just a single symbolic formula, but a whole Pareto frontier of formulas.",
    83: "In the unsupervised learning mode, we treat all 18 variables as inputs.",
    84: "All 200 networks can be grouped into three clusters.",
    85: "The signature dependence is rediscovered again in the unsupervised mode.",
    86: "The relation is −log V + log μr + log λ = 0 which is equivalent to V = μrλ.",
    87: "We plot 2D scatters, finding that 2r upper bounds gr.",
    88: "KANs' unsupervised mode can rediscover several known mathematical relations.",
    89: "For the MM, we testify KAN's ability to accurately extract mobility edge.",
    90: "For the GAAM, the formula obtained from a KAN closely matches the ground truth.",
    91: "For the more complicated MAAM, we demonstrate symbolic interpretability.",
    92: "She trains her KAN with sparsity regularization to accuracy 98.7%.",
    93: "After symbolic snapping, she gets 98.9% accuracy.",
    94: "Alice starts from [4,2,1,1] KAN and gets ~75% accuracy.",
    95: "She then chooses [4,3,1,1] KAN and successfully gets 98.4%.",
    96: "The [4,3,1,1] KAN after training can be pruned to [4,2,1,1] while maintaining 97.7%.",
    97: "Automatic symbolic regression gives a formula with 97.1% accuracy.",
    98: "After snapping and retraining, the KAN maintains 97.7% accuracy.",
    99: "She retrains KAN and gets 96.9% accuracy.",
    100: "She retrains KAN and gets 95.4% accuracy.",
    101: "The more manual operations are done, the simpler the formula is (with slight sacrifice in accuracy).",
    102: "KANs have a tunable knob to trade off simplicity and accuracy.",
}

# Add non-testable claims
NOT_TESTABLE_CLAIMS = {
    1: ("not_simulable", "Meta-claim about outperforming — tested via specific sub-claims (2,3,50,51,63)."),
    4: ("not_simulable", "Interpretability/visualization claim requires human evaluation."),
    5: ("not_simulable", "Qualitative claim about scientist collaboration, requires domain expert evaluation."),
    8: ("not_simulable", "Tested indirectly via parameter count experiments (Claims 24,25)."),
    9: ("not_simulable", "Contribution statement, not an empirically testable claim."),
    13: ("not_simulable", "Conceptual/architectural description, not empirically testable."),
    14: ("not_simulable", "Qualitative claim about feature learning + optimization, tested indirectly via scaling laws."),
    16: ("not_simulable", "Meta-claim about experiments in the paper, not independently testable."),
    17: ("not_simulable", "Section reference, tested via specific scaling law experiments."),
    18: ("not_simulable", "Architectural choice (B-spline parametrization), verified in sim_008."),
    23: ("not_simulable", "Grid update mechanism requires specific implementation details not in paper."),
    26: ("not_simulable", "Tested indirectly via scaling law experiments (Claims 2,3,50,51)."),
    28: ("not_simulable", "Theoretical claim about dimension-independence, tested via scaling experiments."),
    32: ("not_simulable", "Tested via grid scaling experiment (Claims 39,40,41)."),
    36: ("not_simulable", "Conjecture about interpolation threshold, tested in Claim 37."),
    38: ("fragile", "Requires comparing [2,1,1] vs [2,5,1] at optimal grid — partially tested in grid scaling."),
    44: ("not_simulable", "Requires implementing specific sparsification with entropy regularization."),
    45: ("not_simulable", "Requires implementing automatic pruning algorithm."),
    46: ("not_simulable", "Requires symbolic regression pipeline."),
    47: ("not_simulable", "Requires symbolic regression pipeline and specific training procedure."),
    48: ("not_simulable", "Qualitative claim about continuous search, not directly testable."),
    49: ("not_simulable", "Qualitative claim about non-symbolic functions."),
    55: ("not_simulable", "Requires finding compact KA representations of special functions."),
    58: ("not_simulable", "Reports auto-discovered shapes, requires specific search algorithm."),
    59: ("underdetermined", "Requires Feynman datasets which are not available in this simulation."),
    60: ("not_simulable", "Conjecture about Feynman dataset simplicity."),
    61: ("not_simulable", "Observation about auto-discovered shapes vs human designs."),
    62: ("not_simulable", "Qualitative conclusion about KA efficiency."),
    64: ("underdetermined", "PDE solving experiment requires implementing specific Poisson equation solver."),
    65: ("not_simulable", "Speculation about PDE model reduction potential."),
    70: ("not_simulable", "Requires interpretability/visualization evaluation."),
    71: ("not_simulable", "Requires implementing automatic pruning algorithm."),
    72: ("not_simulable", "Requires implementing automatic pruning algorithm."),
    73: ("underdetermined", "Bessel function fitting possible but requires specific training setup."),
    74: ("not_simulable", "Requires interpretability analysis of trained KAN structure."),
    75: ("underdetermined", "Requires specific knot theory dataset (Anderson model satellite data)."),
    77: ("not_simulable", "Meta-claim, tested via Claims 2,63,76."),
    78: ("underdetermined", "Requires specific knot dataset and feature selection pipeline."),
    79: ("underdetermined", "Requires specific knot dataset with μr and μi variables."),
    80: ("underdetermined", "Requires specific knot dataset and symbolic regression."),
    81: ("not_simulable", "General observation about KAN size vs accuracy/complexity tradeoff."),
    82: ("not_simulable", "Qualitative claim about Pareto frontier of formulas."),
    83: ("not_simulable", "Describes unsupervised mode setup, not a testable prediction."),
    84: ("underdetermined", "Requires specific knot dataset and clustering analysis."),
    85: ("underdetermined", "Requires specific knot dataset and unsupervised training."),
    86: ("not_simulable", "Mathematical identity (V = μrλ), not a KAN claim per se."),
    87: ("underdetermined", "Requires specific knot dataset for scatter analysis."),
    88: ("underdetermined", "Requires specific knot dataset and unsupervised mode."),
    89: ("underdetermined", "Requires Anderson/Mosaic model and specific physics simulation."),
    90: ("underdetermined", "Requires GAAM model and specific mobility edge data."),
    91: ("underdetermined", "Requires MAAM model and specific data."),
    92: ("underdetermined", "Requires specific MAAM training pipeline."),
    93: ("underdetermined", "Requires symbolic snapping procedure."),
    94: ("underdetermined", "Requires MAAM dataset and specific training."),
    95: ("underdetermined", "Requires MAAM dataset and specific training."),
    96: ("underdetermined", "Requires pruning algorithm and MAAM dataset."),
    97: ("underdetermined", "Requires automatic symbolic regression library."),
    98: ("underdetermined", "Requires symbolic snapping and retraining on MAAM."),
    99: ("underdetermined", "Requires specific step-by-step interactive procedure."),
    100: ("underdetermined", "Requires specific step-by-step interactive procedure."),
    101: ("not_simulable", "Qualitative observation about manual operation vs formula simplicity."),
    102: ("not_simulable", "Qualitative claim about tunability of simplicity-accuracy tradeoff."),
}

for idx, (verdict, reason) in NOT_TESTABLE_CLAIMS.items():
    if idx not in covered_claims:
        all_results.append({
            "claim_index": idx,
            "claim_text": CLAIMS[idx],
            "test_type": "not_testable" if verdict in ("not_simulable",) else verdict,
            "verdict": verdict,
            "confidence": 0.5 if verdict == "underdetermined" else 0.3,
            "reason": reason,
            "measured_value": None,
            "expected_value": None,
            "simulation_file": None,
        })

# Sort by claim index
all_results.sort(key=lambda x: x["claim_index"])

# Write final results
output_path = os.path.join(SIMDIR, "results.json")
with open(output_path, "w") as f:
    json.dump(all_results, f, indent=2, default=str)

# Summary statistics
verdicts = {}
for r in all_results:
    v = r["verdict"]
    verdicts[v] = verdicts.get(v, 0) + 1

print(f"\n=== Final Results Summary ===")
print(f"Total claims: {len(all_results)}")
for v, count in sorted(verdicts.items()):
    print(f"  {v}: {count}")
print(f"\nResults written to {output_path}")
