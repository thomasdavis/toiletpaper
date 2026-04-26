import { Badge, type BadgeProps } from "@toiletpaper/ui";

const statusVariant: Record<string, BadgeProps["variant"]> = {
  uploaded: "muted",
  extracting: "default",
  extracted: "default",
  simulating: "warning",
  done: "success",
  error: "danger",
};

export function PaperStatusBadge({ status }: { status: string }) {
  return <Badge variant={statusVariant[status] ?? "muted"}>{status}</Badge>;
}
