import Link from "next/link";
import type { ReactNode } from "react";
import { product } from "@/config/products";

/**
 * Helpful how-to articles. They target real searches ("how to remove crayon
 * from wall") and link to the product. Keep them accurate and honest.
 */

export type Guide = {
  slug: string;
  title: string;
  /** <title> tag, ≤ 60 characters so Google doesn't truncate it. */
  metaTitle: string;
  /** Short title for cards and OG images. */
  cardTitle: string;
  /** Cover photo in /public/images. */
  cover: { src: string; alt: string };
  description: string;
  published: string;
  updated: string;
  readMinutes: number;
  body: () => ReactNode;
};

const productLink = <Link href={`/products/${product.slug}`}>Hello Tidy magic cleaning sponge</Link>;

export const guides: Guide[] = [
  {
    slug: "how-to-remove-crayon-from-walls",
    title: "How to Remove Crayon, Pen and Pencil Marks from Walls (Without Repainting)",
    metaTitle: "How to Remove Crayon & Pen Marks from Walls",
    cardTitle: "Remove crayon & pen marks from walls",
    cover: { src: "/images/uses/walls.webp", alt: "Crayon marks being wiped off a wall with a magic sponge" },
    description:
      "A step-by-step way to remove kids' crayon, pencil and pen marks from painted walls using a magic eraser sponge and water, plus how to avoid damaging the paint.",
    published: "2026-10-25",
    updated: "2026-10-25",
    readMinutes: 4,
    body: () => (
      <>
        <p>
          Every home with kids eventually gets a crayon mural. The good news: most marks on washable, matte wall paint
          come off with nothing more than a damp melamine sponge (often called a magic eraser) and a light touch.
        </p>

        <h2>What you need</h2>
        <ul>
          <li>A melamine foam sponge, such as the {productLink}</li>
          <li>A small bowl of clean water</li>
          <li>A dry, soft cloth</li>
        </ul>

        <h2>Step 1: Check your paint</h2>
        <p>
          Melamine foam is a very fine abrasive, a bit like ultra-fine sandpaper. On <strong>washable emulsion</strong>{" "}
          and most matte or low-sheen paints it lifts marks without harming the wall. On{" "}
          <strong>glossy enamel, distemper or chalky paint</strong> it can leave a dull or patchy spot, so take extra
          care.
        </p>

        <h2>Step 2: Do a spot test</h2>
        <p>
          Pick a hidden area, such as behind a door or near the skirting. Rub gently for a few seconds, let it dry, and
          check that the colour and sheen look unchanged.
        </p>

        <h2>Step 3: Wet it and squeeze it out</h2>
        <p>
          Dip the sponge in water and squeeze it gently. Don&apos;t twist or wring it, which tears the foam. It should
          be damp, not dripping.
        </p>

        <h2>Step 4: Rub lightly in small circles</h2>
        <p>
          Use the corner or edge of the sponge on the mark itself, with very light pressure. Let the foam do the work.
          Pressing hard is the most common mistake: it can remove the paint&apos;s sheen along with the stain.
        </p>

        <h2>Step 5: Wipe and dry</h2>
        <p>Wipe the area with a dry cloth. If a faint mark remains, repeat once more, gently.</p>

        <h2>Tips for specific marks</h2>
        <ul>
          <li>
            <strong>Pencil</strong> comes off easily, usually in one pass.
          </li>
          <li>
            <strong>Crayon</strong> is waxy and may need a few gentle passes. Rinse the sponge in between so you
            don&apos;t smear wax around.
          </li>
          <li>
            <strong>Ballpoint and sketch pen</strong> usually fade a lot or disappear. Fresh marks are much easier than
            old ones.
          </li>
          <li>
            <strong>Permanent marker</strong> may leave a ghost mark. Sometimes a small touch-up of paint is the honest
            fix.
          </li>
        </ul>

        <h2>Make the sponge last longer</h2>
        <p>
          Cut the sponge into smaller pieces with scissors. Small pieces are easier to control on walls, and nothing
          goes to waste. Rinse it after use and let it air-dry.
        </p>
      </>
    ),
  },
  {
    slug: "how-to-use-magic-eraser-sponge",
    title: "How to Use a Magic Eraser Sponge, and Where Not to Use It",
    metaTitle: "How to Use a Magic Eraser Sponge (and Where Not To)",
    cardTitle: "How to use a magic eraser sponge",
    cover: { src: "/images/steps/wet.webp", alt: "A white melamine sponge being dipped in a bowl of water" },
    description:
      "What a magic eraser (melamine foam) sponge is, how to use it properly, how to make it last, and the surfaces you should never use it on.",
    published: "2026-10-25",
    updated: "2026-10-25",
    readMinutes: 5,
    body: () => (
      <>
        <p>
          A &quot;magic eraser&quot; is a sponge made of <strong>melamine foam</strong>. It looks soft, but its
          structure is made of extremely fine, hard strands. When wet, it works like a very fine eraser, lifting marks
          off a surface by gentle abrasion. That&apos;s why it cleans with just water, and also why it needs some care.
        </p>

        <h2>How to use it</h2>
        <ol>
          <li>
            <strong>Wet it:</strong> dip it in clean water and squeeze out the excess. Don&apos;t wring or twist it.
          </li>
          <li>
            <strong>Rub gently:</strong> use light pressure on the stain. The edges and corners are great for detail
            work.
          </li>
          <li>
            <strong>Wipe:</strong> clean the area with a cloth to remove loosened dirt and foam residue.
          </li>
          <li>
            <strong>Rinse and reuse:</strong> rinse the sponge, squeeze it and let it air-dry.
          </li>
        </ol>

        <h2>Great places to use it</h2>
        <ul>
          <li>Scuff marks, crayon and pencil on washable matte walls (spot-test first)</li>
          <li>Grey finger marks on switchboards, door frames and handles</li>
          <li>Soap scum on bathroom tiles, buckets and mugs</li>
          <li>Grimy kitchen tiles and the sink</li>
          <li>White sneakers and rubber shoe soles</li>
          <li>Plastic chairs, tables and skirting boards</li>
        </ul>

        <h2>Where NOT to use it</h2>
        <ul>
          <li>
            <strong>Skin:</strong> never use it on your face, hands or body. It can cause friction burns.
          </li>
          <li>
            <strong>Car paint and glossy finishes:</strong> it can dull the shine or scratch the clear coat.
          </li>
          <li>
            <strong>Non-stick cookware:</strong> it can wear away the coating.
          </li>
          <li>
            <strong>Screens and lenses:</strong> phones, TVs, laptops, spectacles.
          </li>
          <li>
            <strong>Polished wood, lacquer, high-gloss steel and stone:</strong> it can leave dull patches.
          </li>
        </ul>
        <p>When in doubt, test a small hidden spot first.</p>

        <h2>How long does one last?</h2>
        <p>
          It wears down as it cleans, just like a pencil eraser. How long it lasts depends on the surface. Rough
          surfaces like tile grout wear it faster than smooth walls. Cutting it into smaller pieces stretches each
          sponge across many cleaning jobs.
        </p>

        <h2>Safety</h2>
        <ul>
          <li>Wear gloves for long cleaning sessions.</li>
          <li>Rinse surfaces that touch food after cleaning them.</li>
          <li>Keep sponges away from children and pets. It is not a toy and must not be chewed.</li>
        </ul>

        <p>Ready to try it? The {productLink} comes in packs for small and big homes.</p>
      </>
    ),
  },
  {
    slug: "clean-switchboards-tiles-kitchen-grime",
    title: "How to Clean Switchboards, Bathroom Tiles and Kitchen Grime with a Magic Sponge",
    metaTitle: "Clean Switchboards, Tiles & Kitchen Grime the Easy Way",
    cardTitle: "Clean switchboards, tiles & kitchen grime",
    cover: { src: "/images/uses/switchboard.webp", alt: "Switchboard being cleaned with a magic sponge" },
    description:
      "Safe, simple ways to clean black finger marks off switchboards, soap scum off bathroom tiles and oily grime off kitchen tiles using a melamine sponge.",
    published: "2026-10-25",
    updated: "2026-10-25",
    readMinutes: 4,
    body: () => (
      <>
        <p>
          Switchboards, bathroom tiles and the kitchen backsplash collect the most stubborn everyday grime. A melamine
          sponge handles all three with water and a little patience. Here&apos;s how to do each one safely.
        </p>

        <h2>Switchboards and switches</h2>
        <p>
          <strong>Safety first:</strong> switch off the power at the main switch or MCB before cleaning electrical
          fittings.
        </p>
        <ol>
          <li>
            Squeeze the sponge until it is only <strong>slightly damp</strong>. It must never drip into a socket.
          </li>
          <li>Rub the plastic plate and switches gently to lift the grey finger marks.</li>
          <li>Wipe with a dry cloth and let it dry completely before switching the power back on.</li>
        </ol>
        <p>Never push the sponge into socket holes or behind the plate.</p>

        <h2>Bathroom tiles, taps and buckets</h2>
        <ol>
          <li>Wet the sponge and rub the hazy soap scum on tiles, plastic buckets and mugs.</li>
          <li>For grout lines, use a small cut piece of sponge along the line.</li>
          <li>Rinse with water and wipe dry to prevent new water spots.</li>
        </ol>
        <p>On chrome or highly polished taps, test first. Very shiny finishes can lose a little gloss.</p>

        <h2>Kitchen tiles and backsplash</h2>
        <ol>
          <li>Wipe away loose oil with a paper towel first.</li>
          <li>Wet the sponge and rub the sticky grime. For heavy oil, add one drop of dish soap to the sponge.</li>
          <li>Wipe clean with a damp cloth, then dry.</li>
        </ol>
        <p>Skip non-stick pans, glossy laminate cabinets and polished stone counters, which can dull or scratch.</p>

        <h2>Keep it clean longer</h2>
        <p>
          A quick weekly wipe of switchboards and the backsplash stops grime from building up. Keep a small cut piece of
          the {productLink} near the sink for two-minute touch-ups.
        </p>
      </>
    ),
  },
];

export function getGuide(slug: string): Guide | undefined {
  return guides.find((g) => g.slug === slug);
}
