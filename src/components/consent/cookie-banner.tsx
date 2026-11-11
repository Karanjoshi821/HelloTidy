"use client";

import Link from "next/link";
import { Cookie, X } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { chooseConsent, closeCookieSettings, getConsent, useConsent, type ConsentChoice } from "@/lib/consent";
import { reportConsent } from "@/lib/visitors/tracker";

/**
 * Asks once, with Accept and Decline side by side and the same size. Declining
 * is respected: nothing from Google, Microsoft or Meta loads, and the visit is
 * only counted anonymously. Reopened from "Cookie settings" in the footer.
 */
export function CookieBanner() {
  const { choice, reviewing, hydrated } = useConsent();
  // The choice lives in localStorage, which the server render can't see.
  if (!hydrated || (choice !== null && !reviewing)) return null;

  const pick = (next: ConsentChoice) => {
    const previous = getConsent();
    chooseConsent(next);
    reportConsent(next, previous);
  };

  return (
    <section
      aria-labelledby="cookie-banner-title"
      className="animate-fade-in fixed inset-x-3 bottom-3 z-[45] sm:inset-x-auto sm:bottom-5 sm:left-5 sm:w-[25rem]"
    >
      <div className="relative rounded-2xl border border-line bg-white p-4 shadow-xl sm:p-5">
        {reviewing && (
          <button
            type="button"
            onClick={closeCookieSettings}
            aria-label="Close cookie settings"
            className="absolute top-2 right-2 grid size-9 place-items-center rounded-full text-muted hover:bg-surface hover:text-ink"
          >
            <X className="size-4" />
          </button>
        )}
        <h2 id="cookie-banner-title" className="flex items-center gap-2 font-bold">
          <Cookie className="size-5 text-brand" aria-hidden="true" />
          Cookies
        </h2>
        <p className="mt-1.5 text-sm text-muted">
          May we use cookies to see which ads and pages help, and to improve the store? This lets Google Analytics,
          Microsoft Clarity and Meta measure your visit. If you decline, we only count it anonymously.{" "}
          <Link href="/policies/privacy#cookies" className="font-semibold text-ink underline underline-offset-2">
            Privacy policy
          </Link>
        </p>
        {reviewing && choice && (
          <p className="mt-2 text-xs text-muted">
            You {choice === "granted" ? "accepted" : "declined"} cookies. You can change that here.
          </p>
        )}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => pick("denied")} className={buttonClasses("outline", "md")}>
            Decline
          </button>
          <button type="button" onClick={() => pick("granted")} className={buttonClasses("secondary", "md")}>
            Accept
          </button>
        </div>
      </div>
    </section>
  );
}
