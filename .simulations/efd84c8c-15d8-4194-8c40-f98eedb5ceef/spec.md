# Simulation Spec: MEMORA: A Harmonic Memory Representation Balancing Abstraction and Specificity

**Paper ID:** efd84c8c-15d8-4194-8c40-f98eedb5ceef
**Authors:** Menglin Xia, Xuchao Zhang, Shantanu Dixit, Paramaguru Harimurugan, Rujia Wang, Victor Ruhle, Robert Sim, Chetan Bansal, Saravan Rajmohan
**Abstract:** Agent memory systems must accommodate continuously growing information while supporting efficient, context-aware retrieval for downstream tasks. Abstraction is essential for scaling agent memory, yet it often comes at the cost of specificity, obscuring the fine-grained details required for effective reasoning. We introduce MEMORA, a harmonic memory representation that structurally balances abstraction and specificity. MEMORA organizes information via its primary abstractions that index concrete 

## Claims to Test

### Claim 1 (unknown)

**Text:** We introduce MEMORA, a harmonic memory representation that structurally balances abstraction and specificity.

**Confidence:** 0.99
**Donto IRI:** none

### Claim 2 (unknown)

**Text:** MEMORA organizes information via its primary abstractions that index concrete memory values and consolidate related updates into unified memory entries, while cue anchors expand retrieval access across diverse aspects of the memory and connect related memories.

**Confidence:** 0.98
**Donto IRI:** none

### Claim 3 (unknown)

**Text:** we employ a retrieval policy that actively exploits these memory connections to retrieve relevant information beyond direct semantic similarity.

**Confidence:** 0.96
**Donto IRI:** none

### Claim 4 (unknown)

**Text:** Theoretically, we show that standard Retrieval-Augmented Generation (RAG) and Knowledge Graph (KG)-based memory systems emerge as special cases of our framework.

**Confidence:** 0.99
**Donto IRI:** none

### Claim 5 (unknown)

**Text:** Empirically, MEMORA establishes a new state-of-the-art on the LoCoMo and LongMemEval benchmarks, demonstrating better retrieval relevance and reasoning effectiveness as memory scales.

**Confidence:** 0.97
**Donto IRI:** none

### Claim 6 (unknown)

**Text:** Empirically, MEMORA establishes state-of-the-art performance on the LoCoMo and LongMemEval benchmarks (86.3% and 87.4% respectively), outperforming both strong memory baselines and full-context inference.

**Confidence:** 0.99
**Donto IRI:** none

### Claim 7 (unknown)

**Text:** Its ability to consistently outperform full-context inference demonstrates that memory retrieval guided by appropriate abstraction is more reliable than brute-force reconstruction for reasoning over extensive histories.

**Confidence:** 0.93
**Donto IRI:** none

### Claim 8 (unknown)

**Text:** By balancing abstraction with specificity, the harmonic organization of MEMORA provides a scalable foundation for long-horizon agent intelligence, reducing token consumption by up to 98% compared to full-context processing.

**Confidence:** 0.9
**Donto IRI:** none

### Claim 9 (unknown)

**Text:** This representational gap cripples retrieval: because memory lacks a structured link between high-level concepts and low-level details, agents cannot effectively navigate their own history.

**Confidence:** 0.78
**Donto IRI:** none

### Claim 10 (unknown)

**Text:** Together, this organization allows agents to navigate from concrete contexts to stable abstractions, supporting implicit relational reasoning and temporal coherence without the overhead of full-context processing.

**Confidence:** 0.87
**Donto IRI:** none

### Claim 11 (unknown)

**Text:** By iteratively selecting these actions, the policy retriever refines the retrieved context to uncover relevant information beyond immediate semantic similarity, effectively capturing multi-hop dependencies that static retrieval methods often miss.

**Confidence:** 0.9
**Donto IRI:** none

### Claim 12 (unknown)

**Text:** The retrieval policy can be further optimized using Group-Relative Policy Optimization, which trains the policy by comparing groups of retrieval trajectories and updating it based on relative advantages, encouraging effective multi-step navigation and early stopping behavior.

**Confidence:** 0.96
**Donto IRI:** none

### Claim 13 (unknown)

**Text:** Traditional RAG and KG-based retrieval emerge as special cases under restricted configurations, while MEMORA supports richer mixed-key retrieval behaviors and principled efficiency improvements through abstraction-first scoping and structured traversal.

**Confidence:** 0.97
**Donto IRI:** none

### Claim 14 (unknown)

**Text:** Our best-performing configuration, MEMORA with the Policy Retriever, achieves a score of 0.863, followed by the Semantic Retriever variant at 0.849.

**Confidence:** 0.99
**Donto IRI:** none

### Claim 15 (unknown)

**Text:** MEMORA demonstrates superior performance across all four task categories, establishing a new state-of-the-art.

**Confidence:** 0.97
**Donto IRI:** none

### Claim 16 (unknown)

**Text:** Notably, MEMORA surpasses the Full Context baseline (0.825).

**Confidence:** 0.99
**Donto IRI:** none

### Claim 17 (unknown)

**Text:** We attribute this result to Memora’s ability to reduce “context noise”.

**Confidence:** 0.82
**Donto IRI:** none

### Claim 18 (unknown)

**Text:** By filtering out irrelevant dialogue turns and presenting a crystallized memory structure, MEMORA prevents the dilution of the model’s attention mechanism, effectively proving that curated context leads to sharper reasoning than complete context.

**Confidence:** 0.84
**Donto IRI:** none

### Claim 19 (unknown)

**Text:** MEMORA significantly outperforms strong baselines, including RAG (0.633), as well as other competitive memory systems such as Mem0 (0.653) and Nemori (0.794).

**Confidence:** 0.99
**Donto IRI:** none

### Claim 20 (unknown)

**Text:** This performance gap validates the utility of our harmonic structure.

**Confidence:** 0.86
**Donto IRI:** none

### Claim 21 (unknown)

**Text:** this success is driven by the synergy between our components: while the primary abstraction and cue anchors enable the model to pinpoint targets with high precision, the underlying index-value representation ensures the optimal balance between specificity and abstraction.

**Confidence:** 0.85
**Donto IRI:** none

### Claim 22 (unknown)

**Text:** The Policy Retriever further amplifies these gains by leveraging cue anchors to actively navigate the memory graph, ensuring that contextually linked information is retrieved even when it is not semantically adjacent.

**Confidence:** 0.9
**Donto IRI:** none

### Claim 23 (unknown)

**Text:** Table 2 presents the performance on the LongMemEval dataset, where our method consistently outperforms strong baselines, achieving an accuracy of 87.4%.

**Confidence:** 0.99
**Donto IRI:** none

### Claim 24 (unknown)

**Text:** Comparing the two major retriever backbones, the policy retriever consistently outperforms the semantic retriever.

**Confidence:** 0.97
**Donto IRI:** none

### Claim 25 (unknown)

**Text:** Crucially, this advantage disappears when cue anchors are removed, rendering the policy retriever comparable to the semantic approach.

**Confidence:** 0.98
**Donto IRI:** none

### Claim 26 (unknown)

**Text:** This highlights that the improvement is not merely a consequence of increased complexity in the policy network, but rather stems from its capacity to leverage cue anchors for traversing the memory graph.

**Confidence:** 0.92
**Donto IRI:** none

### Claim 27 (unknown)

**Text:** By following these anchors, the system can navigate to relevant non-local contexts that a semantic search would miss.

**Confidence:** 0.88
**Donto IRI:** none

### Claim 28 (unknown)

**Text:** We observe a clear performance hierarchy correlated with the richness of the episodic context: the variant using raw segments as episodic memory (Episodic (Segment) + Factual) achieves the highest score (0.863), outperforming the extracted episodic memory (Episodic (Extracted) + Factual, 0.838) and the Factual Only variant (0.833).

**Confidence:** 0.99
**Donto IRI:** none

### Claim 29 (unknown)

**Text:** This trend confirms that while discrete facts provide a solid baseline, the “connective tissue” found in episodic memory is essential for grounding.

**Confidence:** 0.88
**Donto IRI:** none

### Claim 30 (unknown)

**Text:** Furthermore, factual and episodic memories are not redundant but complementary.

**Confidence:** 0.9
**Donto IRI:** none

### Claim 31 (unknown)

**Text:** Adding factual memory to the episodic-only baseline consistently improves overall performance, indicating that MEMORA succeeds by combining the structural clarity of factual details with the richer context of the episodes.

**Confidence:** 0.95
**Donto IRI:** none

### Claim 32 (unknown)

**Text:** While the full Episodic (Segment) + Factual variant yields the best results, greater context richness inevitably leads to a larger memory footprint.

**Confidence:** 0.97
**Donto IRI:** none

### Claim 33 (unknown)

**Text:** However, the Factual-only configuration remains a strong “lightweight” alternative, achieving a respectable score of 0.833 while significantly reducing the context load.

**Confidence:** 0.98
**Donto IRI:** none

### Claim 34 (unknown)

**Text:** The policy retriever incurs higher latency compared to the semantic retriever, primarily due to the sequential nature of the search process.

**Confidence:** 0.98
**Donto IRI:** none

### Claim 35 (unknown)

**Text:** On average, the policy retriever requires over three steps per query.

**Confidence:** 0.99
**Donto IRI:** none

### Claim 36 (unknown)

**Text:** Since each step involves a distinct LLM call to determine the next action, the search latency naturally scales with the number of iterations.

**Confidence:** 0.95
**Donto IRI:** none

### Claim 37 (unknown)

**Text:** the GRPO-trained retriever achieves an accuracy of 0.841, marginally outperforming the base model baseline (0.836).

**Confidence:** 0.98
**Donto IRI:** none

### Claim 38 (unknown)

**Text:** These preliminary results demonstrate that the retrieval policy is learnable and can be effectively distilled into smaller models, maintaining competitive performance compared to the instruction-tuned counterpart.

**Confidence:** 0.87
**Donto IRI:** none

### Claim 39 (unknown)

**Text:** We show that existing RAG- and KG-based memory systems arise as special cases of our framework.

**Confidence:** 0.99
**Donto IRI:** none

### Claim 40 (unknown)

**Text:** Empirically, Memora achieves state-of-the-art performance on long-horizon memory benchmarks, consistently outperforming strong baselines and full-context inference with both semantic and policy retrieval mechanisms, demonstrating the effectiveness of harmonic memory organization for scalable agent reasoning.

**Confidence:** 0.97
**Donto IRI:** none

### Claim 41 (unknown)

**Text:** For any implicit KG retriever R_imp_KG(q), there exists a Memora instantiation and traversal depth L such that R_L(q) = R_imp_KG(q) for all queries q.

**Confidence:** 0.98
**Donto IRI:** none

### Claim 42 (unknown)

**Text:** For any explicit KG retriever R_exp_KG(q), there exists an extended Memora instantiation such that the multi-hop retrieval result R_L(q) produced by Memora equals R_exp_KG(q) for all queries q.

**Confidence:** 0.98
**Donto IRI:** none

### Claim 43 (unknown)

**Text:** There exists a Memora retrieval function R* such that, for any fixed k and any fixed L, R* cannot be realized by flat top-k similarity retrieval and cannot be realized by KG seed-and-expand retrieval with a fixed single-attachment map.

**Confidence:** 0.97
**Donto IRI:** none

### Claim 44 (unknown)

**Text:** Under the variant in which query-time retrieval is performed via (1) an ANN lookup over abstractions and (2) an ANN lookup over cue anchors, without explicit intra-abstraction enumeration, the expected query-time cost of Memora satisfies T_Harmo(q) = O(log(mN^2/B^2)).

**Confidence:** 0.96
**Donto IRI:** none

### Claim 45 (unknown)

**Text:** In contrast, a flat ANN-based retriever that indexes all N memories incurs T_RAG(q) = O(log N) under the same index-family assumptions.

**Confidence:** 0.96
**Donto IRI:** none

### Claim 46 (unknown)

**Text:** Consequently, abstraction-first retrieval yields a multiplicative efficiency improvement of Omega(logN / (2 logN + logm - 2 logB)).

**Confidence:** 0.95
**Donto IRI:** none

### Claim 47 (unknown)

**Text:** A sufficient condition for Imp(N,B,m) > 1 is B^2 > mN.

**Confidence:** 0.95
**Donto IRI:** none

### Claim 48 (unknown)

**Text:** In this example (Table 5), MEMORA demonstrates superior memory retrieval precision.

**Confidence:** 0.9
**Donto IRI:** none

### Claim 49 (unknown)

**Text:** This success is attributed to MEMORA’s index-value representation, which decouples the navigation layer from the raw data.

**Confidence:** 0.82
**Donto IRI:** none

### Claim 50 (unknown)

**Text:** While traditional RAG often suffers from semantic drift and Mem0 can lose granularity through over-summarization, MEMORA’s indices serve as a structured guide to the memory space.

**Confidence:** 0.84
**Donto IRI:** none

### Claim 51 (unknown)

**Text:** This allows the system to pinpoint specific entities while preserving the original richness and contextual meaning of the memory items.

**Confidence:** 0.83
**Donto IRI:** none

### Claim 52 (unknown)

**Text:** In this example (Table 8), MEMORA demonstrates a robust capacity for information aggregation, correctly synthesizing disparate facts, the initial ownership of a dog and cat, followed by the later addition of a second cat named Bailey, into a single, comprehensive response.

**Confidence:** 0.9
**Donto IRI:** none

### Claim 53 (unknown)

**Text:** Unlike baseline methods that often retrieve fragmented memory fragments or lose connections, MEMORA effectively links related entities across non-contiguous parts of the dialogue context.

**Confidence:** 0.87
**Donto IRI:** none

### Claim 54 (unknown)

**Text:** In this example (Table 11), a scrutiny of the retrieved evidence reveals that while baseline methods identify the correct topical domain, they fail to capture the discriminative details required for an accurate response.

**Confidence:** 0.88
**Donto IRI:** none

### Claim 55 (unknown)

**Text:** The RAG retrieval is too broad and lacks relevance; it becomes anchored to a dense, irrelevant dialogue fragment about a “colorful bowl” from a separate project, illustrating how raw context windows are easily distracted by high-signal but incorrect semantic clusters.

**Confidence:** 0.84
**Donto IRI:** none

### Claim 56 (unknown)

**Text:** Meanwhile, Mem0 produces a set of isolated, low-entropy facts, such as “the kids enjoyed making things with clay”, which, while factually true, are too fragmented and generic to support the specific query.

**Confidence:** 0.84
**Donto IRI:** none

### Claim 57 (unknown)

**Text:** By contrast, MEMORA successfully preserves the fine-grained entity binding between the “kids’ pottery” and the “dog-face cup.”

**Confidence:** 0.89
**Donto IRI:** none

### Claim 58 (unknown)

**Text:** Its index-value architecture prevents the information decay seen in Mem0 and the noise contamination seen in RAG, ensuring that specific attributes remain intact within the retrieved memory.

**Confidence:** 0.83
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

5. **Write results** to /home/ajax/repos/toiletpaper/.simulations/efd84c8c-15d8-4194-8c40-f98eedb5ceef/results.json as JSON array:
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

Work in /home/ajax/repos/toiletpaper/.simulations/efd84c8c-15d8-4194-8c40-f98eedb5ceef. Write simulation scripts there. Focus on the most testable claims first.
Do not skip claims just because they're hard — build whatever physics/ML infrastructure you need from scratch.
