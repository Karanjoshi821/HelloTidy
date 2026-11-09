import { ogSize, renderOg } from "@/lib/og";

export const alt = "Hello Tidy magic cleaning sponge: erase tough stains with just water";
export const size = ogSize;
export const contentType = "image/png";

export default function Image() {
  return renderOg({
    eyebrow: "Magic cleaning sponge",
    title: "Erase tough stains. With just water.",
    subtitle: "Crayon, scuffs, grime and soap scum. Gone.",
  });
}
