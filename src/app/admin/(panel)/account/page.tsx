import type { Metadata } from "next";
import { Monitor, Smartphone } from "lucide-react";
import {
  changePasswordAction,
  signOutEverywhereAction,
  signOutOthersAction,
  updateProfileAction,
} from "@/app/admin/actions";
import { ActionForm } from "@/components/admin/action-form";
import { adminInput, Card, Notice, PageHeader } from "@/components/admin/ui";
import { buttonClasses } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth/dal";
import { listSessions } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Account" };

/** Internal page: always rendered per request, navigation may block. */
export const instant = false;

function deviceName(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";
  const os = /Android/i.test(userAgent)
    ? "Android"
    : /iPhone|iPad/i.test(userAgent)
      ? "iPhone / iPad"
      : /Windows/i.test(userAgent)
        ? "Windows"
        : /Mac OS/i.test(userAgent)
          ? "Mac"
          : /Linux/i.test(userAgent)
            ? "Linux"
            : "Unknown system";
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Chrome\//.test(userAgent)
      ? "Chrome"
      : /Firefox\//.test(userAgent)
        ? "Firefox"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : "browser";
  return `${browser} on ${os}`;
}

export default async function AccountPage() {
  const user = await requireAdmin({ allowPasswordSetup: true });
  const setup = user.mustChangePassword;
  const sessions = setup ? [] : await listSessions(user.id);

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Account" description={`${user.email} · ${user.role === "owner" ? "Owner" : "Staff"}`} />

      {setup && (
        <Notice tone="warn">
          Welcome! You signed in with a one-time password. Choose your own password to continue: type the one-time
          password as the current password.
        </Notice>
      )}

      <Card title={setup ? "Choose your password" : "Change password"}>
        <ActionForm action={changePasswordAction} resetOnSuccess className="grid gap-3">
          <label className="grid gap-1 text-sm font-semibold">
            {setup ? "One-time password" : "Current password"}
            <input name="current" type="password" autoComplete="current-password" required className={adminInput} />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            New password
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
              className={adminInput}
            />
            <span className="text-xs font-normal text-muted">
              At least 12 characters. A passphrase is easiest to remember.
            </span>
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Confirm new password
            <input
              name="confirm"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
              className={adminInput}
            />
          </label>
          <button type="submit" className={buttonClasses("primary", "sm")}>
            {setup ? "Save and continue" : "Update password"}
          </button>
        </ActionForm>
      </Card>

      {!setup && (
        <>
          <Card title="Your name">
            <ActionForm action={updateProfileAction} className="flex gap-2">
              <input
                name="name"
                defaultValue={user.name}
                required
                maxLength={60}
                className={adminInput}
                aria-label="Your name"
              />
              <button type="submit" className={buttonClasses("secondary", "sm", "h-11 sm:h-10")}>
                Save
              </button>
            </ActionForm>
          </Card>

          <Card title="Signed-in devices" description="Sessions last 7 days. Lost a phone? Sign it out here.">
            <ul className="mb-4 space-y-3">
              {sessions.map((s, i) => {
                const mobile = /Android|iPhone|iPad/i.test(s.userAgent ?? "");
                const Icon = mobile ? Smartphone : Monitor;
                return (
                  <li key={i} className="flex items-start gap-3 text-sm">
                    <Icon className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden="true" />
                    <span>
                      <span className="font-semibold">{deviceName(s.userAgent)}</span>
                      {s.current && (
                        <span className="ml-2 rounded-full bg-success-soft px-2 py-0.5 text-xs font-bold text-success">
                          This device
                        </span>
                      )}
                      <span className="block text-xs text-muted">Signed in {formatDateTime(s.createdAt)}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-wrap gap-2">
              {sessions.length > 1 && (
                <ActionForm action={signOutOthersAction}>
                  <button type="submit" className={buttonClasses("outline", "sm")}>
                    Sign out other devices
                  </button>
                </ActionForm>
              )}
              <form action={signOutEverywhereAction}>
                <button type="submit" className={buttonClasses("outline", "sm")}>
                  Sign out everywhere
                </button>
              </form>
            </div>
          </Card>
        </>
      )}
      {setup && (
        <form action={signOutEverywhereAction}>
          <button type="submit" className="text-sm font-semibold text-muted hover:text-ink">
            Not you? Sign out
          </button>
        </form>
      )}
    </div>
  );
}
