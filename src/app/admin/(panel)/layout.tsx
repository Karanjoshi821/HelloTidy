import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { AdminNav } from "@/components/admin/admin-nav";
import { getNavCounts } from "@/lib/admin-nav-counts";
import { getAdmin } from "@/lib/auth/dal";

/**
 * Admin chrome: sidebar (desktop) or top bar + drawer (phone). Each page checks access itself.
 * `data-admin-theme` is where the dark theme applies (globals.css); print pages sit outside it.
 */
export default function AdminPanelLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div data-admin-theme className="flex flex-1 flex-col">
      <Suspense fallback={<ShellSkeleton />}>
        <AdminShell>{children}</AdminShell>
      </Suspense>
    </div>
  );
}

async function AdminShell({ children }: { children: ReactNode }) {
  const user = await getAdmin();
  if (!user) redirect("/admin/login");
  const counts = user.mustChangePassword
    ? { unfulfilled: 0, abandoned: 0, lowStock: 0, newMessages: 0 }
    : await getNavCounts();

  return (
    <div className="flex min-h-full flex-1 flex-col lg:pl-60">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:shadow-card"
      >
        Skip to content
      </a>
      <AdminNav
        role={user.role}
        name={user.name}
        email={user.email}
        counts={counts}
        setupOnly={user.mustChangePassword}
      />
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:py-8">
        <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
      </main>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-48 animate-pulse rounded-lg bg-white" />
      <div className="h-64 animate-pulse rounded-2xl bg-white" />
    </div>
  );
}

function ShellSkeleton() {
  return (
    <div className="flex flex-1 flex-col lg:pl-60">
      <div className="h-14 border-b border-line bg-white lg:hidden" />
      <div className="fixed inset-y-0 left-0 hidden w-60 border-r border-line bg-white lg:block" />
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
        <PageSkeleton />
      </div>
    </div>
  );
}
