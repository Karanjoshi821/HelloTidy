"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ChartColumn,
  ExternalLink,
  House,
  LogOut,
  Menu,
  MessageSquare,
  Package,
  Search,
  Settings,
  ShoppingBag,
  ShoppingCart,
  TicketPercent,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { logoutAction } from "@/app/admin/actions";
import { LogoMark } from "@/components/art";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";

export type NavCounts = { unfulfilled: number; abandoned: number; lowStock: number; newMessages: number };

type Item = {
  href: string;
  label: string;
  icon: LucideIcon;
  count?: number;
  /** Highlight counts that mean "go and fix something". */
  alert?: boolean;
  ownerOnly?: boolean;
  child?: boolean;
  /** Only this exact path, so a parent isn't highlighted with its child. */
  exact?: boolean;
  /** Other pages that belong to this item. */
  also?: RegExp;
};

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  if (href === "/admin" || exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminNav({
  role,
  name,
  email,
  counts,
  setupOnly,
}: {
  role: "owner" | "staff";
  name: string;
  email: string;
  counts: NavCounts;
  /** Signed in with a one-time password: only Account is reachable until it's changed. */
  setupOnly: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const items: Item[] = setupOnly
    ? []
    : [
        { href: "/admin", label: "Home", icon: House },
        { href: "/admin/orders", label: "Orders", icon: ShoppingBag, count: counts.unfulfilled },
        {
          href: "/admin/checkouts",
          label: "Abandoned checkouts",
          icon: ShoppingCart,
          count: counts.abandoned,
          child: true,
        },
        { href: "/admin/products", label: "Products", icon: Package, count: counts.lowStock, alert: true },
        { href: "/admin/customers", label: "Customers", icon: Users },
        { href: "/admin/discounts", label: "Discounts", icon: TicketPercent, ownerOnly: true },
        { href: "/admin/analytics", label: "Analytics", icon: ChartColumn, ownerOnly: true },
        { href: "/admin/visitors", label: "Visitors", icon: Activity, ownerOnly: true, exact: true },
        {
          href: "/admin/visitors/all",
          label: "Visitor list",
          icon: Users,
          ownerOnly: true,
          child: true,
          also: /^\/admin\/visitors\/[0-9a-f-]{36}$/,
        },
        { href: "/admin/messages", label: "Messages", icon: MessageSquare, count: counts.newMessages, alert: true },
        { href: "/admin/settings", label: "Settings", icon: Settings, ownerOnly: true },
      ].filter((item) => !item.ownerOnly || role === "owner");

  // Escape closes the drawer; page scroll is locked while it's open. Links close it on click.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open]);

  const links = (
    <nav aria-label="Admin" className="flex-1 overflow-y-auto px-3 py-4">
      <ul className="space-y-0.5">
        {items.map((item) => {
          const active = isActive(pathname, item.href, item.exact) || Boolean(item.also?.test(pathname));
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors",
                  item.child && "ml-4 h-9 text-[13px]",
                  active ? "bg-ink text-white" : "text-ink-soft hover:bg-surface hover:text-ink",
                )}
              >
                <Icon className={cn("shrink-0", item.child ? "size-4" : "size-[18px]")} aria-hidden="true" />
                <span className="flex-1 truncate">{item.label}</span>
                {item.count ? (
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-bold",
                      active ? "bg-white/20 text-white" : item.alert ? "bg-warn-soft text-warn" : "bg-surface text-ink",
                    )}
                  >
                    {item.count}
                    <span className="sr-only"> {item.alert ? "need attention" : "open"}</span>
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );

  const footer = (
    <div className="space-y-1 border-t border-line p-3">
      <div className="flex items-center gap-2">
        <ThemeToggle className="shrink-0" />
        <Link
          href="/admin/account"
          onClick={() => setOpen(false)}
          aria-current={isActive(pathname, "/admin/account") ? "page" : undefined}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2 text-sm hover:bg-surface",
            isActive(pathname, "/admin/account") && "bg-surface",
          )}
        >
          <UserRound className="size-[18px] shrink-0 text-muted" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{name}</span>
            <span className="block truncate text-xs text-muted">
              {email} · {role}
            </span>
          </span>
        </Link>
      </div>
      <div className="flex gap-1">
        <a
          href="/"
          target="_blank"
          rel="noopener"
          className="flex h-9 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-semibold text-ink-soft hover:bg-surface"
        >
          <ExternalLink className="size-4" aria-hidden="true" /> View store
        </a>
        <form action={logoutAction} className="flex-1">
          <button
            type="submit"
            className="flex h-9 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-ink-soft hover:bg-surface"
          >
            <LogOut className="size-4" aria-hidden="true" /> Sign out
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      {/* Phone / tablet top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-white px-2 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="grid size-10 place-items-center rounded-full hover:bg-surface"
          aria-label="Open menu"
          aria-expanded={open}
          aria-controls="admin-drawer"
        >
          <Menu className="size-5" />
        </button>
        <Link href="/admin" className="flex items-center gap-2 font-extrabold" aria-label="Admin home">
          <LogoMark className="size-7" />
          <span>Admin</span>
        </Link>
        {!setupOnly && (
          <Link
            href="/admin/search"
            className="ml-auto grid size-10 place-items-center rounded-full hover:bg-surface"
            aria-label="Search"
          >
            <Search className="size-5" />
          </Link>
        )}
      </header>

      {/* Phone drawer */}
      {open && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          id="admin-drawer"
        >
          <button
            type="button"
            className="animate-fade-in absolute inset-0 bg-ink/40"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
          <div
            ref={panelRef}
            className="animate-drawer-in absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-2xl"
          >
            <div className="flex h-14 items-center justify-between border-b border-line px-4">
              <span className="flex items-center gap-2 font-extrabold">
                <LogoMark className="size-7" /> Admin
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid size-10 place-items-center rounded-full hover:bg-surface"
                aria-label="Close menu"
              >
                <X className="size-5" />
              </button>
            </div>
            {links}
            {footer}
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-white lg:flex">
        <Link href="/admin" className="flex h-16 items-center gap-2 border-b border-line px-5 font-extrabold">
          <LogoMark className="size-8" />
          <span className="text-lg">Store admin</span>
        </Link>
        {!setupOnly && (
          <form action="/admin/search" role="search" className="relative px-3 pt-3">
            <Search className="pointer-events-none absolute top-1/2 left-6 mt-1.5 size-4 -translate-y-1/2 text-muted" />
            <input
              name="q"
              type="search"
              placeholder="Search"
              aria-label="Search orders, customers, products"
              className="h-9 w-full rounded-xl border border-line bg-surface pr-3 pl-9 text-sm outline-none focus:border-brand focus:bg-white"
            />
          </form>
        )}
        {links}
        {footer}
      </aside>
    </>
  );
}
