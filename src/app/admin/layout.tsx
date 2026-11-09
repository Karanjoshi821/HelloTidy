import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin" },
  robots: { index: false, follow: false, nocache: true },
};

/** Admin pages read the session on every request; they are not prerendered. */
export const instant = false;

export default function AdminRootLayout({ children }: LayoutProps<"/admin">) {
  return <div className="flex min-h-full flex-1 flex-col bg-surface">{children}</div>;
}
