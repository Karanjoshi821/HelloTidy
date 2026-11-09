import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Container } from "@/components/ui/layout";
import { guides } from "@/content/guides";

export const metadata: Metadata = {
  title: "Cleaning Guides — Remove Tough Stains the Easy Way",
  description:
    "Practical guides to removing crayon from walls, cleaning switchboards, bathroom tiles and kitchen grime with a magic eraser sponge.",
  alternates: { canonical: "/guides" },
};

export default function GuidesPage() {
  return (
    <Container className="py-12 sm:py-16">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Cleaning guides</h1>
        <p className="mt-3 text-lg text-muted">Simple, honest how-tos for the stains that won&apos;t budge.</p>
      </div>
      <ul className="mt-10 grid gap-5 md:grid-cols-3">
        {guides.map((guide) => (
          <li key={guide.slug}>
            <Link
              href={`/guides/${guide.slug}`}
              className="group flex h-full flex-col overflow-hidden rounded-3xl border border-line shadow-card transition-shadow hover:shadow-lift"
            >
              <Image
                src={guide.cover.src}
                alt={guide.cover.alt}
                width={1024}
                height={768}
                sizes="(min-width: 768px) 360px, 100vw"
                className="aspect-[16/10] w-full object-cover"
              />
              <div className="flex flex-1 flex-col p-6">
                <p className="text-sm font-semibold text-brand">{guide.readMinutes} min read</p>
                <h2 className="mt-2 text-xl leading-snug font-bold">{guide.cardTitle}</h2>
                <p className="mt-2 flex-1 text-sm text-muted">{guide.description}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-brand">
                  Read guide <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </Container>
  );
}
