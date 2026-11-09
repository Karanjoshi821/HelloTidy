import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { siteConfig } from "@/config/site";
import { JsonLd } from "@/components/seo/json-ld";
import { Container } from "@/components/ui/layout";
import { getPolicy, policies } from "@/content/policies";
import { getStorefront } from "@/lib/catalog/storefront";
import { breadcrumbJsonLd } from "@/lib/seo";
import { formatDate } from "@/lib/utils";

/** Prerendered for every slug; links resolve the article after the click. */
export const instant = false;

export function generateStaticParams() {
  return policies.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps<"/policies/[slug]">): Promise<Metadata> {
  const policy = getPolicy((await params).slug);
  if (!policy) return {};
  return {
    title: policy.title,
    description: policy.description,
    alternates: { canonical: `/policies/${policy.slug}` },
  };
}

export default async function PolicyPage({ params }: PageProps<"/policies/[slug]">) {
  const policy = getPolicy((await params).slug);
  if (!policy) notFound();
  const { codFee, codMaxOrderValue } = await getStorefront();

  return (
    <Container className="max-w-3xl py-12 sm:py-16">
      <nav aria-label="Policies" className="mb-8 flex flex-wrap gap-2">
        {policies.map((p) => (
          <Link
            key={p.slug}
            href={`/policies/${p.slug}`}
            aria-current={p.slug === policy.slug ? "page" : undefined}
            className="rounded-full border border-line px-3 py-1.5 text-sm font-medium text-ink-soft hover:bg-surface aria-[current=page]:border-ink aria-[current=page]:bg-ink aria-[current=page]:text-white"
          >
            {p.title}
          </Link>
        ))}
      </nav>
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{policy.title}</h1>
      <p className="mt-2 text-sm text-muted">Last updated {formatDate(siteConfig.policiesUpdated)}</p>
      <div className="prose-brand mt-8">{policy.body({ codFee, codMaxOrderValue })}</div>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: policy.title, path: `/policies/${policy.slug}` },
        ])}
      />
    </Container>
  );
}
