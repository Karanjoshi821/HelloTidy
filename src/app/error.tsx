"use client";

import Link from "next/link";
import { useEffect } from "react";
import { buttonClasses } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-24 text-center">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Something went wrong</h1>
        <p className="mt-3 text-muted">Please try again. If it keeps happening, contact us and we&apos;ll help.</p>
        {error.digest && <p className="mt-2 text-xs text-muted">Reference: {error.digest}</p>}
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <button type="button" onClick={reset} className={buttonClasses("primary", "lg")}>
            Try again
          </button>
          <Link href="/" className={buttonClasses("outline", "lg")}>
            Go home
          </Link>
        </div>
      </div>
    </main>
  );
}
