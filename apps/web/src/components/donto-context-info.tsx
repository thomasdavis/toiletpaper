import {
  Card,
  CardContent,
  Heading,
  Label,
  Text,
  Badge,
  Code,
  Divider,
} from "@toiletpaper/ui";
import { HelpTip } from "@/components/help-tip";

interface Props {
  contextIri: string;
  kind: string;
  statementCount: number;
  dontoHistory: {
    subject: string;
    count: number;
    rows: Array<{
      predicate: string;
      object_iri?: string | null;
      object_lit?: { v: unknown; dt: string } | null;
    }>;
  } | null;
}

export function DontoContextInfo({
  contextIri,
  kind,
  statementCount,
  dontoHistory,
}: Props) {
  const authors =
    dontoHistory?.rows
      .filter((r) => r.predicate === "schema:author")
      .map((r) => String(r.object_lit?.v ?? "")) ?? [];

  return (
    <Card className="bg-stone-50">
      <CardContent className="p-5">
        <Heading level={6} as="h3">
          Donto Knowledge Graph
        </Heading>
        <div className="mt-3 grid gap-x-8 gap-y-2 sm:grid-cols-3">
          <div>
            <Label>Context</Label>
            <Code>{contextIri}</Code>
          </div>
          <div>
            <div className="flex items-center gap-1">
              <Label>Kind</Label>
              <HelpTip text="candidate = claims awaiting verification. source = verified claims. hypothesis = speculative claims being tested." />
            </div>
            <p>
              <Badge
                variant={kind === "candidate" ? "warning" : "default"}
              >
                {kind}
              </Badge>
            </p>
          </div>
          <div>
            <Label>Statements</Label>
            <Text weight="semibold">{statementCount}</Text>
          </div>
        </div>
        {dontoHistory && dontoHistory.count > 0 && (
          <>
            <Divider />
            <Text size="xs" color="muted">
              Paper entity has {dontoHistory.count} triples
              {authors.length > 0 && (
                <> &middot; {authors.length} authors in graph</>
              )}
            </Text>
          </>
        )}
      </CardContent>
    </Card>
  );
}
