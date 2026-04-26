#!/bin/bash
set -e
cd "$(dirname "$0")"
for sim in sim_001_complexity.py sim_002_special_cases.py sim_003_cue_anchors.py sim_004_memory_types.py sim_005_context_noise.py; do
  echo "=== Running $sim ==="
  python3 "$sim"
  echo ""
done
echo "=== All simulations complete ==="
