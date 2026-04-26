# Simulation workspace: MEMORA: A Harmonic Memory Representation Balancing Abstraction and Specificity

## What to do

Build and run physics/ML simulations to test every testable claim from this paper.
Read spec.md for the full list of claims. For each one:

1. Decide if it's testable (scaling_law, numerical_prediction, comparative, algebraic, ml_benchmark)
2. Write a simulation from scratch in Python (numpy/scipy, or PyTorch for ML)
3. Always implement BOTH baseline and proposed models
4. Run it and check convergence + conservation
5. Write verdict to results.json

## Rules

- Build everything from scratch. No pre-built solvers unless you wrote them here.
- Every simulation needs a baseline comparison.
- Every numerical result needs a convergence check.
- Use dimensional analysis before running anything.
- Don't skip hard claims — build the physics you need.

## Output format

Write results to results.json as a JSON array of objects with:
claim_index, claim_text, test_type, verdict, confidence, reason, measured_value, expected_value, simulation_file
