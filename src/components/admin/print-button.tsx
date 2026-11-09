"use client";

import { Printer } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className={buttonClasses("primary", "sm")}>
      <Printer className="size-4" /> Print
    </button>
  );
}
