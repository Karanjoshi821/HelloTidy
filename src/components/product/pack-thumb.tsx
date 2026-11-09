import Image from "next/image";
import { product } from "@/config/products";
import { cn } from "@/lib/utils";

/** Small product photo with the pack's sponge count, for cart and checkout lines. */
export function PackThumb({ count, className }: { count: number; className?: string }) {
  const image = product.images[0];
  return (
    <div className={cn("relative size-16 shrink-0 overflow-hidden rounded-xl bg-surface", className)}>
      {image && (
        <Image src={image.src} alt="" width={128} height={128} sizes="64px" className="size-full object-cover" />
      )}
      <span className="absolute right-1 bottom-1 rounded-md bg-ink/85 px-1.5 text-[11px] leading-5 font-extrabold text-white">
        ×{count}
      </span>
    </div>
  );
}
