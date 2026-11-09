import type { Metadata } from "next";
import { History } from "lucide-react";
import { SettingsTabs } from "@/components/admin/settings-tabs";
import { Card, EmptyState, listHref, PageHeader, Pagination, param, Tabs } from "@/components/admin/ui";
import { AUDIT_ENTITY_LABELS, listAudit } from "@/lib/audit";
import { requireOwner } from "@/lib/auth/dal";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Activity log" };

/** Internal page: always rendered per request, navigation may block. */
export const instant = false;

export default async function ActivityPage({ searchParams }: PageProps<"/admin/settings/activity">) {
  await requireOwner();
  const sp = await searchParams;
  const type = param(sp.type);
  const page = Number.parseInt(param(sp.page) ?? "1", 10) || 1;
  const { rows, total, pageCount } = await listAudit({ page, entityType: type });

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" />
      <SettingsTabs active="activity" />
      <p className="text-sm text-muted">
        Who changed what: products and prices, discounts, settings, staff, customers and sign-ins. Order changes are on
        each order&apos;s timeline.
      </p>
      <Tabs
        label="Activity type"
        items={[
          { href: "/admin/settings/activity", label: "All", active: !type },
          ...Object.entries(AUDIT_ENTITY_LABELS).map(([key, label]) => ({
            href: `/admin/settings/activity?type=${key}`,
            label,
            active: type === key,
          })),
        ]}
      />
      <Card bodyClassName="p-0 sm:p-0">
        {rows.length === 0 ? (
          <EmptyState icon={History} title="Nothing here yet" />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id} className="px-4 py-3 text-sm sm:px-5">
                <p className="break-words">{r.summary}</p>
                <p className="text-xs text-muted">
                  {formatDateTime(r.createdAt)} · {r.actor} ·{" "}
                  {AUDIT_ENTITY_LABELS[r.entityType as keyof typeof AUDIT_ENTITY_LABELS] ?? r.entityType}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Pagination
        page={page}
        pageCount={pageCount}
        total={total}
        noun={["entry", "entries"]}
        href={(p) => listHref("/admin/settings/activity", { type }, { page: p })}
      />
    </div>
  );
}
