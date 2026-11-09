import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resetStaffPasswordAction, updateStaffAction } from "@/app/admin/settings-actions";
import { ActionForm } from "@/components/admin/action-form";
import { adminInput, adminSelect, Card, DefinitionList, PageHeader } from "@/components/admin/ui";
import { buttonClasses } from "@/components/ui/button";
import { listAudit } from "@/lib/audit";
import { requireOwner } from "@/lib/auth/dal";
import { getStaff } from "@/lib/auth/staff";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Staff member" };

/** Internal page: always rendered per request, navigation may block. */
export const instant = false;

export default async function StaffMemberPage({ params }: PageProps<"/admin/settings/staff/[id]">) {
  const me = await requireOwner();
  const { id } = await params;
  const person = await getStaff(id);
  if (!person) notFound();
  const self = person.id === me.id;
  const history = await listAudit({ entityType: "staff", entityId: person.id });

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        back={{ href: "/admin/settings/staff", label: "Staff" }}
        title={person.name}
        description={person.email}
      />

      <Card title="Access">
        <ActionForm action={updateStaffAction} className="grid gap-3">
          <input type="hidden" name="id" value={person.id} />
          <label className="grid gap-1 text-sm font-semibold">
            Name
            <input name="name" defaultValue={person.name} required maxLength={60} className={adminInput} />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Role
            <select name="role" defaultValue={person.role} disabled={self} className={adminSelect}>
              <option value="staff">Staff</option>
              <option value="owner">Owner</option>
            </select>
          </label>
          {self && <input type="hidden" name="role" value={person.role} />}
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              name="active"
              defaultChecked={person.active}
              disabled={self}
              className="size-4 accent-brand"
            />
            Can sign in
          </label>
          {self && person.active && <input type="hidden" name="active" value="on" />}
          {self && (
            <p className="text-xs text-muted">You can&apos;t change your own role or access. Ask another owner.</p>
          )}
          <button type="submit" className={buttonClasses("primary", "sm")}>
            Save
          </button>
        </ActionForm>
      </Card>

      {!self && (
        <Card
          title="Password"
          description="Lost their password? Issue a new one-time password. They're signed out everywhere."
        >
          <ActionForm action={resetStaffPasswordAction} confirm={`Reset ${person.name}'s password and sign them out?`}>
            <input type="hidden" name="id" value={person.id} />
            <button type="submit" className={buttonClasses("outline", "sm")}>
              Reset password
            </button>
          </ActionForm>
        </Card>
      )}

      <Card title="Details">
        <DefinitionList
          items={[
            { label: "Added", value: formatDateTime(person.createdAt) },
            { label: "Last sign-in", value: person.lastLoginAt ? formatDateTime(person.lastLoginAt) : "Never" },
            { label: "Signed-in devices", value: person.sessions },
            { label: "Waiting to set own password", value: person.mustChangePassword ? "Yes" : "No" },
          ]}
        />
      </Card>

      {history.rows.length > 0 && (
        <Card title="History">
          <ul className="space-y-2 text-sm">
            {history.rows.map((h) => (
              <li key={h.id}>
                {h.summary}
                <span className="block text-xs text-muted">
                  {formatDateTime(h.createdAt)} · {h.actor}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
