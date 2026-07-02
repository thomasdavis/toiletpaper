import { describe, expect, it } from "vitest";
import {
  assessDontoAgentChunkQuality,
  splitDontoAgentText,
} from "./donto-agent";

describe("splitDontoAgentText", () => {
  it("returns no chunks for empty or whitespace-only text", () => {
    expect(splitDontoAgentText("", 100, 20)).toEqual([]);
    expect(splitDontoAgentText("   \n\n  ", 100, 20)).toEqual([]);
  });

  it("splits long text while preserving overlap between windows", () => {
    const text = Array.from({ length: 40 }, (_, i) => `Sentence ${i}.`).join(" ");
    const chunks = splitDontoAgentText(text, 120, 25);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 120)).toBe(true);
    expect(text).toContain(chunks[0]);
    expect(text).toContain(chunks[1]);
  });

  it("still advances when overlap is larger than the requested chunk size", () => {
    const text = "abcdefghijklmnopqrstuvwxyz".repeat(10);
    const chunks = splitDontoAgentText(text, 25, 100);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 25)).toBe(true);
    expect(chunks.at(-1)?.endsWith("z")).toBe(true);
  });
});

describe("assessDontoAgentChunkQuality", () => {
  it("accepts dense anchored extraction output", () => {
    const quality = assessDontoAgentChunkQuality(
      {
        chars: 3000,
        statementCount: 120,
        anchoredCount: 80,
        factCount: 120,
        stdout: "ingested 120 statements (80 anchored, 0 skipped)",
        stderr: "120 facts in 4 pass(es) via glm/glm-4.7",
      },
      { minAnchoredRatio: 0.2, minFactsPerThousandChars: 18 },
    );

    expect(quality.acceptable).toBe(true);
    expect(quality.warnings).toEqual([]);
  });

  it("rejects partial stream output even when facts were ingested", () => {
    const quality = assessDontoAgentChunkQuality(
      {
        chars: 3500,
        statementCount: 60,
        anchoredCount: 3,
        factCount: 60,
        stdout: "ingested 60 statements (3 anchored, 0 skipped)",
        stderr:
          "provider glm stream dropped after 5787 chars (partial accepted): error decoding response body",
      },
      { minAnchoredRatio: 0.2, minFactsPerThousandChars: 18 },
    );

    expect(quality.acceptable).toBe(false);
    expect(quality.warnings.join(" ")).toContain("partial output");
    expect(quality.warnings.join(" ")).toContain("anchor ratio");
  });

  it("rejects sparse zero-statement chunks", () => {
    const quality = assessDontoAgentChunkQuality(
      {
        chars: 1000,
        statementCount: 0,
        anchoredCount: 0,
        factCount: 0,
        stdout: "",
        stderr: "",
      },
      { minAnchoredRatio: 0.2, minFactsPerThousandChars: 18 },
    );

    expect(quality.acceptable).toBe(false);
    expect(quality.warnings.join(" ")).toContain("no facts");
  });
});
