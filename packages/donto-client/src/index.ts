import { donto as createDonto } from "@donto/client";

export {
  donto,
  type DontoClient,
  type Statement,
  type HistoryResponse,
  type HistoryQuery,
  type Literal,
  type Polarity,
  type SubjectsResponse,
  type SearchResponse,
  type StatementDetail,
} from "@donto/client";

export {
  ensureContext,
  assert,
  assertBatch,
  retract,
  type AssertInput,
  type EnsureContextInput,
} from "@donto/client/ingest";

export { validate } from "@donto/client/shapes";
export { react, reactionsFor } from "@donto/client/react";

export {
  isLiveAt,
  cubeBounds,
  distinctContexts,
  renderObject,
  normaliseLiteral,
  type CubePoint,
} from "@donto/client/history";

export * from "./evidence";

export const DONTOSRV_URL =
  process.env.DONTOSRV_URL ?? "http://localhost:7879";

export function toiletpaperDonto() {
  return createDonto(DONTOSRV_URL);
}
