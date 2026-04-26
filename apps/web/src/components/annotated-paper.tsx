"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface AnnotatedClaim {
  id: string;
  text: string;
  verdict: "reproduced" | "contradicted" | "fragile" | "inconclusive" | "untested";
  reason?: string;
  measured?: string;
  expected?: string;
  confidence?: number;
  spanStart: number | null;
  spanEnd: number | null;
}

interface Props {
  paperText: string;
  format: "markdown" | "plaintext";
  claims: AnnotatedClaim[];
}

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const VERDICT_STYLES: Record<
  string,
  { bg: string; border: string; text: string; dot: string; markBg: string }
> = {
  reproduced: {
    bg: "#D4EDE1",
    border: "#2D6A4F",
    text: "#2D6A4F",
    dot: "#2D6A4F",
    markBg: "#D4EDE1",
  },
  contradicted: {
    bg: "#F5D5D6",
    border: "#9B2226",
    text: "#9B2226",
    dot: "#9B2226",
    markBg: "#F5D5D6",
  },
  fragile: {
    bg: "#F5ECD4",
    border: "#B07D2B",
    text: "#B07D2B",
    dot: "#B07D2B",
    markBg: "#F5ECD4",
  },
  inconclusive: {
    bg: "#F5ECD4",
    border: "#B07D2B",
    text: "#B07D2B",
    dot: "#B07D2B",
    markBg: "#F5ECD4",
  },
  untested: {
    bg: "#F0EFEC",
    border: "#9B9B9B",
    text: "#9B9B9B",
    dot: "#9B9B9B",
    markBg: "#F0EFEC",
  },
};

const VERDICT_ICONS: Record<string, string> = {
  reproduced: "●",   // filled circle
  contradicted: "✗",  // cross mark
  fragile: "△",      // triangle
  inconclusive: "○", // open circle
  untested: "—",     // em dash
};

/* ------------------------------------------------------------------ */
/* Fuzzy text matching                                                 */
/* ------------------------------------------------------------------ */

function findClaimInText(
  paperText: string,
  claimText: string,
): { start: number; end: number } | null {
  if (!claimText || claimText.length < 10) return null;

  const norm = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();

  // Extract key words from the claim (4+ chars, skip common words)
  const stopWords = new Set(["this", "that", "with", "from", "have", "been", "will", "than", "more", "each", "also", "into", "only", "such", "when", "which", "their", "there", "these", "those", "where", "while", "about"]);
  const claimKeyWords = norm(claimText)
    .split(" ")
    .filter(w => w.length >= 4 && !stopWords.has(w));

  if (claimKeyWords.length < 2) return null;

  // Strategy: scan the paper in overlapping windows, score each by
  // how many claim key words it contains. Pick the best window.
  const windowChars = Math.max(claimText.length * 2, 300);
  const stepSize = 50;
  const normPaper = norm(paperText);

  let bestScore = 0;
  let bestNormPos = 0;

  for (let i = 0; i <= normPaper.length - 50; i += stepSize) {
    const window = normPaper.slice(i, i + windowChars);
    let hits = 0;
    for (const kw of claimKeyWords) {
      if (window.includes(kw)) hits++;
    }
    const score = hits / claimKeyWords.length;
    if (score > bestScore) {
      bestScore = score;
      bestNormPos = i;
    }
  }

  // Require at least 60% of key words to match
  if (bestScore < 0.6) return null;

  // Map normalized position back to original text
  const posMap = buildNormPosMap(paperText);
  const origStart = posMap[bestNormPos];
  if (origStart === undefined) return null;

  // Find a reasonable end — look for the specific matching region
  // within the window by finding first and last key word occurrences
  const windowNorm = normPaper.slice(bestNormPos, bestNormPos + windowChars);
  let firstHit = windowChars;
  let lastHit = 0;
  for (const kw of claimKeyWords) {
    const pos = windowNorm.indexOf(kw);
    if (pos >= 0) {
      if (pos < firstHit) firstHit = pos;
      const endPos = pos + kw.length;
      if (endPos > lastHit) lastHit = endPos;
    }
  }

  const spanStartNorm = bestNormPos + firstHit;
  const spanEndNorm = bestNormPos + lastHit;

  const oStart = posMap[Math.min(spanStartNorm, posMap.length - 1)] ?? origStart;
  const oEnd = posMap[Math.min(spanEndNorm, posMap.length - 1)] ?? (origStart + claimText.length);

  // Validation: verify the original text at this range has meaningful overlap
  const extracted = paperText.slice(oStart, oEnd);
  const extractedNorm = norm(extracted);
  let validHits = 0;
  for (const kw of claimKeyWords) {
    if (extractedNorm.includes(kw)) validHits++;
  }
  if (validHits / claimKeyWords.length < 0.4) return null;

  return { start: oStart, end: oEnd };
}

function buildNormPosMap(original: string): number[] {
  const map: number[] = [];
  for (let i = 0; i < original.length; i++) {
    const ch = original[i].toLowerCase();
    if (/[a-z0-9\s]/.test(ch)) {
      map.push(i);
    }
  }
  return map;
}

/* ------------------------------------------------------------------ */
/* Markdown rendering helpers                                          */
/* ------------------------------------------------------------------ */

/**
 * Render a segment of text with inline markdown formatting.
 * Handles: **bold**, *italic*, `code`, $math$.
 */
function renderInlineMarkdown(text: string): string {
  let html = text;
  // Escape HTML entities
  html = html
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  // Code spans first (to avoid processing their contents)
  html = html.replace(/`([^`]+)`/g, '<code style="background:#F5F3EF;padding:1px 4px;border-radius:3px;font-size:0.85em;font-family:monospace">$1</code>');
  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // Italic
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  // Math (inline)
  html = html.replace(
    /\$([^$]+)\$/g,
    '<span style="font-style:italic;font-family:Georgia,serif;color:#3D3D3D">$1</span>',
  );
  return html;
}

/* ------------------------------------------------------------------ */
/* Build annotated HTML from text + spans                              */
/* ------------------------------------------------------------------ */

interface Span {
  start: number;
  end: number;
  claimIdx: number;
}

function buildAnnotatedHtml(
  text: string,
  spans: Span[],
  claims: AnnotatedClaim[],
  hoveredIdx: number | null,
  activeIdx: number | null,
): string {
  // Sort spans by start position, then by length (longer first for nesting)
  const sorted = [...spans].sort((a, b) => a.start - b.start || b.end - a.end);

  // Remove overlapping spans (keep the first one at each position)
  const nonOverlapping: Span[] = [];
  let lastEnd = -1;
  for (const span of sorted) {
    if (span.start >= lastEnd) {
      nonOverlapping.push(span);
      lastEnd = span.end;
    }
  }

  let result = "";
  let pos = 0;

  for (const span of nonOverlapping) {
    // Add text before this span
    if (span.start > pos) {
      result += renderTextBlock(text.slice(pos, span.start));
    }
    // Add the highlighted span
    const claim = claims[span.claimIdx];
    const styles = VERDICT_STYLES[claim.verdict] ?? VERDICT_STYLES.untested;
    const isHovered = hoveredIdx === span.claimIdx;
    const isActive = activeIdx === span.claimIdx;
    const opacity = isHovered || isActive ? "1" : "0.7";
    const outline = isActive ? `2px solid ${styles.border}` : isHovered ? `1px solid ${styles.border}` : "none";
    const spanText = text.slice(span.start, span.end);

    result += `<mark data-claim-idx="${span.claimIdx}" style="background:${styles.markBg};opacity:${opacity};outline:${outline};border-radius:2px;padding:1px 2px;cursor:pointer;transition:all 0.15s ease">${renderTextBlock(spanText)}</mark>`;
    pos = span.end;
  }

  // Add remaining text
  if (pos < text.length) {
    result += renderTextBlock(text.slice(pos));
  }

  return result;
}

function renderTextBlock(text: string): string {
  return renderInlineMarkdown(text);
}

/* ------------------------------------------------------------------ */
/* Parse markdown structure into blocks                                */
/* ------------------------------------------------------------------ */

interface Block {
  type: "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "hr" | "table" | "codeblock" | "blockquote" | "mathblock" | "paragraph";
  raw: string;
  charStart: number;
  charEnd: number;
}

function parseMarkdownBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const lines = text.split("\n");
  let pos = 0;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const lineStart = pos;
    const lineEnd = pos + line.length;

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.*)/);
    if (headingMatch) {
      const level = headingMatch[1].length as 1 | 2 | 3 | 4 | 5 | 6;
      blocks.push({
        type: `h${level}` as Block["type"],
        raw: line,
        charStart: lineStart,
        charEnd: lineEnd,
      });
      pos = lineEnd + 1;
      i++;
      continue;
    }

    // Horizontal rule
    if (/^---+\s*$/.test(line) || /^\*\*\*+\s*$/.test(line)) {
      blocks.push({ type: "hr", raw: line, charStart: lineStart, charEnd: lineEnd });
      pos = lineEnd + 1;
      i++;
      continue;
    }

    // Code block
    if (line.trimStart().startsWith("```")) {
      const codeLines = [line];
      let j = i + 1;
      let cEnd = lineEnd;
      while (j < lines.length) {
        codeLines.push(lines[j]);
        cEnd += 1 + lines[j].length;
        if (lines[j].trimStart().startsWith("```")) {
          j++;
          break;
        }
        j++;
      }
      blocks.push({
        type: "codeblock",
        raw: codeLines.join("\n"),
        charStart: lineStart,
        charEnd: cEnd,
      });
      pos = cEnd + 1;
      i = j;
      continue;
    }

    // Math block ($$...$$)
    if (line.trimStart().startsWith("$$")) {
      const mathLines = [line];
      let j = i + 1;
      let mEnd = lineEnd;
      if (!line.trimEnd().endsWith("$$") || line.trim() === "$$") {
        while (j < lines.length) {
          mathLines.push(lines[j]);
          mEnd += 1 + lines[j].length;
          if (lines[j].trimEnd().endsWith("$$")) {
            j++;
            break;
          }
          j++;
        }
      }
      blocks.push({
        type: "mathblock",
        raw: mathLines.join("\n"),
        charStart: lineStart,
        charEnd: mEnd,
      });
      pos = mEnd + 1;
      i = j;
      continue;
    }

    // Table (starts with |)
    if (line.trimStart().startsWith("|")) {
      const tableLines = [line];
      let j = i + 1;
      let tEnd = lineEnd;
      while (j < lines.length && lines[j].trimStart().startsWith("|")) {
        tableLines.push(lines[j]);
        tEnd += 1 + lines[j].length;
        j++;
      }
      blocks.push({
        type: "table",
        raw: tableLines.join("\n"),
        charStart: lineStart,
        charEnd: tEnd,
      });
      pos = tEnd + 1;
      i = j;
      continue;
    }

    // Blockquote
    if (line.trimStart().startsWith(">")) {
      const bqLines = [line];
      let j = i + 1;
      let bEnd = lineEnd;
      while (j < lines.length && (lines[j].trimStart().startsWith(">") || (lines[j].trim() !== "" && !lines[j].match(/^#{1,6}\s/)))) {
        if (lines[j].trim() === "") break;
        bqLines.push(lines[j]);
        bEnd += 1 + lines[j].length;
        j++;
      }
      blocks.push({
        type: "blockquote",
        raw: bqLines.join("\n"),
        charStart: lineStart,
        charEnd: bEnd,
      });
      pos = bEnd + 1;
      i = j;
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      pos = lineEnd + 1;
      i++;
      continue;
    }

    // Paragraph: collect consecutive non-empty, non-special lines
    const paraLines = [line];
    let j = i + 1;
    let pEnd = lineEnd;
    while (j < lines.length) {
      const nextLine = lines[j];
      if (
        nextLine.trim() === "" ||
        nextLine.match(/^#{1,6}\s/) ||
        nextLine.trimStart().startsWith("```") ||
        nextLine.trimStart().startsWith("$$") ||
        nextLine.trimStart().startsWith("|") ||
        nextLine.trimStart().startsWith(">") ||
        /^---+\s*$/.test(nextLine) ||
        /^\*\*\*+\s*$/.test(nextLine)
      ) {
        break;
      }
      paraLines.push(nextLine);
      pEnd += 1 + nextLine.length;
      j++;
    }

    blocks.push({
      type: "paragraph",
      raw: paraLines.join("\n"),
      charStart: lineStart,
      charEnd: pEnd,
    });
    pos = pEnd + 1;
    i = j;
  }

  return blocks;
}

/* ------------------------------------------------------------------ */
/* Render a single block as HTML                                       */
/* ------------------------------------------------------------------ */

function renderBlock(
  block: Block,
  spans: Span[],
  claims: AnnotatedClaim[],
  hoveredIdx: number | null,
  activeIdx: number | null,
): string {
  // Find spans that overlap this block
  const blockSpans = spans
    .filter((s) => s.start < block.charEnd && s.end > block.charStart)
    .map((s) => ({
      ...s,
      start: Math.max(s.start - block.charStart, 0),
      end: Math.min(s.end - block.charStart, block.raw.length),
    }));

  switch (block.type) {
    case "h1":
      return `<h1 style="font-size:1.8em;font-weight:700;margin:1.2em 0 0.5em;line-height:1.3;color:#1A1A1A;font-family:Georgia,serif">${buildAnnotatedHtml(block.raw.replace(/^#\s+/, ""), offsetSpans(blockSpans, block.raw.indexOf(block.raw.replace(/^#\s+/, ""))), claims, hoveredIdx, activeIdx)}</h1>`;
    case "h2":
      return `<h2 style="font-size:1.4em;font-weight:700;margin:1.5em 0 0.4em;line-height:1.3;color:#1A1A1A;font-family:Georgia,serif;border-bottom:1px solid #E8E5DE;padding-bottom:0.3em">${buildAnnotatedHtml(block.raw.replace(/^##\s+/, ""), offsetSpans(blockSpans, block.raw.indexOf(block.raw.replace(/^##\s+/, ""))), claims, hoveredIdx, activeIdx)}</h2>`;
    case "h3":
      return `<h3 style="font-size:1.2em;font-weight:700;margin:1.2em 0 0.3em;line-height:1.3;color:#1A1A1A;font-family:Georgia,serif">${buildAnnotatedHtml(block.raw.replace(/^###\s+/, ""), offsetSpans(blockSpans, block.raw.indexOf(block.raw.replace(/^###\s+/, ""))), claims, hoveredIdx, activeIdx)}</h3>`;
    case "h4":
    case "h5":
    case "h6": {
      const hLevel = block.type;
      const size = hLevel === "h4" ? "1.05em" : "0.95em";
      const prefix = new RegExp(`^#{${hLevel[1]}}\\s+`);
      return `<${hLevel} style="font-size:${size};font-weight:600;margin:1em 0 0.3em;line-height:1.3;color:#3D3D3D;font-family:Georgia,serif">${buildAnnotatedHtml(block.raw.replace(prefix, ""), offsetSpans(blockSpans, block.raw.length - block.raw.replace(prefix, "").length), claims, hoveredIdx, activeIdx)}</${hLevel}>`;
    }
    case "hr":
      return '<hr style="border:none;border-top:1px solid #E8E5DE;margin:1.5em 0" />';
    case "codeblock": {
      const inner = block.raw.replace(/^```[^\n]*\n?/, "").replace(/\n?```\s*$/, "");
      return `<pre style="background:#F5F3EF;padding:12px 16px;border-radius:6px;font-size:0.85em;line-height:1.5;overflow-x:auto;margin:1em 0;font-family:monospace;border:1px solid #E8E5DE"><code>${inner.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code></pre>`;
    }
    case "mathblock": {
      const inner = block.raw.replace(/^\$\$\s*/, "").replace(/\s*\$\$$/, "").trim();
      return `<div style="text-align:center;margin:1em 0;padding:8px 0;font-style:italic;font-family:Georgia,serif;color:#3D3D3D;font-size:0.95em;overflow-x:auto">${inner.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>`;
    }
    case "table": {
      const rows = block.raw.split("\n").filter((r) => r.trim());
      // Skip separator rows (---+|---+)
      const dataRows = rows.filter((r) => !/^\|[\s-:|]+\|$/.test(r));
      if (dataRows.length === 0) return "";
      const headerCells = dataRows[0].split("|").filter((c) => c.trim());
      const bodyRows = dataRows.slice(1);
      let html = '<div style="overflow-x:auto;margin:1em 0"><table style="border-collapse:collapse;width:100%;font-size:0.85em">';
      html += "<thead><tr>";
      for (const cell of headerCells) {
        html += `<th style="border:1px solid #E8E5DE;padding:6px 10px;text-align:left;background:#F5F3EF;font-weight:600;color:#1A1A1A">${renderInlineMarkdown(cell.trim())}</th>`;
      }
      html += "</tr></thead><tbody>";
      for (const row of bodyRows) {
        const cells = row.split("|").filter((c) => c.trim());
        html += "<tr>";
        for (const cell of cells) {
          html += `<td style="border:1px solid #E8E5DE;padding:6px 10px;color:#3D3D3D">${renderInlineMarkdown(cell.trim())}</td>`;
        }
        html += "</tr>";
      }
      html += "</tbody></table></div>";
      return html;
    }
    case "blockquote": {
      const inner = block.raw
        .split("\n")
        .map((l) => l.replace(/^>\s?/, ""))
        .join("\n");
      return `<blockquote style="border-left:3px solid #E8E5DE;padding-left:16px;margin:1em 0;color:#6B6B6B;font-style:italic">${buildAnnotatedHtml(inner, blockSpans, claims, hoveredIdx, activeIdx)}</blockquote>`;
    }
    case "paragraph":
      return `<p style="margin:0.8em 0;line-height:1.6">${buildAnnotatedHtml(block.raw, blockSpans, claims, hoveredIdx, activeIdx)}</p>`;
    default:
      return `<p style="margin:0.8em 0;line-height:1.6">${buildAnnotatedHtml(block.raw, blockSpans, claims, hoveredIdx, activeIdx)}</p>`;
  }
}

function offsetSpans(spans: Span[], offset: number): Span[] {
  if (offset <= 0) return spans;
  return spans.map((s) => ({
    ...s,
    start: Math.max(s.start - offset, 0),
    end: s.end - offset,
  }));
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export function AnnotatedPaper({ paperText, format, claims }: Props) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const leftPaneRef = useRef<HTMLDivElement>(null);
  const rightPaneRef = useRef<HTMLDivElement>(null);
  const markRefs = useRef<Map<number, HTMLElement>>(new Map());
  const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Compute spans for claims
  const spans = useMemo(() => {
    const result: Span[] = [];
    for (let i = 0; i < claims.length; i++) {
      const claim = claims[i];
      if (claim.spanStart !== null && claim.spanEnd !== null) {
        result.push({ start: claim.spanStart, end: claim.spanEnd, claimIdx: i });
      } else {
        // Fuzzy match
        const match = findClaimInText(paperText, claim.text);
        if (match) {
          result.push({ start: match.start, end: match.end, claimIdx: i });
        }
      }
    }
    return result;
  }, [paperText, claims]);

  // Parse blocks and render HTML
  const blocks = useMemo(() => parseMarkdownBlocks(paperText), [paperText]);
  const isMarkdown = format === "markdown";

  const leftHtml = useMemo(() => {
    if (isMarkdown) {
      return blocks.map((b) => renderBlock(b, spans, claims, hoveredIdx, activeIdx)).join("");
    }
    // Plaintext: wrap in paragraphs by double-newline
    const paragraphs = paperText.split(/\n\n+/);
    let pos = 0;
    return paragraphs
      .map((p) => {
        const start = paperText.indexOf(p, pos);
        const end = start + p.length;
        pos = end;
        const paraSpans = spans
          .filter((s) => s.start < end && s.end > start)
          .map((s) => ({
            ...s,
            start: Math.max(s.start - start, 0),
            end: Math.min(s.end - start, p.length),
          }));
        return `<p style="margin:0.8em 0;line-height:1.6">${buildAnnotatedHtml(p, paraSpans, claims, hoveredIdx, activeIdx)}</p>`;
      })
      .join("");
  }, [isMarkdown, blocks, spans, claims, hoveredIdx, activeIdx, paperText, format]);

  // Track vertical positions of marks in the left pane
  const [markPositions, setMarkPositions] = useState<Map<number, number>>(new Map());

  const updateMarkPositions = useCallback(() => {
    if (!leftPaneRef.current) return;
    const leftRect = leftPaneRef.current.getBoundingClientRect();
    const leftScrollTop = leftPaneRef.current.scrollTop;
    const newPositions = new Map<number, number>();

    const marks = leftPaneRef.current.querySelectorAll<HTMLElement>("mark[data-claim-idx]");
    marks.forEach((mark) => {
      const idx = parseInt(mark.getAttribute("data-claim-idx") ?? "-1", 10);
      if (idx >= 0) {
        const markRect = mark.getBoundingClientRect();
        newPositions.set(idx, markRect.top - leftRect.top + leftScrollTop);
        markRefs.current.set(idx, mark);
      }
    });
    setMarkPositions(newPositions);
  }, []);

  useEffect(() => {
    updateMarkPositions();
    // Also update on scroll of left pane
    const leftPane = leftPaneRef.current;
    if (leftPane) {
      leftPane.addEventListener("scroll", updateMarkPositions);
      window.addEventListener("resize", updateMarkPositions);
      return () => {
        leftPane.removeEventListener("scroll", updateMarkPositions);
        window.removeEventListener("resize", updateMarkPositions);
      };
    }
  }, [leftHtml, updateMarkPositions]);

  // Click handler for marks in the left pane
  const handleLeftClick = useCallback(
    (e: React.MouseEvent) => {
      const mark = (e.target as HTMLElement).closest("mark[data-claim-idx]");
      if (mark) {
        const idx = parseInt(mark.getAttribute("data-claim-idx") ?? "-1", 10);
        if (idx >= 0) {
          setActiveIdx(idx);
          setExpandedIdx(idx);
          // Scroll right pane to the card
          const card = cardRefs.current.get(idx);
          if (card && rightPaneRef.current) {
            card.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }
      }
    },
    [],
  );

  // Mouse events for marks
  const handleLeftMouseOver = useCallback(
    (e: React.MouseEvent) => {
      const mark = (e.target as HTMLElement).closest("mark[data-claim-idx]");
      if (mark) {
        const idx = parseInt(mark.getAttribute("data-claim-idx") ?? "-1", 10);
        if (idx >= 0) setHoveredIdx(idx);
      }
    },
    [],
  );

  const handleLeftMouseOut = useCallback(
    (e: React.MouseEvent) => {
      const mark = (e.target as HTMLElement).closest("mark[data-claim-idx]");
      if (mark) {
        setHoveredIdx(null);
      }
    },
    [],
  );

  // Click card -> scroll left pane to highlight
  const handleCardClick = useCallback(
    (idx: number) => {
      setActiveIdx(idx);
      setExpandedIdx((prev) => (prev === idx ? null : idx));
      const mark = markRefs.current.get(idx);
      if (mark && leftPaneRef.current) {
        mark.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    },
    [],
  );

  // Sort claims by their position in text (by span position) for the right panel
  const sortedClaimIndices = useMemo(() => {
    const indices = claims.map((_, i) => i);
    indices.sort((a, b) => {
      const posA = markPositions.get(a) ?? Infinity;
      const posB = markPositions.get(b) ?? Infinity;
      return posA - posB;
    });
    return indices;
  }, [claims, markPositions]);

  // Claims without spans go at the end
  const claimsWithSpans = useMemo(
    () => sortedClaimIndices.filter((i) => spans.some((s) => s.claimIdx === i)),
    [sortedClaimIndices, spans],
  );
  const claimsWithoutSpans = useMemo(
    () => sortedClaimIndices.filter((i) => !spans.some((s) => s.claimIdx === i)),
    [sortedClaimIndices, spans],
  );

  return (
    <div style={{ display: "flex", gap: 0, minHeight: "calc(100vh - 160px)" }}>
      {/* Left pane: paper text */}
      <div
        ref={leftPaneRef}
        onClick={handleLeftClick}
        onMouseOver={handleLeftMouseOver}
        onMouseOut={handleLeftMouseOut}
        style={{
          flex: "0 0 63%",
          maxWidth: "63%",
          overflowY: "auto",
          paddingRight: 32,
          borderRight: "1px solid #E8E5DE",
        }}
      >
        <div
          style={{
            maxWidth: 700,
            margin: "0 auto",
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontSize: "1rem",
            lineHeight: 1.6,
            color: "#1A1A1A",
            paddingBottom: 80,
          }}
          dangerouslySetInnerHTML={{ __html: leftHtml }}
        />
      </div>

      {/* Right pane: verdict cards */}
      <div
        ref={rightPaneRef}
        style={{
          flex: "0 0 37%",
          maxWidth: "37%",
          overflowY: "auto",
          paddingLeft: 24,
          position: "sticky",
          top: 0,
          alignSelf: "flex-start",
          maxHeight: "calc(100vh - 160px)",
        }}
      >
        <div style={{ paddingBottom: 80 }}>
          <p
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#9B9B9B",
              marginBottom: 12,
            }}
          >
            Verdict Annotations ({claims.length})
          </p>

          {claimsWithSpans.map((idx) => (
            <VerdictCard
              key={claims[idx].id}
              ref={(el) => {
                if (el) cardRefs.current.set(idx, el);
              }}
              claim={claims[idx]}
              isHovered={hoveredIdx === idx}
              isActive={activeIdx === idx}
              isExpanded={expandedIdx === idx}
              onClick={() => handleCardClick(idx)}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              topOffset={markPositions.get(idx)}
            />
          ))}

          {claimsWithoutSpans.length > 0 && (
            <>
              <p
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "#9B9B9B",
                  marginTop: 24,
                  marginBottom: 12,
                }}
              >
                Unlocated Claims ({claimsWithoutSpans.length})
              </p>
              {claimsWithoutSpans.map((idx) => (
                <VerdictCard
                  key={claims[idx].id}
                  ref={(el) => {
                    if (el) cardRefs.current.set(idx, el);
                  }}
                  claim={claims[idx]}
                  isHovered={hoveredIdx === idx}
                  isActive={activeIdx === idx}
                  isExpanded={expandedIdx === idx}
                  onClick={() => handleCardClick(idx)}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Verdict Card                                                        */
/* ------------------------------------------------------------------ */

import { forwardRef } from "react";

const VerdictCard = forwardRef<
  HTMLDivElement,
  {
    claim: AnnotatedClaim;
    isHovered: boolean;
    isActive: boolean;
    isExpanded: boolean;
    onClick: () => void;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    topOffset?: number;
  }
>(function VerdictCard(
  { claim, isHovered, isActive, isExpanded, onClick, onMouseEnter, onMouseLeave },
  ref,
) {
  const styles = VERDICT_STYLES[claim.verdict] ?? VERDICT_STYLES.untested;
  const icon = VERDICT_ICONS[claim.verdict] ?? VERDICT_ICONS.untested;

  return (
    <div
      ref={ref}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        borderLeft: `3px solid ${styles.border}`,
        background: isHovered || isActive ? styles.bg : "white",
        borderRadius: 6,
        padding: "10px 12px",
        marginBottom: 8,
        cursor: "pointer",
        transition: "all 0.15s ease",
        boxShadow:
          isActive
            ? `0 0 0 1px ${styles.border}`
            : isHovered
              ? "0 1px 3px rgba(0,0,0,0.08)"
              : "0 1px 2px rgba(0,0,0,0.04)",
        border: `1px solid ${isActive ? styles.border : "#E8E5DE"}`,
        borderLeftWidth: 3,
        borderLeftColor: styles.border,
      }}
    >
      {/* Header: icon + verdict + text preview */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <span
          style={{
            color: styles.text,
            fontSize: 14,
            fontWeight: 700,
            flexShrink: 0,
            marginTop: 1,
          }}
        >
          {icon}
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 3,
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: styles.text,
              }}
            >
              {claim.verdict}
            </span>
            {claim.confidence !== undefined && claim.confidence !== null && (
              <span style={{ fontSize: 11, color: "#9B9B9B" }}>
                {(claim.confidence * 100).toFixed(0)}%
              </span>
            )}
          </div>
          <p
            style={{
              fontSize: 12.5,
              lineHeight: 1.4,
              color: "#3D3D3D",
              margin: 0,
              display: "-webkit-box",
              WebkitLineClamp: isExpanded ? 999 : 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {claim.text}
          </p>
        </div>
      </div>

      {/* Reason (always show first line) */}
      {claim.reason && (
        <p
          style={{
            fontSize: 11.5,
            lineHeight: 1.4,
            color: "#6B6B6B",
            margin: "6px 0 0 22px",
            display: "-webkit-box",
            WebkitLineClamp: isExpanded ? 999 : 1,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {claim.reason}
        </p>
      )}

      {/* Expanded details */}
      {isExpanded && (
        <div
          style={{
            marginTop: 10,
            marginLeft: 22,
            paddingTop: 8,
            borderTop: `1px solid ${isActive ? styles.border + "40" : "#E8E5DE"}`,
          }}
        >
          {claim.reason && (
            <div style={{ marginBottom: 8 }}>
              <p
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "#9B9B9B",
                  marginBottom: 3,
                }}
              >
                Reason
              </p>
              <p
                style={{
                  fontSize: 12,
                  lineHeight: 1.5,
                  color: "#3D3D3D",
                  margin: 0,
                }}
              >
                {claim.reason}
              </p>
            </div>
          )}

          {(claim.measured || claim.expected) && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
                marginBottom: 8,
              }}
            >
              {claim.measured && (
                <div>
                  <p
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      color: "#9B9B9B",
                      marginBottom: 2,
                    }}
                  >
                    Measured
                  </p>
                  <p
                    style={{
                      fontSize: 12,
                      fontFamily: "monospace",
                      fontWeight: 600,
                      color: "#1A1A1A",
                      margin: 0,
                    }}
                  >
                    {claim.measured}
                  </p>
                </div>
              )}
              {claim.expected && (
                <div>
                  <p
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      color: "#9B9B9B",
                      marginBottom: 2,
                    }}
                  >
                    Expected
                  </p>
                  <p
                    style={{
                      fontSize: 12,
                      fontFamily: "monospace",
                      fontWeight: 600,
                      color: "#1A1A1A",
                      margin: 0,
                    }}
                  >
                    {claim.expected}
                  </p>
                </div>
              )}
            </div>
          )}

          {claim.confidence !== undefined && claim.confidence !== null && (
            <div style={{ marginBottom: 4 }}>
              <p
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "#9B9B9B",
                  marginBottom: 4,
                }}
              >
                Verdict Confidence
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div
                  style={{
                    flex: 1,
                    maxWidth: 140,
                    height: 5,
                    borderRadius: 3,
                    background: "#E8E5DE",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${claim.confidence * 100}%`,
                      height: "100%",
                      borderRadius: 3,
                      background: styles.border,
                    }}
                  />
                </div>
                <span
                  style={{
                    fontSize: 11,
                    fontFamily: "monospace",
                    color: "#6B6B6B",
                  }}
                >
                  {(claim.confidence * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
