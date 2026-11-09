"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, Menu, X } from "lucide-react";
import { BrandLogo } from "../art";
import { buttonClasses } from "../ui/button";

/**
 * Full-screen mobile menu. Rendered into <body> through a portal: the header
 * uses backdrop-filter, which would otherwise trap a `position: fixed` panel
 * inside the header's own box (the overlap bug in the first version).
 */
export function MobileMenu({ links, shopHref }: { links: { href: string; label: string }[]; shopHref: string }) {
  const pathname = usePathname();
  // Remember the page the menu was opened on, so navigating away closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const toggleRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const toggle = toggleRef.current;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenOn(null);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      toggle?.focus();
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        ref={toggleRef}
        type="button"
        onClick={() => setOpenOn(open ? null : pathname)}
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label="Open menu"
        className="-ml-2 grid size-10 place-items-center rounded-full hover:bg-surface"
      >
        <Menu className="size-5" />
      </button>
      {open &&
        createPortal(
          <div
            id="mobile-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="animate-fade-in fixed inset-0 z-[60] flex flex-col bg-white"
          >
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-line px-4">
              <Link href="/" onClick={() => setOpenOn(null)} className="flex items-center gap-2">
                <BrandLogo />
              </Link>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpenOn(null)}
                aria-label="Close menu"
                className="-mr-2 grid size-10 place-items-center rounded-full hover:bg-surface"
              >
                <X className="size-5" />
              </button>
            </div>
            <nav aria-label="Mobile" className="flex-1 overflow-y-auto px-4 py-2">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpenOn(null)}
                  className="flex items-center justify-between border-b border-line py-4 text-lg font-semibold"
                >
                  {link.label}
                  <ChevronRight className="size-5 text-muted" />
                </Link>
              ))}
            </nav>
            <div className="shrink-0 border-t border-line p-4">
              <Link
                href={shopHref}
                onClick={() => setOpenOn(null)}
                className={buttonClasses("primary", "lg", "w-full")}
              >
                Shop sponges
              </Link>
              <p className="mt-3 text-center text-sm text-muted">Free delivery · Cash on Delivery available</p>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
