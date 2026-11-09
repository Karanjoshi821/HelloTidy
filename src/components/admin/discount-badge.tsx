import { Badge } from "@/components/ui/layout";
import type { DiscountState } from "@/lib/discounts/service";

const STATES: Record<DiscountState, { label: string; tone: "success" | "neutral" | "warn" | "brand" }> = {
  active: { label: "Active", tone: "success" },
  scheduled: { label: "Scheduled", tone: "brand" },
  expired: { label: "Expired", tone: "neutral" },
  disabled: { label: "Disabled", tone: "neutral" },
  used_up: { label: "Used up", tone: "warn" },
};

export function DiscountStateBadge({ state }: { state: DiscountState }) {
  return <Badge tone={STATES[state].tone}>{STATES[state].label}</Badge>;
}
