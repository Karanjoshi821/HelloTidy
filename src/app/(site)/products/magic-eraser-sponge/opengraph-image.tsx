import { product } from "@/config/products";
import { getStorefront } from "@/lib/catalog/storefront";
import { packSizesLabel } from "@/lib/catalog/types";
import { ogSize, renderOg } from "@/lib/og";

export const alt = `${product.name}, magic eraser sponge packs`;
export const size = ogSize;
export const contentType = "image/png";

export default async function Image() {
  const sizes = packSizesLabel(await getStorefront());
  return renderOg({
    eyebrow: sizes ? `Packs of ${sizes}` : "Magic cleaning sponge",
    title: "Magic eraser sponges that actually work",
    subtitle: "Melamine foam. Just wet, rub and wipe.",
  });
}
