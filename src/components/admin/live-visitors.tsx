"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Monitor, Smartphone, Tablet } from "lucide-react";
import type { LiveVisitor } from "@/lib/visitors/reports";
import { ago, pageName, sourceLabel } from "@/lib/visitors/format";
import { placeLabel } from "@/lib/visitors/location";

const REFRESH_MS = 15_000;

export function DeviceIcon({ type, className }: { type: string | null; className?: string }) {
  const Icon = type === "mobile" ? Smartphone : type === "tablet" ? Tablet : Monitor;
  return <Icon className={className} aria-label={type ?? "device"} />;
}

/** Who is on the store right now (active in the last five minutes). Refreshes every 15 seconds while the tab is open. */
export function LiveVisitors({ initial }: { initial: LiveVisitor[] }) {
  const [live, setLive] = useState(initial);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let stopped = false;
    async function refresh() {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/admin/visitors/live", { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as { live: LiveVisitor[]; at: string };
        if (!stopped) {
          setLive(body.live);
          setNow(new Date(body.at));
        }
      } catch {
        // Offline for a moment: keep the last list.
      }
    }
    const timer = window.setInterval(refresh, REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  return (
    <div>
      <p className="flex items-center gap-2 text-sm">
        <span className="relative flex size-2.5">
          {live.length > 0 && (
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
          )}
          <span className={`relative inline-flex size-2.5 rounded-full ${live.length ? "bg-success" : "bg-line"}`} />
        </span>
        <strong className="text-2xl font-extrabold tracking-tight">{live.length}</strong>
        <span className="text-muted">on the store now</span>
      </p>
      {live.length > 0 && (
        <ul className="mt-3 divide-y divide-line text-sm">
          {live.slice(0, 12).map((v) => (
            <li key={v.id}>
              <Link
                href={`/admin/visitors/${v.visitorId}`}
                className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2 hover:text-brand"
              >
                <DeviceIcon type={v.deviceType} className="size-4 shrink-0 text-muted" />
                <span className="min-w-0 flex-1 truncate font-semibold">{pageName(v.currentPage)}</span>
                <span className="basis-full pl-7 text-xs text-muted sm:basis-auto sm:pl-0">
                  {placeLabel(v)} · {sourceLabel(v.source)} · {v.pageviews} page{v.pageviews === 1 ? "" : "s"} ·{" "}
                  {ago(v.lastSeenAt, now)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
