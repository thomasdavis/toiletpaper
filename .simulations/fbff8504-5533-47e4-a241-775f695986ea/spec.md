# Simulation Spec: KAN: Kolmogorov–Arnold Networks

**Paper ID:** fbff8504-5533-47e4-a241-775f695986ea
**Authors:** Ziming Liu, Yixuan Wang, Sachin Vaidya, Fabian Ruehle, James Halverson, Marin Soljačić, Thomas Y. Hou, Max Tegmark
**Abstract:** Inspired by the Kolmogorov-Arnold representation theorem, we propose Kolmogorov-Arnold Networks (KANs) as promising alternatives to Multi-Layer Perceptrons (MLPs). While MLPs have fixed activation functions on nodes (“neurons”), KANs have learnable activation functions on edges (“weights”). KANs have no linear weights at all – every weight parameter is replaced by a univariate function parametrized as a spline. We show that this seemingly simple change makes KANs outperform MLPs in terms of accu

## Claims to Test

### Claim 1 (unknown)

**Text:** We show that this seemingly simple change makes KANs outperform MLPs in terms of accuracy and interpretability, on small-scale AI + Science tasks.

**Confidence:** 0.99
**Donto IRI:** none

### Claim 2 (unknown)

**Text:** For accuracy, smaller KANs can achieve comparable or better accuracy than larger MLPs in function fitting tasks.

**Confidence:** 0.98
**Donto IRI:** none

### Claim 3 (unknown)

**Text:** Theoretically and empirically, KANs possess faster neural scaling laws than MLPs.

**Confidence:** 0.99
**Donto IRI:** none

### Claim 4 (unknown)

**Text:** For interpretability, KANs can be intuitively visualized and can easily interact with human users.

**Confidence:** 0.95
**Donto IRI:** none

### Claim 5 (unknown)

**Text:** Through two examples in mathematics and physics, KANs are shown to be useful “collaborators” helping scientists (re)discover mathematical and physical laws.

**Confidence:** 0.93
**Donto IRI:** none

### Claim 6 (unknown)

**Text:** KANs have no linear weight matrices at all: instead, each weight parameter is replaced by a learnable 1D function parametrized as a spline.

**Confidence:** 0.99
**Donto IRI:** none

### Claim 7 (unknown)

**Text:** KANs’ nodes simply sum incoming signals without applying any non-linearities.

**Confidence:** 0.99
**Donto IRI:** none

### Claim 8 (unknown)

**Text:** Fortunately, KANs usually allow much smaller computation graphs than MLPs.

**Confidence:** 0.9
**Donto IRI:** none

### Claim 9 (unknown)

**Text:** Our contribution lies in generalizing the original Kolmogorov-Arnold representation to arbitrary widths and depths, revitalizing and contextualizing it in today’s deep learning world, as well as using extensive empirical experiments to highlight its potential for AI + Science due to its accuracy and interpretability.

**Confidence:** 0.95
**Donto IRI:** none

### Claim 10 (unknown)

**Text:** Splines are accurate for low-dimensional functions, easy to adjust locally, and able to switch between different resolutions.

**Confidence:** 0.86
**Donto IRI:** none

### Claim 11 (unknown)

**Text:** However, splines have a serious curse of dimensionality (COD) problem, because of their inability to exploit compositional structures.

**Confidence:** 0.93
**Donto IRI:** none

### Claim 12 (unknown)

**Text:** MLPs, on the other hand, suffer less from COD thanks to their feature learning, but are less accurate than splines in low dimensions, because of their inability to optimize univariate functions.

**Confidence:** 0.88
**Donto IRI:** none

### Claim 13 (unknown)

**Text:** KANs are such models since they have MLPs on the outside and splines on the inside.

**Confidence:** 0.9
**Donto IRI:** none

### Claim 14 (unknown)

**Text:** As a result, KANs can not only learn features (thanks to their external similarity to MLPs), but can also optimize these learned features to great accuracy (thanks to their internal similarity to splines).

**Confidence:** 0.9
**Donto IRI:** none

### Claim 15 (unknown)

**Text:** In contrast, KANs can learn both the compositional structure and the univariate functions quite well, hence outperforming MLPs by a large margin (see Figure 3.1).

**Confidence:** 0.97
**Donto IRI:** none

### Claim 16 (unknown)

**Text:** Throughout this paper, we will use extensive numerical experiments to show that KANs can lead to accuracy and interpretability improvement over MLPs, at least on small-scale AI + Science tasks.

**Confidence:** 0.96
**Donto IRI:** none

### Claim 17 (unknown)

**Text:** In Section 3, we show that KANs are more accurate than MLPs for data fitting: KANs can beat the curse of dimensionality when there is a compositional structure in data, achieving better scaling laws than MLPs.

**Confidence:** 0.98
**Donto IRI:** none

### Claim 18 (unknown)

**Text:** Since all functions to be learned are univariate functions, we can parametrize each 1D function as a B-spline curve, with learnable coefficients of local B-spline basis functions.

**Confidence:** 0.98
**Donto IRI:** none

### Claim 19 (unknown)

**Text:** The original Kolmogorov-Arnold representation Eq. (2.1) corresponds to a 2-Layer KAN with shape [n, 2n + 1, 1].

**Confidence:** 0.99
**Donto IRI:** none

### Claim 20 (unknown)

**Text:** Notice that all the operations are differentiable, so we can train KANs with back propagation.

**Confidence:** 0.99
**Donto IRI:** none

### Claim 21 (unknown)

**Text:** We include a basis function b(x) (similar to residual connections) such that the activation function φ(x) is the sum of the basis function b(x) and the spline function.

**Confidence:** 0.98
**Donto IRI:** none

### Claim 22 (unknown)

**Text:** We set b(x) = silu(x) = x/(1 + e−x) in most cases.

**Confidence:** 0.99
**Donto IRI:** none

### Claim 23 (unknown)

**Text:** We update each grid on the fly according to its input activations, to address the issue that splines are defined on bounded regions but activation values can evolve out of the fixed region during training.

**Confidence:** 0.97
**Donto IRI:** none

### Claim 24 (unknown)

**Text:** Then there are in total O(N^2 L(G + k)) ∼ O(N^2LG) parameters.

**Confidence:** 0.97
**Donto IRI:** none

### Claim 25 (unknown)

**Text:** In contrast, an MLP with depth L and width N only needs O(N^2L) parameters, which appears to be more efficient than KAN.

**Confidence:** 0.96
**Donto IRI:** none

### Claim 26 (unknown)

**Text:** Fortunately, KANs usually require much smaller N than MLPs, which not only saves parameters, but also achieves better generalization (see e.g., Figure 3.1 and 3.3) and facilitates interpretability.

**Confidence:** 0.96
**Donto IRI:** none

### Claim 27 (unknown)

**Text:** Then there exists a constant C depending on f and its representation, such that we have the following approximation bound in terms of the grid size G: there exist k-th order B-spline functions Φ^G_l,i,j such that for any 0≤m≤k, we have the bound ||f−(Φ^G_{L−1}◦...◦Φ^G_0)x||_{C^m} ≤ C G^{−k−1+m}.

**Confidence:** 0.99
**Donto IRI:** none

### Claim 28 (unknown)

**Text:** We know that asymptotically, provided that the assumption in Theorem 2.1 holds, KANs with finite grid size can approximate the function well with a residue rate independent of the dimension, hence beating curse of dimensionality!

**Confidence:** 0.97
**Donto IRI:** none

### Claim 29 (unknown)

**Text:** In particular, for m = 0, we recover the accuracy in L∞ norm, which in turn provides a bound of RMSE on the finite domain, which gives a scaling exponent k + 1.

**Confidence:** 0.97
**Donto IRI:** none

### Claim 30 (unknown)

**Text:** Our approach, which assumes the existence of smooth Kolmogorov-Arnold representations, decomposes the high-dimensional function into several 1D functions, giving α = k + 1 (where k is the piecewise polynomial order of the splines).

**Confidence:** 0.98
**Donto IRI:** none

### Claim 31 (unknown)

**Text:** We choose k = 3 cubic splines so α = 4 which is the largest and best scaling exponent compared to other works.

**Confidence:** 0.96
**Donto IRI:** none

### Claim 32 (unknown)

**Text:** We will show in Section 3.1 that this bound α = 4 can in fact be achieved empirically with KANs, while previous work [25] reported that MLPs have problems even saturating slower bounds (e.g., α = 1) and plateau quickly.

**Confidence:** 0.95
**Donto IRI:** none

### Claim 33 (unknown)

**Text:** By contrast, for KANs, one can first train a KAN with fewer parameters and then extend it to a KAN with more parameters by simply making its spline grids finer, without the need to retraining the larger model from scratch.

**Confidence:** 0.97
**Donto IRI:** none

### Claim 34 (unknown)

**Text:** It is clear that every time fine graining happens, the training loss drops faster than before (except for the finest grid with 1000 points, where optimization ceases to work probably due to bad loss landscapes).

**Confidence:** 0.95
**Donto IRI:** none

### Claim 35 (unknown)

**Text:** However, the test losses first go down then go up, displaying a U-shape, due to the bias-variance tradeoff (underfitting vs. overfitting).

**Confidence:** 0.94
**Donto IRI:** none

### Claim 36 (unknown)

**Text:** We conjecture that the optimal test loss is achieved at the interpolation threshold when the number of parameters match the number of data points.

**Confidence:** 0.82
**Donto IRI:** none

### Claim 37 (unknown)

**Text:** Since our training samples are 1000 and the total parameters of a [2,5,1] KAN is 15G (G is the number of grid intervals), we expect the interpolation threshold to be G = 1000/15 ≈ 67, which roughly agrees with our experimentally observed value G ∼ 50.

**Confidence:** 0.96
**Donto IRI:** none

### Claim 38 (unknown)

**Text:** Interestingly, it can achieve even lower test losses than the [2,5,1] KAN, with clearer staircase structures and the interpolation threshold is delayed to a larger grid size as a result of fewer parameters.

**Confidence:** 0.95
**Donto IRI:** none

### Claim 39 (unknown)

**Text:** In Figure 2.3 (bottom left), a [2,1,1] KAN scales roughly as test RMSE ∝ G−3.

**Confidence:** 0.97
**Donto IRI:** none

### Claim 40 (unknown)

**Text:** However, according to the Theorem 2.1, we would expect test RMSE ∝ G−4.

**Confidence:** 0.98
**Donto IRI:** none

### Claim 41 (unknown)

**Text:** If we plot the square root of the median (not mean) of the squared losses, we get a scaling closer to G−4.

**Confidence:** 0.95
**Donto IRI:** none

### Claim 42 (unknown)

**Text:** Despite this suboptimality (probably due to optimization), KANs still have much better scaling laws than MLPs, for data fitting (Figure 3.1) and PDE solving (Figure 3.3).

**Confidence:** 0.97
**Donto IRI:** none

### Claim 43 (unknown)

**Text:** In addition, the training time scales favorably with the number of grid points G, shown in Figure 2.3 bottom right.

**Confidence:** 0.9
**Donto IRI:** none

### Claim 44 (unknown)

**Text:** We find L1 to be insufficient for sparsification of KANs; instead an additional entropy regularization is necessary.

**Confidence:** 0.93
**Donto IRI:** none

### Claim 45 (unknown)

**Text:** Automatic pruning is seen to discard all hidden neurons except the last one, leaving a [2,1,1] KAN.

**Confidence:** 0.96
**Donto IRI:** none

### Claim 46 (unknown)

**Text:** When we see the loss dropping to machine precision, we know that we have found the correct symbolic expression.

**Confidence:** 0.88
**Donto IRI:** none

### Claim 47 (unknown)

**Text:** The user obtains 1.0e^(1.0y^2+1.0sin(3.14x)), which is the true answer (we only displayed two decimals for π).

**Confidence:** 0.97
**Donto IRI:** none

### Claim 48 (unknown)

**Text:** In contrast, KANs do continuous search (with gradient descent) in function space, so their results are more continuous and hence more robust.

**Confidence:** 0.86
**Donto IRI:** none

### Claim 49 (unknown)

**Text:** More generally, when the target function is not symbolic, symbolic regression will fail but KANs can still provide something meaningful.

**Confidence:** 0.9
**Donto IRI:** none

### Claim 50 (unknown)

**Text:** KANs can almost saturate the fastest scaling law predicted by our theory (α = 4), while MLPs scales slowly and plateau quickly.

**Confidence:** 0.99
**Donto IRI:** none

### Claim 51 (unknown)

**Text:** We plot test RMSE as a function of the number of parameters for KANs and MLPs in Figure 3.1, showing that KANs have better scaling curves than MLPs, especially for the high-dimensional example.

**Confidence:** 0.98
**Donto IRI:** none

### Claim 52 (unknown)

**Text:** KANs can almost saturate the steeper red lines, while MLPs struggle to converge even as fast as the slower black lines and plateau quickly.

**Confidence:** 0.97
**Donto IRI:** none

### Claim 53 (unknown)

**Text:** We also note that for the last example, the 2-Layer KAN [4,9,1] behaves much worse than the 3-Layer KAN (shape [4,2,2,1]).

**Confidence:** 0.97
**Donto IRI:** none

### Claim 54 (unknown)

**Text:** This highlights the greater expressive power of deeper KANs, which is the same for MLPs: deeper MLPs have more expressive power than shallower ones.

**Confidence:** 0.92
**Donto IRI:** none

### Claim 55 (unknown)

**Text:** Finding (approximate) compact KA representations of special functions is possible, revealing novel mathematical properties of special functions from the perspective of Kolmogorov-Arnold representations.

**Confidence:** 0.9
**Donto IRI:** none

### Claim 56 (unknown)

**Text:** KANs are more efficient and accurate in representing special functions than MLPs.

**Confidence:** 0.98
**Donto IRI:** none

### Claim 57 (unknown)

**Text:** KANs’ performance is shown to be consistently better than MLPs, i.e., KANs can achieve lower training/test losses than MLPs, given the same number of parameters.

**Confidence:** 0.99
**Donto IRI:** none

### Claim 58 (unknown)

**Text:** Moreover, we report the (surprisingly compact) shapes of our auto-discovered KANs for special functions in Table 1.

**Confidence:** 0.9
**Donto IRI:** none

### Claim 59 (unknown)

**Text:** We find that MLPs and KANs behave comparably on average.

**Confidence:** 0.9
**Donto IRI:** none

### Claim 60 (unknown)

**Text:** We conjecture that the Feynman datasets are too simple to let KANs make further improvements, in the sense that variable dependence is usually smooth or monotonic, which is in contrast to the complexity of special functions which often demonstrate oscillatory behavior.

**Confidence:** 0.82
**Donto IRI:** none

### Claim 61 (unknown)

**Text:** It is interesting to observe that auto-discovered KAN shapes (for both minimal and best) are usually smaller than our human constructions.

**Confidence:** 0.96
**Donto IRI:** none

### Claim 62 (unknown)

**Text:** This means that KA representations can be more efficient than we imagine.

**Confidence:** 0.86
**Donto IRI:** none

### Claim 63 (unknown)

**Text:** A 2-Layer width-10 KAN is 100 times more accurate than a 4-Layer width-100 MLP (10−7 vs 10−5 MSE) and 100 times more parameter efficient (10^2 vs 10^4 parameters).

**Confidence:** 0.99
**Donto IRI:** none

### Claim 64 (unknown)

**Text:** We measure both the error in the L2 norm and energy (H1) norm and see that KAN achieves a much better scaling law with a smaller error, using smaller networks and fewer parameters; see Figure 3.3.

**Confidence:** 0.98
**Donto IRI:** none

### Claim 65 (unknown)

**Text:** Therefore we speculate that KANs might have the potential of serving as a good neural network representation for model reduction of PDEs.

**Confidence:** 0.8
**Donto IRI:** none

### Claim 66 (unknown)

**Text:** However, we want to note that our implementation of KANs are typically 10x slower than MLPs to train.

**Confidence:** 0.97
**Donto IRI:** none

### Claim 67 (unknown)

**Text:** We show that KANs have local plasticity and can avoid catastrophic forgetting by leveraging the locality of splines.

**Confidence:** 0.96
**Donto IRI:** none

### Claim 68 (unknown)

**Text:** As expected, KAN only remodels regions where data is present on in the current phase, leaving previous regions unchanged.

**Confidence:** 0.95
**Donto IRI:** none

### Claim 69 (unknown)

**Text:** By contrast, MLPs remodels the whole region after seeing new data samples, leading to catastrophic forgetting.

**Confidence:** 0.96
**Donto IRI:** none

### Claim 70 (unknown)

**Text:** KANs are able to reveal the compositional structures present in these formulas, as well as learn the correct univariate functions.

**Confidence:** 0.97
**Donto IRI:** none

### Claim 71 (unknown)

**Text:** A [2,5,1] KAN is pruned to a [2,2,1] KAN.

**Confidence:** 0.97
**Donto IRI:** none

### Claim 72 (unknown)

**Text:** A [2,5,1] KAN is pruned to a [2,1,1] KAN.

**Confidence:** 0.97
**Donto IRI:** none

### Claim 73 (unknown)

**Text:** The highly wiggly Bessel function J0(20x) is learned (numerically) by KAN.

**Confidence:** 0.94
**Donto IRI:** none

### Claim 74 (unknown)

**Text:** We show that for seed = 0, KAN reveals the functional dependence among x1, x2, and x3; for another seed = 2024, KAN reveals the functional dependence between x4 and x5.

**Confidence:** 0.94
**Donto IRI:** none

### Claim 75 (unknown)

**Text:** We find that an extremely small [17,1,14] KAN is able to achieve 81.6% test accuracy (while Deepmind’s 4-layer width-300 MLP achieves 78% test accuracy).

**Confidence:** 0.99
**Donto IRI:** none

### Claim 76 (unknown)

**Text:** The [17,1,14] KAN (G = 3, k = 3) has ≈ 200 parameters, while the MLP has ≈ 3 × 10^5 parameters.

**Confidence:** 0.99
**Donto IRI:** none

### Claim 77 (unknown)

**Text:** It is remarkable that KANs can be both more accurate and much more parameter efficient than MLPs at the same time.

**Confidence:** 0.98
**Donto IRI:** none

### Claim 78 (unknown)

**Text:** We then train a [3,1,14] KAN on the three important variables, obtaining test accuracy 78.2%.

**Confidence:** 0.98
**Donto IRI:** none

### Claim 79 (unknown)

**Text:** For example, μr alone can achieve 65.0% accuracy, while μi alone can only achieve 43.8% accuracy.

**Confidence:** 0.99
**Donto IRI:** none

### Claim 80 (unknown)

**Text:** We find a symbolic formula (in Table 4) which only involves μr and λ, but can achieve 77.8% test accuracy.

**Confidence:** 0.97
**Donto IRI:** none

### Claim 81 (unknown)

**Text:** By having a larger KAN, both accuracy and complexity increase.

**Confidence:** 0.93
**Donto IRI:** none

### Claim 82 (unknown)

**Text:** So KANs provide not just a single symbolic formula, but a whole Pareto frontier of formulas, trading off simplicity and accuracy.

**Confidence:** 0.94
**Donto IRI:** none

### Claim 83 (unknown)

**Text:** In the unsupervised learning mode, we treat all 18 variables (including signature) as inputs such that they are on the same footing.

**Confidence:** 0.96
**Donto IRI:** none

### Claim 84 (unknown)

**Text:** All 200 networks can be grouped into three clusters, with representative KANs displayed in Figure 4.4.

**Confidence:** 0.97
**Donto IRI:** none

### Claim 85 (unknown)

**Text:** This is the signature dependence studied above, so it is very interesting to see that this dependence relation is rediscovered again in the unsupervised mode.

**Confidence:** 0.93
**Donto IRI:** none

### Claim 86 (unknown)

**Text:** So the relation is −log V + log μr + log λ = 0 which is equivalent to V = μr λ, which is true by definition.

**Confidence:** 0.98
**Donto IRI:** none

### Claim 87 (unknown)

**Text:** We plot 2D scatters, finding that 2r upper bounds gr, which is also a well-known relation [47].

**Confidence:** 0.95
**Donto IRI:** none

### Claim 88 (unknown)

**Text:** It is interesting that KANs’ unsupervised mode can rediscover several known mathematical relations.

**Confidence:** 0.95
**Donto IRI:** none

### Claim 89 (unknown)

**Text:** For the MM, we testify KAN’s ability to accurately extract mobility edge as a 1D function of energy.

**Confidence:** 0.93
**Donto IRI:** none

### Claim 90 (unknown)

**Text:** For the GAAM, we find that the formula obtained from a KAN closely matches the ground truth.

**Confidence:** 0.95
**Donto IRI:** none

### Claim 91 (unknown)

**Text:** For the more complicated MAAM, we demonstrate yet another example of the symbolic interpretability of this framework.

**Confidence:** 0.9
**Donto IRI:** none

### Claim 92 (unknown)

**Text:** She trains her KAN with some sparsity regularization to accuracy 98.7% and visualizes the trained KAN in Figure 4.6 (a) step 1.

**Confidence:** 0.97
**Donto IRI:** none

### Claim 93 (unknown)

**Text:** After that, she immediately gets a network which is already symbolic (shown in Figure 4.6 (a) step 2), with comparable (even slightly better) accuracy 98.9%.

**Confidence:** 0.97
**Donto IRI:** none

### Claim 94 (unknown)

**Text:** Alice starts from a [4,2,1,1] KAN and trains it but gets an accuracy around 75% which is less than acceptable.

**Confidence:** 0.95
**Donto IRI:** none

### Claim 95 (unknown)

**Text:** She then chooses a larger [4,3,1,1] KAN and successfully gets 98.4% which is acceptable.

**Confidence:** 0.97
**Donto IRI:** none

### Claim 96 (unknown)

**Text:** The [4,3,1,1] KAN after training can then be pruned to be [4,2,1,1], while maintaining 97.7% accuracy.

**Confidence:** 0.98
**Donto IRI:** none

### Claim 97 (unknown)

**Text:** If Alice turns on the automatic symbolic regression (using a large library consisting of exp, tanh etc.), she would get a complicated formula in Table 5-MAAM-KAN auto, which has 97.1% accuracy.

**Confidence:** 0.97
**Donto IRI:** none

### Claim 98 (unknown)

**Text:** After snapping and retraining, the updated KAN is shown in Figure 4.6 (c) step 3, maintaining 97.7% accuracy.

**Confidence:** 0.97
**Donto IRI:** none

### Claim 99 (unknown)

**Text:** She retrains KAN and gets 96.9% accuracy (Figure 4.6 (c) Step 4A).

**Confidence:** 0.96
**Donto IRI:** none

### Claim 100 (unknown)

**Text:** She retrains KAN and gets 95.4% accuracy (Figure 4.6 (c) Step 4B).

**Confidence:** 0.96
**Donto IRI:** none

### Claim 101 (unknown)

**Text:** It is clear that the more manual operations are done by Alice, the simpler the symbolic formula is (with slight sacrifice in accuracy).

**Confidence:** 0.94
**Donto IRI:** none

### Claim 102 (unknown)

**Text:** KANs have a “knob" that a user can tune to trade-off between simplicity and accuracy (sometimes simplicity can even lead to better accuracy, as in the GAAM case).

**Confidence:** 0.93
**Donto IRI:** none

## Instructions for Claude Code

You are simulating claims from a scientific paper. For each testable claim:

1. **Determine testability:** Is this claim testable with computation? Categories:
   - "scaling_law": test with parameter sweep + log-log regression
   - "numerical_prediction": test by computing the predicted value
   - "comparative": test by implementing both models and comparing
   - "algebraic": test with symbolic math / dimensional analysis
   - "ml_benchmark": test by training models and comparing metrics
   - "not_testable": skip

2. **Write the simulation from scratch.** Use Python with numpy/scipy. For ML claims, use PyTorch if available.
   - Always implement BOTH the baseline model and the proposed model
   - Include convergence tests (run at 2+ resolutions)
   - Include conservation/sanity checks
   - Include parameter sweeps where applicable

3. **Run the simulation** and collect results.

4. **Judge the results** deterministically:
   - "reproduced": simulation confirms claim within 5% tolerance
   - "contradicted": simulation produces inconsistent results
   - "fragile": result depends on parameters/resolution
   - "underdetermined": not enough info to decide
   - "not_simulable": can't test computationally

5. **Write results** to /home/ajax/repos/toiletpaper/.simulations/fbff8504-5533-47e4-a241-775f695986ea/results.json as JSON array:
```json
[
  {
    "claim_index": 0,
    "claim_text": "...",
    "test_type": "scaling_law",
    "verdict": "reproduced",
    "confidence": 0.9,
    "reason": "Fitted exponent 2.98 matches expected 3.0 within 1%",
    "measured_value": 2.98,
    "expected_value": 3.0,
    "simulation_file": "sim_001.py",
    "baseline_result": "...",
    "proposed_result": "..."
  }
]
```

Work in /home/ajax/repos/toiletpaper/.simulations/fbff8504-5533-47e4-a241-775f695986ea. Write simulation scripts there. Focus on the most testable claims first.
Do not skip claims just because they're hard — build whatever physics/ML infrastructure you need from scratch.
