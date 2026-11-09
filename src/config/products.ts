/**
 * Product content and fixed checkout rules.
 *
 * Packs, prices, MRP, stock and the COD fee are NOT here: they live in the
 * database and are edited in the admin (Products, Settings). See
 * src/lib/catalog. This file holds the copy and photos, which are tuned for
 * SEO and change with a code review.
 */

/** Pack pre-selected on the product page (falls back to the first in-stock pack). */
export const preferredPackId = "pack-25";

export const commerce = {
  currency: "INR",
  /** Shipping is free on every order (paise); the cost is already in the price. Copy across the site says so. */
  shippingFee: 0,
  maxQtyPerPack: 5,
  maxLinesPerOrder: 3,
} as const;

export const product = {
  slug: "magic-eraser-sponge",
  name: "Hello Tidy Magic Cleaning Sponge",
  shortName: "Magic Cleaning Sponge",
  /** Product line (Hindi: "Erase stains. With just water."). */
  tagline: "Daag mitao. Bas paani se.",
  subtitle: "Melamine foam magic eraser sponge that erases tough stains with just water",
  category: "Home cleaning",
  description:
    "Hello Tidy sponges are made of high-density melamine foam. Its micro-fine structure works like an ultra-soft eraser: add water, rub lightly, and scuff marks, crayon, grime and soap scum lift off. No detergent, no harsh chemicals.",

  /**
   * Product gallery, first image is the main one (also used for Google and
   * social previews). Swap in photos of your own stock when you have them.
   */
  images: [
    {
      src: "/images/product/product-stack.webp",
      alt: "A stack of white Hello Tidy melamine magic cleaning sponges",
      width: 1024,
      height: 1024,
    },
    {
      src: "/images/product/product-in-use.webp",
      alt: "Hand erasing children's crayon scribbles from a wall with a Hello Tidy sponge",
      width: 1024,
      height: 1024,
    },
    {
      src: "/images/product/product-texture.webp",
      alt: "Close-up of the fine melamine foam texture with water droplets",
      width: 1024,
      height: 1024,
    },
    {
      src: "/images/product/product-hand-size.webp",
      alt: "One Hello Tidy sponge held in a hand to show its size",
      width: 1024,
      height: 1024,
    },
    {
      src: "/images/product/product-cut.webp",
      alt: "A sponge cut into four smaller pieces with scissors",
      width: 1024,
      height: 1024,
    },
  ] as { src: string; alt: string; width: number; height: number }[],

  /** Transparent cut-out used on coloured backgrounds. */
  cutout: { src: "/images/product/sponge-cutout.webp", width: 1024, height: 1024 },

  highlights: [
    "Lift crayon, scuffs and grime with just water",
    "Cut to size for corners and grooves",
    "Rinse and reuse until the foam wears down",
  ],

  specs: [
    { label: "Material", value: "Melamine foam" },
    { label: "Size (each)", value: "approx. 10 × 6 × 2 cm" },
    { label: "Colour", value: "White" },
    { label: "Use with", value: "Clean water only" },
    { label: "Reusable", value: "Yes, until it wears down" },
  ],

  useCases: [
    {
      title: "Walls",
      text: "Crayon, pencil, pen and scuff marks on washable matte paint.",
      image: "/images/uses/walls.webp",
    },
    {
      title: "Switchboards",
      text: "Grey finger marks on switches, sockets and door handles.",
      image: "/images/uses/switchboard.webp",
    },
    {
      title: "Bathroom",
      text: "Soap scum and hard-water film on tiles, taps and buckets.",
      image: "/images/uses/bathroom.webp",
    },
    { title: "Kitchen", text: "Oily grime on tiles, backsplash and the sink.", image: "/images/uses/kitchen.webp" },
    { title: "Shoes", text: "Scuffs on white sneakers and rubber soles.", image: "/images/uses/shoes.webp" },
    {
      title: "Furniture",
      text: "Marks on plastic chairs, tables, doors and skirting.",
      image: "/images/uses/furniture.webp",
    },
  ],

  howToUse: [
    {
      title: "Wet it",
      text: "Dip in clean water and squeeze out the excess. Don't wring or twist.",
      image: "/images/steps/wet.webp",
    },
    {
      title: "Rub gently",
      text: "Use light pressure on the stain and let the foam do the work.",
      image: "/images/steps/rub.webp",
    },
    {
      title: "Wipe & reuse",
      text: "Wipe the area with a cloth. Rinse the sponge and use it again.",
      image: "/images/steps/wipe.webp",
    },
  ],

  /** Honest cautions build trust and prevent returns. Keep this list. */
  avoid: [
    "Skin: never use on your body or face",
    "Car paint and glossy or polished finishes",
    "Non-stick cookware",
    "Phone, TV and laptop screens, spectacles",
    "Polished wood, lacquer and high-gloss steel",
  ],
  avoidNote:
    "Melamine foam is a very fine abrasive. On painted walls, test a small hidden spot first. Keep away from children and pets.",

  /**
   * Mandatory declarations under the Legal Metrology (Packaged Commodities)
   * Rules. These must match what is printed on your packaging.
   */
  declarations: {
    genericName: "Melamine foam cleaning sponge",
    manufacturerOrImporter: "TODO: Name and full address of manufacturer / packer / importer",
    countryOfOrigin: "TODO: e.g. China",
    netQuantityNote: "Net quantity: number of sponges as per the selected pack",
  },
} as const;
