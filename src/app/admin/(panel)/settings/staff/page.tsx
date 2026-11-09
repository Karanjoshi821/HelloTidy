import type { Metadata } from "next";
import Link from "next/link";
import { createStaffAction } from "@/app/admin/settings-actions";
import { ActionForm } from "@/components/admin/action-form";
import { SettingsTabs } from "@/components/admin/settings-tabs";
import { adminInput, adminSelect, Card, PageHeader } from "@/components/admin/ui";
import { buttonClasses } from "@/components/ui/button";
import { Badge } from "@/components/ui/layout";
import { requireOwner } from "@/lib/auth/dal";
import { listStaff } from "@/lib/auth/staff";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Staff" };

/** Internal page: always rendered per request, navigation may block. */
export const instant = false;

export default async function StaffPage() {
  const me = await requireOwner();
  const staff = await listStaff();

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" />
      <SettingsTabs active="staff" />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card title="People with access" bodyClassName="p-0 sm:p-0">
          <ul className="divide-y divide-line border-t border-line">
            {staff.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/admin/settings/staff/${s.id}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-surface sm:px-5"
                >
                  <span className="min-w-0 flex-1 basis-48">
                    <span className="flex flex-wrap items-center gap-2 font-bold">
                      {s.name}
                      {s.id === me.id && <span className="text-xs font-semibold text-muted">(you)</span>}
                    </span>
                    <span className="block truncate text-sm text-muted">{s.email}</span>
                  </span>
                  <Badge tone={s.role === "owner" ? "brand" : "neutral"}>
                    {s.role === "owner" ? "Owner" : "Staff"}
                  </Badge>
                  {!s.active && <Badge tone="danger">Deactivated</Badge>}
                  {s.active && s.mustChangePassword && <Badge tone="warn">Invite pending</Badge>}
                  <span className="w-full text-xs text-muted">
                    {s.lastLoginAt ? `Last sign-in ${formatDateTime(s.lastLoginAt)}` : "Never signed in"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-6">
          <Card title="Add a person">
            <ActionForm action={createStaffAction} resetOnSuccess className="grid gap-3">
              <label className="grid gap-1 text-sm font-semibold">
                Name
                <input name="name" required maxLength={60} className={adminInput} autoComplete="off" />
              </label>
              <label className="grid gap-1 text-sm font-semibold">
                Email (used to sign in)
                <input name="email" type="email" required maxLength={120} className={adminInput} autoComplete="off" />
              </label>
              <label className="grid gap-1 text-sm font-semibold">
                Role
                <select name="role" defaultValue="staff" className={adminSelect}>
                  <option value="staff">Staff: orders, customers, stock, messages</option>
                  <option value="owner">Owner: everything, incl. prices, refunds, settings</option>
                </select>
              </label>
              <button type="submit" className={buttonClasses("primary", "sm")}>
                Add and get a one-time password
              </button>
            </ActionForm>
          </Card>
          <Card title="What staff can't do">
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
              <li>See sales figures and analytics</li>
              <li>Change prices, packs or discount codes</li>
              <li>Record refunds or export data</li>
              <li>Change settings or manage staff</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
