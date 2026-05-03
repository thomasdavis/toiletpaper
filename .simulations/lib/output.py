"""Result formatting and JSON output helpers.

Standardized output for simulation results that matches the
toiletpaper results.json schema.

Usage:
    from output import make_result, write_results
"""

import json
from typing import Optional


def make_result(
    claim_index: int,
    claim_text: str,
    test_type: str,
    verdict: str,
    confidence: float,
    reason: str,
    measured_value: Optional[float] = None,
    expected_value: Optional[float] = None,
    simulation_file: Optional[str] = None,
    baseline_result: Optional[str] = None,
    proposed_result: Optional[str] = None,
) -> dict:
    """Create a single result entry matching the toiletpaper schema."""
    r = {
        "claim_index": claim_index,
        "claim_text": claim_text,
        "test_type": test_type,
        "verdict": verdict,
        "confidence": confidence,
        "reason": reason,
    }
    if measured_value is not None:
        r["measured_value"] = measured_value
    if expected_value is not None:
        r["expected_value"] = expected_value
    if simulation_file is not None:
        r["simulation_file"] = simulation_file
    if baseline_result is not None:
        r["baseline_result"] = baseline_result
    if proposed_result is not None:
        r["proposed_result"] = proposed_result
    return r


def write_results(results: list[dict], path: str):
    """Write results list to JSON file."""
    with open(path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"Wrote {len(results)} results to {path}")
