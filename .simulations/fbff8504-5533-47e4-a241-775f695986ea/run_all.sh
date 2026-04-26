#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "=== Running sim_003_param_count.py ==="
python3 sim_003_param_count.py

echo ""
echo "=== Running sim_008_architecture.py ==="
python3 sim_008_architecture.py

echo ""
echo "=== Running sim_004_interpolation.py ==="
python3 sim_004_interpolation.py

echo ""
echo "=== Running sim_005_catastrophic_forgetting.py ==="
python3 sim_005_catastrophic_forgetting.py

echo ""
echo "=== Running sim_006_depth.py ==="
python3 sim_006_depth.py

echo ""
echo "=== Running sim_007_grid_extension.py ==="
python3 sim_007_grid_extension.py

echo ""
echo "=== Running sim_002_grid_scaling.py ==="
python3 sim_002_grid_scaling.py

echo ""
echo "=== Running sim_001_scaling_laws.py ==="
python3 sim_001_scaling_laws.py

echo ""
echo "=== Collecting results ==="
python3 collect_results.py

echo ""
echo "=== ALL SIMULATIONS COMPLETE ==="
