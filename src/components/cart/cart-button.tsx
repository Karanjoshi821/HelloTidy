"use client";

import { ShoppingBag } from "lucide-react";
import { useCart } from "./cart-context";

export function CartButton() {
  const { count, open, hydrated } = useCart();
  return (
    <button
      type="button"
      onClick={open}
      className="relative grid size-10 place-items-center rounded-full hover:bg-surface"
      aria-label={`Open cart${hydrated && count ? `, ${count} item${count > 1 ? "s" : ""}` : ""}`}
    >
      <ShoppingBag className="size-5" />
      {hydrated && count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 grid min-w-5 place-items-center rounded-full bg-brand px-1 text-[11px] leading-5 font-bold text-white">
          {count}
        </span>
      )}
    </button>
  );
}
