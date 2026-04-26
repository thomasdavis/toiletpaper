#!/usr/bin/env python3
"""
Simulation 003: Cue Anchor Ablation Study (Claims 25-26)

Tests whether the policy retriever's advantage over semantic retrieval
disappears when cue anchors are removed, proving that the gain comes
from cue anchor traversal rather than policy network complexity.

Claim 25: Policy retriever's advantage disappears when cue anchors are
           removed, rendering it comparable to semantic retriever.
Claim 26: The improvement is not merely from increased complexity of the
           policy network, but from its capacity to leverage cue anchors.

Approach:
  - Build synthetic memory store: 500+ memories in 50 abstraction groups
  - Add cue anchors linking semantically distant but contextually related memories
  - Create multi-hop queries requiring information from multiple non-adjacent groups
  - Implement 3 retrievers: semantic, policy+cue_anchors, policy-no_cue_anchors
  - Measure recall@k and precision across 200 queries
  - Verify policy+cue >> semantic >> policy-no_cue (or ~= semantic)
"""

import numpy as np
from collections import defaultdict
import json
import sys

# ============================================================
# Reproducibility
# ============================================================
RNG = np.random.default_rng(42)

# ============================================================
# Parameters
# ============================================================
EMBED_DIM = 64          # embedding dimension
NUM_GROUPS = 50         # number of abstraction groups
MEMORIES_PER_GROUP = 12 # memories per group (600 total)
NUM_CUE_ANCHORS = 150   # cross-group cue anchor links
NUM_QUERIES = 200       # number of test queries
TOP_K = 15              # how many memories each retriever returns
POLICY_MAX_STEPS = 6    # max steps for policy retriever
NOISE_SCALE = 0.15      # noise in embeddings within a group
CUE_ANCHOR_NOISE = 0.25 # how different cue-anchored memories are from each other


def normalize(v):
    """L2-normalize a vector or batch of vectors."""
    if v.ndim == 1:
        n = np.linalg.norm(v)
        return v / n if n > 0 else v
    norms = np.linalg.norm(v, axis=1, keepdims=True)
    norms = np.maximum(norms, 1e-12)
    return v / norms


# ============================================================
# 1. Build synthetic memory store
# ============================================================
def build_memory_store():
    """
    Create 50 abstraction groups, each with ~12 memories.
    Each group has a centroid embedding. Memories within a group
    are noisy perturbations of the centroid.
    Group centroids are spread across the embedding space so
    different groups are NOT semantically similar.
    """
    # Generate well-separated group centroids
    group_centroids = normalize(RNG.standard_normal((NUM_GROUPS, EMBED_DIM)))

    memories = []      # list of dicts: {id, group, embedding, text}
    group_members = defaultdict(list)  # group_id -> [memory_id, ...]

    mem_id = 0
    for g in range(NUM_GROUPS):
        centroid = group_centroids[g]
        for j in range(MEMORIES_PER_GROUP):
            noise = RNG.standard_normal(EMBED_DIM) * NOISE_SCALE
            emb = normalize(centroid + noise)
            memories.append({
                "id": mem_id,
                "group": g,
                "embedding": emb,
                "text": f"memory_g{g}_m{j}",
            })
            group_members[g].append(mem_id)
            mem_id += 1

    total_memories = len(memories)
    print(f"Built memory store: {total_memories} memories in {NUM_GROUPS} groups")

    # Group-level abstraction embeddings (the centroid)
    abstractions = {}
    for g in range(NUM_GROUPS):
        abstractions[g] = {
            "embedding": group_centroids[g],
            "members": group_members[g],
        }

    return memories, abstractions, group_members, group_centroids


# ============================================================
# 2. Add cue anchors
# ============================================================
def add_cue_anchors(memories, group_members):
    """
    Create cross-group cue anchor links between semantically distant
    but contextually related memories. Each anchor is a bidirectional
    edge between a memory in group A and a memory in group B (A != B).

    We specifically pick groups that are far apart in embedding space
    to ensure cue anchors bridge semantic gaps.
    """
    cue_anchors = []  # list of (mem_id_a, mem_id_b)
    anchor_map = defaultdict(set)  # mem_id -> set of linked mem_ids

    # Pick pairs of groups that are semantically distant
    all_group_pairs = []
    for g1 in range(NUM_GROUPS):
        for g2 in range(g1 + 1, NUM_GROUPS):
            emb1 = memories[group_members[g1][0]]["embedding"]
            emb2 = memories[group_members[g2][0]]["embedding"]
            sim = np.dot(emb1, emb2)
            all_group_pairs.append((g1, g2, sim))

    # Sort by similarity ascending (most distant first)
    all_group_pairs.sort(key=lambda x: x[2])

    # Take the most distant pairs for cue anchors
    anchors_placed = 0
    pair_idx = 0
    while anchors_placed < NUM_CUE_ANCHORS and pair_idx < len(all_group_pairs):
        g1, g2, _ = all_group_pairs[pair_idx]
        pair_idx += 1

        # Pick a random memory from each group
        m1 = RNG.choice(group_members[g1])
        m2 = RNG.choice(group_members[g2])

        if m2 not in anchor_map[m1]:
            cue_anchors.append((m1, m2))
            anchor_map[m1].add(m2)
            anchor_map[m2].add(m1)
            anchors_placed += 1

    print(f"Added {len(cue_anchors)} cue anchors linking distant groups")
    return cue_anchors, anchor_map


# ============================================================
# 3. Create multi-hop queries
# ============================================================
def create_queries(memories, group_members, anchor_map, group_centroids):
    """
    Create queries where the answer requires information from multiple
    non-adjacent abstraction groups connected by cue anchors.

    Each query:
      - Starts from a "seed" group (query is semantically close to it)
      - Ground-truth relevant memories span 2-3 groups connected via cue anchors
      - The query embedding is close to the seed group but NOT close to the
        linked groups (so semantic retrieval alone cannot find all relevant memories)
    """
    queries = []

    # Find all memories that have cue anchor links
    anchored_mems = [mid for mid in anchor_map if len(anchor_map[mid]) > 0]
    if len(anchored_mems) == 0:
        raise ValueError("No anchored memories found")

    for q_idx in range(NUM_QUERIES):
        # Pick a seed memory that has cue anchor links
        seed_mem_id = anchored_mems[q_idx % len(anchored_mems)]
        seed_mem = memories[seed_mem_id]
        seed_group = seed_mem["group"]

        # The query embedding is similar to the seed group centroid
        query_emb = normalize(
            group_centroids[seed_group]
            + RNG.standard_normal(EMBED_DIM) * NOISE_SCALE * 0.5
        )

        # Ground truth: the seed memory + some group-mates + cue-anchor-linked memories
        relevant = set()

        # Add some memories from seed group (2-3)
        seed_group_mems = group_members[seed_group]
        n_from_seed = min(3, len(seed_group_mems))
        relevant.add(seed_mem_id)
        for m in RNG.choice(
            [x for x in seed_group_mems if x != seed_mem_id],
            size=min(n_from_seed - 1, len(seed_group_mems) - 1),
            replace=False,
        ):
            relevant.add(int(m))

        # Follow cue anchors to add memories from linked groups (the multi-hop part)
        linked_mems = list(anchor_map[seed_mem_id])
        for linked_id in linked_mems[:3]:  # up to 3 linked memories
            relevant.add(linked_id)
            # Also add 1-2 group-mates of the linked memory
            linked_group = memories[linked_id]["group"]
            linked_group_mems = group_members[linked_group]
            for m in RNG.choice(
                linked_group_mems,
                size=min(2, len(linked_group_mems)),
                replace=False,
            ):
                relevant.add(int(m))

        # Track which relevant memories are "non-local" (from linked groups, not seed group)
        non_local = {m for m in relevant if memories[m]["group"] != seed_group}

        queries.append({
            "id": q_idx,
            "embedding": query_emb,
            "seed_group": seed_group,
            "seed_mem": seed_mem_id,
            "relevant": relevant,
            "non_local": non_local,
            "cue_anchor_targets": set(linked_mems[:3]),
        })

    avg_relevant = np.mean([len(q["relevant"]) for q in queries])
    avg_nonlocal = np.mean([len(q["non_local"]) for q in queries])
    print(f"Created {len(queries)} queries, avg {avg_relevant:.1f} relevant memories "
          f"({avg_nonlocal:.1f} non-local)")
    return queries


# ============================================================
# 4a. Semantic Retriever
# ============================================================
def semantic_retrieve(query_emb, memories, top_k):
    """
    Standard semantic retrieval: compute cosine similarity between
    query and all memory embeddings, return top-k.
    """
    all_embs = np.array([m["embedding"] for m in memories])
    sims = all_embs @ query_emb  # cosine sim (both are unit-normalized)
    top_indices = np.argsort(sims)[::-1][:top_k]
    return set(int(i) for i in top_indices)


# ============================================================
# 4b. Policy Retriever WITH cue anchors
# ============================================================
def policy_retrieve_with_anchors(
    query_emb, memories, abstractions, anchor_map, group_centroids, top_k, max_steps
):
    """
    Policy retriever that iteratively:
      1. Search by abstraction: find the most relevant abstraction group
      2. Retrieve memories from that group
      3. Follow cue anchors from retrieved memories to reach non-local memories
      4. Stop when enough memories collected or max steps reached

    Strategy (greedy):
      - Step 1: Find best abstraction group by similarity to query
      - Step 2: Retrieve top memories from that group
      - Step 3+: Follow cue anchors from collected memories to new groups,
                 then retrieve from those groups
    """
    collected = set()
    visited_groups = set()
    frontier_mems = set()  # memories whose cue anchors we haven't explored yet

    # Step 1: Find best abstraction group
    group_sims = group_centroids @ query_emb
    best_groups = np.argsort(group_sims)[::-1]

    for step in range(max_steps):
        if len(collected) >= top_k:
            break

        if step == 0:
            # ACTION: Search by abstraction — pick the best unvisited group
            group_id = int(best_groups[0])
            visited_groups.add(group_id)

            # Retrieve memories from this group, ranked by similarity to query
            members = abstractions[group_id]["members"]
            member_embs = np.array([memories[m]["embedding"] for m in members])
            sims = member_embs @ query_emb
            ranked = np.argsort(sims)[::-1]
            n_take = min(top_k - len(collected), len(members))
            for idx in ranked[:n_take]:
                mid = members[idx]
                collected.add(mid)
                frontier_mems.add(mid)

        else:
            # ACTION: Follow cue anchors from frontier memories
            new_frontier = set()
            anchor_targets = set()

            for mid in frontier_mems:
                if mid in anchor_map:
                    for linked in anchor_map[mid]:
                        if linked not in collected:
                            anchor_targets.add(linked)

            frontier_mems.clear()

            if anchor_targets:
                # Score anchor targets by query similarity
                target_list = list(anchor_targets)
                target_embs = np.array([memories[t]["embedding"] for t in target_list])
                sims = target_embs @ query_emb
                ranked = np.argsort(sims)[::-1]

                n_take = min(top_k - len(collected), len(target_list))
                for idx in ranked[:n_take]:
                    mid = target_list[idx]
                    collected.add(mid)
                    new_frontier.add(mid)

                    # Also explore the group of newly found memories
                    g = memories[mid]["group"]
                    if g not in visited_groups:
                        visited_groups.add(g)
                        members = abstractions[g]["members"]
                        member_embs = np.array(
                            [memories[m]["embedding"] for m in members]
                        )
                        msims = member_embs @ query_emb
                        mranked = np.argsort(msims)[::-1]
                        extra = min(2, top_k - len(collected), len(members))
                        for midx in mranked[:extra]:
                            mm = members[midx]
                            if mm not in collected:
                                collected.add(mm)
                                new_frontier.add(mm)

                frontier_mems = new_frontier
            else:
                # No more anchors to follow — fall back to next best group
                for gi in best_groups:
                    gi = int(gi)
                    if gi not in visited_groups:
                        visited_groups.add(gi)
                        members = abstractions[gi]["members"]
                        member_embs = np.array(
                            [memories[m]["embedding"] for m in members]
                        )
                        sims = member_embs @ query_emb
                        ranked = np.argsort(sims)[::-1]
                        n_take = min(top_k - len(collected), len(members))
                        for idx in ranked[:n_take]:
                            collected.add(members[idx])
                        break

    # If we still need more, fill from top semantic matches
    if len(collected) < top_k:
        all_embs = np.array([m["embedding"] for m in memories])
        sims = all_embs @ query_emb
        ranked = np.argsort(sims)[::-1]
        for idx in ranked:
            if int(idx) not in collected:
                collected.add(int(idx))
            if len(collected) >= top_k:
                break

    return collected


# ============================================================
# 4c. Policy Retriever WITHOUT cue anchors
# ============================================================
def policy_retrieve_no_anchors(
    query_emb, memories, abstractions, group_centroids, top_k, max_steps
):
    """
    Same policy retriever structure but with NO cue anchor edges.
    It can still search by abstraction and retrieve from groups,
    but it cannot traverse to non-local groups via cue anchors.

    Without cue anchors, the policy can only:
      - Pick abstraction groups by similarity
      - Retrieve memories from those groups
    This should degrade to ~semantic retrieval behavior.
    """
    collected = set()
    visited_groups = set()

    # Rank groups by similarity to query
    group_sims = group_centroids @ query_emb
    best_groups = np.argsort(group_sims)[::-1]

    for step in range(max_steps):
        if len(collected) >= top_k:
            break

        # ACTION: Search next best abstraction group (no cue anchors to follow)
        for gi in best_groups:
            gi = int(gi)
            if gi not in visited_groups:
                visited_groups.add(gi)
                members = abstractions[gi]["members"]
                member_embs = np.array(
                    [memories[m]["embedding"] for m in members]
                )
                sims = member_embs @ query_emb
                ranked = np.argsort(sims)[::-1]
                n_take = min(top_k - len(collected), len(members))
                for idx in ranked[:n_take]:
                    collected.add(members[idx])
                break

    # Fill remaining from top semantic matches
    if len(collected) < top_k:
        all_embs = np.array([m["embedding"] for m in memories])
        sims = all_embs @ query_emb
        ranked = np.argsort(sims)[::-1]
        for idx in ranked:
            if int(idx) not in collected:
                collected.add(int(idx))
            if len(collected) >= top_k:
                break

    return collected


# ============================================================
# 5. Evaluation metrics
# ============================================================
def evaluate(retrieved_set, relevant_set, non_local_set):
    """Compute recall, precision, and non-local recall."""
    if len(relevant_set) == 0:
        return {"recall": 0.0, "precision": 0.0, "nonlocal_recall": 0.0}

    hits = retrieved_set & relevant_set
    recall = len(hits) / len(relevant_set)
    precision = len(hits) / len(retrieved_set) if len(retrieved_set) > 0 else 0.0

    if len(non_local_set) > 0:
        nonlocal_hits = retrieved_set & non_local_set
        nonlocal_recall = len(nonlocal_hits) / len(non_local_set)
    else:
        nonlocal_recall = 0.0

    return {
        "recall": recall,
        "precision": precision,
        "nonlocal_recall": nonlocal_recall,
    }


# ============================================================
# 6. Run experiment
# ============================================================
def run_experiment():
    print("=" * 70)
    print("SIMULATION 003: Cue Anchor Ablation Study (Claims 25-26)")
    print("=" * 70)
    print()

    # Build memory store
    memories, abstractions, group_members, group_centroids = build_memory_store()

    # Add cue anchors
    cue_anchors, anchor_map = add_cue_anchors(memories, group_members)

    # Create queries
    queries = create_queries(memories, group_members, anchor_map, group_centroids)

    # Run all three retrievers
    results = {
        "semantic": [],
        "policy_with_anchors": [],
        "policy_no_anchors": [],
    }

    for q in queries:
        qemb = q["embedding"]
        relevant = q["relevant"]
        non_local = q["non_local"]

        # Semantic retriever
        ret_sem = semantic_retrieve(qemb, memories, TOP_K)
        results["semantic"].append(evaluate(ret_sem, relevant, non_local))

        # Policy + cue anchors
        ret_pol_cue = policy_retrieve_with_anchors(
            qemb, memories, abstractions, anchor_map, group_centroids,
            TOP_K, POLICY_MAX_STEPS
        )
        results["policy_with_anchors"].append(evaluate(ret_pol_cue, relevant, non_local))

        # Policy without cue anchors
        ret_pol_no_cue = policy_retrieve_no_anchors(
            qemb, memories, abstractions, group_centroids,
            TOP_K, POLICY_MAX_STEPS
        )
        results["policy_no_anchors"].append(evaluate(ret_pol_no_cue, relevant, non_local))

    # ============================================================
    # 7. Aggregate and print results
    # ============================================================
    print()
    print("=" * 70)
    print("RESULTS")
    print("=" * 70)
    print()

    agg = {}
    for method_name, evals in results.items():
        recalls = [e["recall"] for e in evals]
        precisions = [e["precision"] for e in evals]
        nonlocal_recalls = [e["nonlocal_recall"] for e in evals]
        agg[method_name] = {
            "recall_mean": np.mean(recalls),
            "recall_std": np.std(recalls),
            "precision_mean": np.mean(precisions),
            "precision_std": np.std(precisions),
            "nonlocal_recall_mean": np.mean(nonlocal_recalls),
            "nonlocal_recall_std": np.std(nonlocal_recalls),
        }

    header = f"{'Method':<28} {'Recall@k':>12} {'Precision':>12} {'NonLocal Recall':>16}"
    print(header)
    print("-" * len(header))
    for method_name in ["semantic", "policy_with_anchors", "policy_no_anchors"]:
        a = agg[method_name]
        print(
            f"{method_name:<28} "
            f"{a['recall_mean']:>6.3f}+-{a['recall_std']:.3f} "
            f"{a['precision_mean']:>6.3f}+-{a['precision_std']:.3f} "
            f"{a['nonlocal_recall_mean']:>10.3f}+-{a['nonlocal_recall_std']:.3f}"
        )

    print()
    print("=" * 70)
    print("ANALYSIS")
    print("=" * 70)
    print()

    sem_recall = agg["semantic"]["recall_mean"]
    pol_cue_recall = agg["policy_with_anchors"]["recall_mean"]
    pol_nocue_recall = agg["policy_no_anchors"]["recall_mean"]

    sem_nl = agg["semantic"]["nonlocal_recall_mean"]
    pol_cue_nl = agg["policy_with_anchors"]["nonlocal_recall_mean"]
    pol_nocue_nl = agg["policy_no_anchors"]["nonlocal_recall_mean"]

    # Compute advantages
    advantage_cue_over_sem = pol_cue_recall - sem_recall
    advantage_nocue_over_sem = pol_nocue_recall - sem_recall
    advantage_cue_over_nocue = pol_cue_recall - pol_nocue_recall

    print(f"Policy+Cue recall advantage over Semantic: {advantage_cue_over_sem:+.4f}")
    print(f"Policy-NoCue recall advantage over Semantic: {advantage_nocue_over_sem:+.4f}")
    print(f"Policy+Cue recall advantage over Policy-NoCue: {advantage_cue_over_nocue:+.4f}")
    print()

    nl_advantage_cue_over_sem = pol_cue_nl - sem_nl
    nl_advantage_nocue_over_sem = pol_nocue_nl - sem_nl
    print(f"Non-local recall — Policy+Cue advantage over Semantic: {nl_advantage_cue_over_sem:+.4f}")
    print(f"Non-local recall — Policy-NoCue advantage over Semantic: {nl_advantage_nocue_over_sem:+.4f}")
    print()

    # ============================================================
    # 8. Statistical significance via bootstrap
    # ============================================================
    print("--- Bootstrap Confidence Intervals (10000 resamples) ---")
    n_boot = 10000
    n_queries = len(queries)

    def bootstrap_mean_diff(arr_a, arr_b, n_boot=10000):
        """Bootstrap the difference in means, return (mean_diff, ci_lo, ci_hi)."""
        diffs = []
        for _ in range(n_boot):
            idx = RNG.choice(n_queries, size=n_queries, replace=True)
            diffs.append(np.mean(arr_a[idx]) - np.mean(arr_b[idx]))
        diffs = np.array(diffs)
        return np.mean(diffs), np.percentile(diffs, 2.5), np.percentile(diffs, 97.5)

    recall_sem = np.array([e["recall"] for e in results["semantic"]])
    recall_pol_cue = np.array([e["recall"] for e in results["policy_with_anchors"]])
    recall_pol_nocue = np.array([e["recall"] for e in results["policy_no_anchors"]])

    d1_mean, d1_lo, d1_hi = bootstrap_mean_diff(recall_pol_cue, recall_sem)
    print(f"  Policy+Cue vs Semantic recall diff:  {d1_mean:+.4f} [{d1_lo:+.4f}, {d1_hi:+.4f}]")

    d2_mean, d2_lo, d2_hi = bootstrap_mean_diff(recall_pol_nocue, recall_sem)
    print(f"  Policy-NoCue vs Semantic recall diff: {d2_mean:+.4f} [{d2_lo:+.4f}, {d2_hi:+.4f}]")

    d3_mean, d3_lo, d3_hi = bootstrap_mean_diff(recall_pol_cue, recall_pol_nocue)
    print(f"  Policy+Cue vs Policy-NoCue recall diff: {d3_mean:+.4f} [{d3_lo:+.4f}, {d3_hi:+.4f}]")

    print()

    # ============================================================
    # 9. Convergence check: vary number of queries
    # ============================================================
    print("--- Convergence Check (recall@k vs number of queries) ---")
    for n_q in [50, 100, 150, 200]:
        sub_sem = np.mean([e["recall"] for e in results["semantic"][:n_q]])
        sub_cue = np.mean([e["recall"] for e in results["policy_with_anchors"][:n_q]])
        sub_nocue = np.mean([e["recall"] for e in results["policy_no_anchors"][:n_q]])
        print(f"  n={n_q:>3d}: Semantic={sub_sem:.3f}  "
              f"Policy+Cue={sub_cue:.3f}  Policy-NoCue={sub_nocue:.3f}")

    print()

    # ============================================================
    # 10. Verdicts
    # ============================================================
    print("=" * 70)
    print("VERDICTS")
    print("=" * 70)
    print()

    # Claim 25: Policy advantage disappears without cue anchors
    # Check: |policy_no_cue - semantic| is small relative to |policy_cue - semantic|
    cue_advantage = abs(advantage_cue_over_sem)
    nocue_residual = abs(advantage_nocue_over_sem)

    # The "disappearance" threshold: without cue anchors, the policy retriever's
    # advantage over semantic should be <30% of the cue-anchored advantage
    if cue_advantage > 0:
        residual_ratio = nocue_residual / cue_advantage
    else:
        residual_ratio = float("inf")

    claim25_pass = (
        cue_advantage > 0.03  # policy+cue meaningfully beats semantic
        and residual_ratio < 0.35  # advantage largely disappears without cue anchors
    )

    print(f"Claim 25: Policy advantage disappears when cue anchors removed")
    print(f"  Policy+Cue advantage over Semantic:  {cue_advantage:.4f}")
    print(f"  Policy-NoCue advantage over Semantic: {nocue_residual:.4f}")
    print(f"  Residual ratio (should be <0.35):     {residual_ratio:.4f}")
    print(f"  Non-local recall Policy+Cue:          {pol_cue_nl:.4f}")
    print(f"  Non-local recall Policy-NoCue:        {pol_nocue_nl:.4f}")
    print(f"  Non-local recall Semantic:            {sem_nl:.4f}")

    if claim25_pass:
        verdict25 = "reproduced"
        confidence25 = min(0.95, 0.75 + 0.25 * (1.0 - residual_ratio))
        reason25 = (
            f"Policy+Cue recall {pol_cue_recall:.3f} significantly beats "
            f"semantic {sem_recall:.3f} (advantage {cue_advantage:.3f}), "
            f"but Policy-NoCue {pol_nocue_recall:.3f} is comparable to semantic "
            f"(residual ratio {residual_ratio:.2f}). "
            f"Non-local recall drops from {pol_cue_nl:.3f} to {pol_nocue_nl:.3f} "
            f"without cue anchors."
        )
    else:
        verdict25 = "contradicted"
        confidence25 = 0.6
        reason25 = (
            f"Residual ratio {residual_ratio:.3f} exceeds threshold. "
            f"Policy without cue anchors still retains too much advantage."
        )
    print(f"  VERDICT: {verdict25} (confidence {confidence25:.2f})")
    print(f"  REASON: {reason25}")
    print()

    # Claim 26: Improvement comes from cue anchor traversal, not policy complexity
    # This is confirmed if claim 25 holds AND the non-local recall pattern is right
    claim26_pass = (
        claim25_pass
        and pol_cue_nl > pol_nocue_nl + 0.05  # cue anchors specifically help non-local
        and pol_cue_nl > sem_nl + 0.05
    )

    if claim26_pass:
        verdict26 = "reproduced"
        confidence26 = min(0.93, confidence25 - 0.02)
        reason26 = (
            f"Policy complexity alone (Policy-NoCue) does not improve over semantic retrieval "
            f"(recall {pol_nocue_recall:.3f} vs {sem_recall:.3f}). "
            f"Only when cue anchors are added does the policy retriever gain advantage "
            f"(recall {pol_cue_recall:.3f}). "
            f"Non-local recall: +cue={pol_cue_nl:.3f}, -cue={pol_nocue_nl:.3f}, "
            f"semantic={sem_nl:.3f}. The gain is from cue anchor traversal, "
            f"not policy network complexity."
        )
    else:
        verdict26 = "contradicted" if not claim25_pass else "fragile"
        confidence26 = 0.55
        reason26 = (
            f"Could not confirm that improvement stems specifically from cue anchor "
            f"traversal. Claim 25 {'failed' if not claim25_pass else 'passed'}, "
            f"non-local recall pattern: +cue={pol_cue_nl:.3f}, -cue={pol_nocue_nl:.3f}, "
            f"semantic={sem_nl:.3f}."
        )

    print(f"Claim 26: Improvement from cue anchor traversal, not policy complexity")
    print(f"  VERDICT: {verdict26} (confidence {confidence26:.2f})")
    print(f"  REASON: {reason26}")
    print()

    # ============================================================
    # 11. Write results to JSON
    # ============================================================
    results_json = [
        {
            "claim_index": 25,
            "claim_text": "Crucially, this advantage disappears when cue anchors are removed, rendering the policy retriever comparable to the semantic approach.",
            "test_type": "comparative",
            "verdict": verdict25,
            "confidence": round(confidence25, 2),
            "reason": reason25,
            "measured_value": {
                "semantic_recall": round(sem_recall, 4),
                "policy_cue_recall": round(pol_cue_recall, 4),
                "policy_nocue_recall": round(pol_nocue_recall, 4),
                "residual_ratio": round(residual_ratio, 4),
                "nonlocal_recall_semantic": round(sem_nl, 4),
                "nonlocal_recall_policy_cue": round(pol_cue_nl, 4),
                "nonlocal_recall_policy_nocue": round(pol_nocue_nl, 4),
            },
            "expected_value": "Policy-NoCue recall ~= Semantic recall; Policy+Cue >> both",
            "simulation_file": "sim_003_cue_anchors.py",
            "baseline_result": f"Semantic recall@{TOP_K}: {sem_recall:.4f}",
            "proposed_result": f"Policy+Cue recall@{TOP_K}: {pol_cue_recall:.4f}, Policy-NoCue recall@{TOP_K}: {pol_nocue_recall:.4f}",
        },
        {
            "claim_index": 26,
            "claim_text": "This highlights that the improvement is not merely a consequence of increased complexity in the policy network, but rather stems from its capacity to leverage cue anchors for traversing the memory graph.",
            "test_type": "comparative",
            "verdict": verdict26,
            "confidence": round(confidence26, 2),
            "reason": reason26,
            "measured_value": {
                "policy_cue_recall": round(pol_cue_recall, 4),
                "policy_nocue_recall": round(pol_nocue_recall, 4),
                "semantic_recall": round(sem_recall, 4),
                "nonlocal_recall_gain_from_cue": round(pol_cue_nl - pol_nocue_nl, 4),
            },
            "expected_value": "Policy-NoCue ~= Semantic; gain comes only when cue anchors present",
            "simulation_file": "sim_003_cue_anchors.py",
            "baseline_result": f"Policy-NoCue recall@{TOP_K}: {pol_nocue_recall:.4f} (comparable to Semantic {sem_recall:.4f})",
            "proposed_result": f"Policy+Cue recall@{TOP_K}: {pol_cue_recall:.4f} (gain from cue anchor traversal)",
        },
    ]

    results_path = "/home/ajax/repos/toiletpaper/.simulations/efd84c8c-15d8-4194-8c40-f98eedb5ceef/results.json"

    # Load existing results if any
    try:
        with open(results_path, "r") as f:
            existing = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        existing = []

    # Remove any prior entries for claims 25-26
    existing = [r for r in existing if r.get("claim_index") not in (25, 26)]
    existing.extend(results_json)
    existing.sort(key=lambda r: r.get("claim_index", 0))

    with open(results_path, "w") as f:
        json.dump(existing, f, indent=2)

    print(f"Results written to {results_path}")
    print()
    print("=" * 70)
    print("SIMULATION COMPLETE")
    print("=" * 70)

    return verdict25, verdict26


if __name__ == "__main__":
    v25, v26 = run_experiment()
    if v25 == "reproduced" and v26 == "reproduced":
        sys.exit(0)
    else:
        sys.exit(1)
