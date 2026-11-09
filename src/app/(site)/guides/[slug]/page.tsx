import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { product } from "@/config/products";
import Image from "next/image";
import { JsonLd } from "@/components/seo/json-ld";
import { LinkButton } from "@/components/ui/button";
import { Container } from "@/components/ui/layout";
import { getGuide, guides } from "@/content/guides";
import { getStorefront } from "@/lib/catalog/storefront";
import { lowestPrice } from "@/lib/catalog/types";
import { formatPaise } from "@/lib/money";
import { articleJsonLd, breadcrumbJsonLd } from "@/lib/seo";
import { formatDate } from "@/lib/utils";

/** Prerendered for every slug; links resolve the article after the click. */
export const instant = false;

export function generateStaticParams() {
  return guides.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: PageProps<"/guides/[slug]">): Promise<Metadata> {
  const guide = getGuide((await params).slug);
  if (!guide) return {};
  const path = `/guides/${guide.slug}`;
  return {
    title: guide.metaTitle,
    description: guide.description,
    alternates: { canonical: path },
    openGraph: {
      type: "article",
      url: path,
      title: guide.title,
      description: guide.description,
      publishedTime: guide.published,
      modifiedTime: guide.updated,
    },
    twitter: { title: guide.title, description: guide.description },
  };
}

export default async function GuidePage({ params }: PageProps<"/guides/[slug]">) {
  const guide = getGuide((await params).slug);
  if (!guide) notFound();
  const path = `/guides/${guide.slug}`;
  const others = guides.filter((g) => g.slug !== guide.slug);
  const from = lowestPrice(await getStorefront());

  return (
    <Container className="max-w-3xl py-12 sm:py-16">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-muted">
        <ol className="flex flex-wrap items-center gap-2">
          <li>
            <Link href="/" className="hover:text-ink">
              Home
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href="/guides" className="hover:text-ink">
              Guides
            </Link>
          </li>
        </ol>
      </nav>
      <article>
        <h1 className="text-3xl leading-tight font-extrabold tracking-tight text-balance sm:text-4xl">{guide.title}</h1>
        <p className="mt-3 text-sm text-muted">
          Updated {formatDate(guide.updated)} · {guide.readMinutes} min read
        </p>
        <Image
          src={guide.cover.src}
          alt={guide.cover.alt}
          width={1024}
          height={768}
          loading="eager"
          fetchPriority="high"
          sizes="(min-width: 768px) 768px, 100vw"
          className="mt-8 aspect-[16/9] w-full rounded-3xl object-cover"
        />
        <div className="prose-brand mt-8 text-[17px]">{guide.body()}</div>
      </article>

      <aside className="mt-12 grid items-center gap-6 rounded-3xl bg-brand-soft p-6 sm:grid-cols-[160px_1fr] sm:p-8">
        <Image
          src={product.cutout.src}
          alt="A stack of Hello Tidy magic cleaning sponges"
          width={product.cutout.width}
          height={product.cutout.height}
          sizes="160px"
          className="mx-auto w-full max-w-40"
        />
        <div>
          <p className="text-xl font-extrabold">Try the {product.name}</p>
          <p className="mt-1 text-muted">
            {from !== null && <>Packs from {formatPaise(from)} · </>}Free delivery · Cash on Delivery
          </p>
          <LinkButton href={`/products/${product.slug}`} className="mt-4">
            Shop now <ArrowRight className="size-4" />
          </LinkButton>
        </div>
      </aside>

      {others.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 text-lg font-bold">More guides</h2>
          <ul className="space-y-3">
            {others.map((g) => (
              <li key={g.slug}>
                <Link href={`/guides/${g.slug}`} className="font-semibold text-brand hover:underline">
                  {g.cardTitle}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <JsonLd
        data={[
          articleJsonLd({
            title: guide.title,
            description: guide.description,
            path,
            image: guide.cover.src,
            datePublished: guide.published,
            dateModified: guide.updated,
          }),
          breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: "Guides", path: "/guides" },
            { name: guide.cardTitle, path },
          ]),
        ]}
      />
    </Container>
  );
}
