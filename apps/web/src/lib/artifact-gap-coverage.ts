import type { ReplicationGapManifest } from "@/lib/replication-gap-manifest";
import type {
  PaperArtifactBundle,
  PaperArtifactFile,
  PaperArtifactManifest,
} from "@/lib/paper-artifacts";

type Priority = "critical" | "high" | "medium";

interface CoverageRule {
  kind: string;
  patterns: RegExp[];
}

export interface ArtifactGapFileMatch {
  bundleId: string;
  bundleNote: string | null;
  fileId: string;
  originalName: string;
  storedName: string;
  relativePath: string;
  contentType: string;
  byteLength: number;
  sha256: string;
  sourceKind: "upload" | "url";
  sourceUrl: string | null;
  score: number;
  matchedReasons: string[];
}

export interface ArtifactGapRequestCoverage {
  requestKind: string;
  label: string;
  priority: Priority;
  unitCount: number;
  simulationCount: number;
  status: "candidate" | "unmatched";
  matchedFileCount: number;
  matchedBytes: number;
  matches: ArtifactGapFileMatch[];
}

export interface ArtifactGapCoverage {
  schemaVersion: "toiletpaper.artifact-gap-coverage.v1";
  artifactBundleCount: number;
  artifactFileCount: number;
  artifactBytes: number;
  requestCount: number;
  candidateRequestCount: number;
  unmatchedRequestCount: number;
  matchedFileCount: number;
  unmatchedFileCount: number;
  requestCoverage: ArtifactGapRequestCoverage[];
  unmatchedFiles: ArtifactGapFileMatch[];
}

const EXT = String.raw`(?:^|[.\-_/])`;

const COVERAGE_RULES: CoverageRule[] = [
  {
    kind: "md-input-decks",
    patterns: [
      /\blammps\b/i,
      /\bnemd\b/i,
      /\bpair[-_ ]?style\b/i,
      /\binput[-_ ]?(deck|file|script)s?\b/i,
      /\.in(?:$|[._/-])/i,
      /\.lammps(?:$|[._/-])/i,
      new RegExp(`${EXT}(?:in|lmp|lammps)(?:$|[._/-])`, "i"),
    ],
  },
  {
    kind: "potential-files",
    patterns: [
      /\bpotential\b/i,
      /\bairebo\b/i,
      /\beam\b/i,
      /\bmeam\b/i,
      /\btersoff\b/i,
      /\breaxff\b/i,
      /\bforce[-_ ]?field\b/i,
      new RegExp(`${EXT}(?:eam|meam|mod|ffield|pot)(?:$|[._/-])`, "i"),
    ],
  },
  {
    kind: "structure-files",
    patterns: [
      /\bstructure\b/i,
      /\bgeometry\b/i,
      /\batomistic\b/i,
      /\bcell[-_ ]?geometry\b/i,
      new RegExp(`${EXT}(?:xyz|pdb|cif|gro|data|mol2)(?:$|[._/-])`, "i"),
    ],
  },
  {
    kind: "trajectories",
    patterns: [
      /\btrajectory\b/i,
      /\btrajectories\b/i,
      /\blammpstrj\b/i,
      /\bdump[-_ ]?file\b/i,
      /\bheat[-_ ]?flux\b/i,
      /\btemperature[-_ ]?profile\b/i,
      new RegExp(`${EXT}(?:xtc|dcd|trr|lammpstrj|dump)(?:$|[._/-])`, "i"),
    ],
  },
  {
    kind: "image-data",
    patterns: [
      /\bhrtem\b/i,
      /\btem\b/i,
      /\bmicroscopy\b/i,
      /\bsegmentation\b/i,
      /\bimage[-_ ]?data\b/i,
      /\bmask\b/i,
      new RegExp(`${EXT}(?:tif|tiff|png|jpg|jpeg|dm3|dm4)(?:$|[._/-])`, "i"),
    ],
  },
  {
    kind: "fitting-artifacts",
    patterns: [
      /\bfitting?\b/i,
      /\bfit[-_ ]?parameter/i,
      /\bema\b/i,
      /\bkapitza\b/i,
      /\bnotebook\b/i,
      new RegExp(`${EXT}(?:ipynb|nb|mlx)(?:$|[._/-])`, "i"),
    ],
  },
  {
    kind: "clean-source",
    patterns: [
      /\bmanuscript\b/i,
      /\bclean[-_ ]?source\b/i,
      /\blatex\b/i,
      /\bequation[-_ ]?source\b/i,
      new RegExp(`${EXT}(?:tex|bib)(?:$|[._/-])`, "i"),
    ],
  },
  {
    kind: "raw-measurements",
    patterns: [
      /\braw[-_ ]?(measurement|data|experimental)\b/i,
      /\blfa\b/i,
      /\blaser[-_ ]?flash\b/i,
      /\bdsc\b/i,
      /\bdensity\b/i,
      /\barchimedes\b/i,
      /\bporosity\b/i,
      new RegExp(`${EXT}(?:csv|tsv|xlsx|xls)(?:$|[._/-])`, "i"),
    ],
  },
  {
    kind: "monte-carlo-code",
    patterns: [/\bmonte[-_ ]?carlo\b/i, /\bpercolation\b/i, /\bexcluded[-_ ]?volume\b/i],
  },
  {
    kind: "source-code",
    patterns: [
      /\bsource[-_ ]?code\b/i,
      /\bscript\b/i,
      /\bimplementation\b/i,
      /\bgithub\.com\b/i,
      new RegExp(`${EXT}(?:py|r|m|jl|cpp|cc|c|h|hpp|rs|go|ts|js|sh|ipynb)(?:$|[._/-])`, "i"),
    ],
  },
  {
    kind: "datasets",
    patterns: [
      /\bdataset\b/i,
      /\bdata[-_ ]?file\b/i,
      /\braw[-_ ]?data\b/i,
      new RegExp(`${EXT}(?:csv|tsv|jsonl|parquet|h5|hdf5|npy|npz|mat|zip|tar|gz)(?:$|[._/-])`, "i"),
    ],
  },
  {
    kind: "config",
    patterns: [
      /\bconfig(?:uration)?\b/i,
      /\bparameter[-_ ]?file\b/i,
      /\bparams?\b/i,
      /\bhyperparameter\b/i,
      new RegExp(`${EXT}(?:yaml|yml|toml|ini|cfg|json)(?:$|[._/-])`, "i"),
    ],
  },
  {
    kind: "seeds",
    patterns: [/\bseed\b/i, /\brandom[-_ ]?seed\b/i, /\bseed[-_ ]?policy\b/i],
  },
  {
    kind: "artifact-urls",
    patterns: [
      /\bgithub\.com\b/i,
      /\bzenodo\b/i,
      /\bfigshare\b/i,
      /\bdryad\b/i,
      /\bosf\.io\b/i,
      /\bdoi\.org\b/i,
      /\brepository\b/i,
      /\barchive\b/i,
    ],
  },
  {
    kind: "external-study-data",
    patterns: [/\bcited[-_ ]?study\b/i, /\bliterature\b/i, /\bexternal[-_ ]?data\b/i],
  },
  {
    kind: "human-method-review",
    patterns: [/\bmethod\b/i, /\bprotocol\b/i, /\breadme\b/i, /\breview[-_ ]?notes?\b/i],
  },
];

function fileText(bundle: PaperArtifactBundle, file: PaperArtifactFile) {
  return [
    bundle.fileCount === 1 ? bundle.note : null,
    file.originalName,
    file.storedName,
    file.relativePath,
    file.contentType,
    file.source.url,
    file.source.finalUrl,
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n");
}

function ruleForKind(kind: string) {
  return COVERAGE_RULES.find((rule) => rule.kind === kind) ?? null;
}

function matchFile(
  bundle: PaperArtifactBundle,
  file: PaperArtifactFile,
  rule: CoverageRule,
): ArtifactGapFileMatch | null {
  const text = fileText(bundle, file);
  const matchedReasons = rule.patterns
    .filter((pattern) => pattern.test(text))
    .map((pattern) => pattern.source);
  const fileName = `${file.originalName}\n${file.storedName}\n${file.relativePath}`;

  if (rule.kind === "md-input-decks" && /\.(?:in|lmp|lammps)(?:$|[._/-])/i.test(fileName)) {
    matchedReasons.push("md-input-file-extension");
  }

  if (file.source.kind === "url" && rule.kind === "artifact-urls") {
    matchedReasons.push("source:url");
  }

  const uniqueReasons = [...new Set(matchedReasons)];
  if (uniqueReasons.length === 0) return null;

  return {
    bundleId: bundle.id,
    bundleNote: bundle.note,
    fileId: file.id,
    originalName: file.originalName,
    storedName: file.storedName,
    relativePath: file.relativePath,
    contentType: file.contentType,
    byteLength: file.byteLength,
    sha256: file.sha256,
    sourceKind: file.source.kind,
    sourceUrl: file.source.finalUrl ?? file.source.url ?? null,
    score: uniqueReasons.length,
    matchedReasons: uniqueReasons,
  };
}

function allFiles(manifest: PaperArtifactManifest) {
  return manifest.bundles.flatMap((bundle) =>
    bundle.files.map((file) => ({ bundle, file })),
  );
}

export function summarizeArtifactGapCoverage(input: {
  gapManifest: ReplicationGapManifest;
  artifactManifest: PaperArtifactManifest | null;
}): ArtifactGapCoverage {
  const artifactManifest = input.artifactManifest;
  const files = artifactManifest ? allFiles(artifactManifest) : [];
  const matchedFileIds = new Set<string>();

  const requestCoverage = input.gapManifest.requests.map((request) => {
    const rule = ruleForKind(request.kind);
    const matches = rule
      ? files
          .map(({ bundle, file }) => matchFile(bundle, file, rule))
          .filter((match): match is ArtifactGapFileMatch => Boolean(match))
          .sort(
            (a, b) =>
              b.score - a.score ||
              b.byteLength - a.byteLength ||
              a.originalName.localeCompare(b.originalName),
          )
      : [];

    for (const match of matches) matchedFileIds.add(match.fileId);

    return {
      requestKind: request.kind,
      label: request.label,
      priority: request.priority,
      unitCount: request.unitCount,
      simulationCount: request.simulationCount,
      status: matches.length > 0 ? "candidate" : "unmatched",
      matchedFileCount: matches.length,
      matchedBytes: matches.reduce((sum, match) => sum + match.byteLength, 0),
      matches: matches.slice(0, 10),
    } satisfies ArtifactGapRequestCoverage;
  });

  const unmatchedFiles = files
    .filter(({ file }) => !matchedFileIds.has(file.id))
    .map(({ bundle, file }) => ({
      bundleId: bundle.id,
      bundleNote: bundle.note,
      fileId: file.id,
      originalName: file.originalName,
      storedName: file.storedName,
      relativePath: file.relativePath,
      contentType: file.contentType,
      byteLength: file.byteLength,
      sha256: file.sha256,
      sourceKind: file.source.kind,
      sourceUrl: file.source.finalUrl ?? file.source.url ?? null,
      score: 0,
      matchedReasons: [],
    }))
    .slice(0, 25);

  const candidateRequestCount = requestCoverage.filter(
    (request) => request.status === "candidate",
  ).length;

  return {
    schemaVersion: "toiletpaper.artifact-gap-coverage.v1",
    artifactBundleCount: artifactManifest?.bundleCount ?? 0,
    artifactFileCount: files.length,
    artifactBytes: artifactManifest?.totalBytes ?? 0,
    requestCount: input.gapManifest.requestCount,
    candidateRequestCount,
    unmatchedRequestCount: Math.max(0, input.gapManifest.requestCount - candidateRequestCount),
    matchedFileCount: matchedFileIds.size,
    unmatchedFileCount: Math.max(0, files.length - matchedFileIds.size),
    requestCoverage,
    unmatchedFiles,
  };
}
