import { getGuide, guides } from "@/content/guides";
import { ogSize, renderOg } from "@/lib/og";

export const alt = "Hello Tidy cleaning guide";
export const size = ogSize;
export const contentType = "image/png";

export function generateStaticParams() {
  return guides.map((g) => ({ slug: g.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const guide = getGuide((await params).slug);
  return renderOg({
    eyebrow: "Cleaning guide",
    title: guide?.cardTitle ?? "Cleaning guides",
    subtitle: guide ? `${guide.readMinutes} min read` : "Simple how-tos for tough stains",
  });
}
