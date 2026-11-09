import type { Order, OrderStatus } from "@/lib/db/schema";
import { STATUS_LABELS } from "@/lib/orders/labels";
import { Badge } from "../ui/layout";

const tones: Record<OrderStatus, "brand" | "sun" | "success" | "neutral" | "danger" | "warn"> = {
  pending_payment: "warn",
  confirmed: "sun",
  processing: "brand",
  shipped: "brand",
  delivered: "success",
  cancelled: "neutral",
  rto: "danger",
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={tones[status]}>{STATUS_LABELS[status]}</Badge>;
}

export function PaymentBadge({
  method,
  status,
  refundedAmount = 0,
}: {
  method: Order["paymentMethod"];
  status: Order["paymentStatus"];
  refundedAmount?: number;
}) {
  if (status === "paid" && refundedAmount > 0) return <Badge tone="neutral">Partly refunded</Badge>;
  if (method === "cod") {
    if (status === "refunded") return <Badge tone="neutral">Refunded</Badge>;
    return (
      <Badge tone={status === "paid" ? "success" : "neutral"}>{status === "paid" ? "COD · collected" : "COD"}</Badge>
    );
  }
  const map = {
    paid: ["Prepaid · paid", "success"],
    unpaid: ["Prepaid · unpaid", "warn"],
    failed: ["Prepaid · failed", "danger"],
    refunded: ["Refunded", "neutral"],
  } as const;
  const [label, tone] = map[status];
  return <Badge tone={tone}>{label}</Badge>;
}

export function TagList({ tags }: { tags: string[] }) {
  if (!tags.length) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <span key={t} className="rounded-md bg-surface px-1.5 py-0.5 text-xs font-medium text-ink-soft">
          {t}
        </span>
      ))}
    </span>
  );
}
