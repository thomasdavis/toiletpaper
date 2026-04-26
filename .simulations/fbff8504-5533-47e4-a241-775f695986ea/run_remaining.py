#!/usr/bin/env python3
"""Run all remaining simulations that haven't produced results yet."""
import os, sys, json, subprocess

SIMDIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(SIMDIR)

remaining = []
for i in [1, 2, 6, 7, 8]:
    result_file = f"sim_{i:03d}_results.json"
    script_name = None
    for f in os.listdir(SIMDIR):
        if f.startswith(f"sim_{i:03d}_") and f.endswith(".py"):
            script_name = f
            break
    if script_name and not os.path.exists(os.path.join(SIMDIR, result_file)):
        remaining.append(script_name)

print(f"Remaining scripts to run: {remaining}")
for script in remaining:
    print(f"\n{'='*60}")
    print(f"Running {script}...")
    print(f"{'='*60}")
    sys.stdout.flush()
    try:
        subprocess.run([sys.executable, script], check=True, cwd=SIMDIR)
    except Exception as e:
        print(f"ERROR running {script}: {e}")

# Re-run collector
print(f"\n{'='*60}")
print("Collecting all results...")
print(f"{'='*60}")
subprocess.run([sys.executable, "collect_results.py"], check=True, cwd=SIMDIR)

print("\nDone!")
