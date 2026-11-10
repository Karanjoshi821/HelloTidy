/**
 * Customer reviews.
 *
 * Everything below marked `sample: true` is placeholder content (written
 * reviews + AI-generated photos) to preview the design. While any sample
 * review is shown, the reviews section displays a visible notice that they
 * are not real, they are excluded from Google structured data, and
 * `npm run check:launch` fails.
 *
 * Replace them with genuine reviews (with the customer's permission, exactly
 * as written) before running ads. Publishing invented reviews as real is an
 * unfair trade practice under Indian consumer law and breaks Meta's ad policy.
 */
export type Review = {
  name: string;
  /** City only; never publish a full address. */
  city: string;
  rating: 1 | 2 | 3 | 4 | 5;
  title: string;
  text: string;
  /** ISO date the review was received. */
  date: string;
  /** Pack the customer bought. */
  pack?: string;
  /** Customer photo in /public/images/reviews/. */
  photo?: string;
  photoAlt?: string;
  /** Placeholder content, not from a real customer. */
  sample?: boolean;
  /** Order number the review came from, kept for your own records. */
  orderNumber?: string;
};

export const reviews: Review[] = [
  {
    name: "Priya S.",
    city: "Pune",
    rating: 5,
    title: "My daughter's crayon art is gone!",
    text: "My 4-year-old turned our living room wall into a canvas. I was ready to call the painter. One damp sponge and ten minutes later the wall looks new, and the paint is fine. I tested behind the sofa first like the instructions say.",
    date: "2026-10-12",
    pack: "Home Pack",
    photo: "/images/reviews/wall.webp",
    photoAlt: "Crayon drawing on a yellow wall, partly erased, with a used sponge",
    sample: true,
  },
  {
    name: "Rahul M.",
    city: "Bengaluru",
    rating: 5,
    title: "Switchboards look brand new",
    text: "Every switchboard in our flat had those black finger marks. Wiped all of them in one evening. Slightly addictive, honestly.",
    date: "2026-10-09",
    pack: "Mega Pack",
    photo: "/images/reviews/switchboard.webp",
    photoAlt: "A cleaned white switchboard and a used grey sponge",
    sample: true,
  },
  {
    name: "Ananya K.",
    city: "Hyderabad",
    rating: 4,
    title: "Works great, wears out faster on tiles",
    text: "Removed soap scum on bathroom tiles that nothing else could. Only thing: on rough grout the sponge wears down quickly, so cut it into small pieces like they suggest.",
    date: "2026-10-05",
    pack: "Home Pack",
    photo: "/images/reviews/tiles.webp",
    photoAlt: "Bathroom tiles with a clean streak and a sponge on a bucket",
    sample: true,
  },
  {
    name: "Vikram T.",
    city: "Delhi",
    rating: 5,
    title: "Saved my white sneakers",
    text: "Used it on the soles of my white sneakers before a wedding. Came out almost new. Only use it on the rubber, not the leather part.",
    date: "2026-10-03",
    pack: "Starter Pack",
    photo: "/images/reviews/shoes.webp",
    photoAlt: "White sneakers, one sole cleaned, with a used sponge",
    sample: true,
  },
  {
    name: "Fatima R.",
    city: "Mumbai",
    rating: 5,
    title: "Kitchen tiles finally clean",
    text: "The tiles behind my gas stove had that sticky yellow layer. With one drop of dish soap on the sponge it came off without hard scrubbing.",
    date: "2026-09-28",
    pack: "Home Pack",
    photo: "/images/reviews/kitchen.webp",
    photoAlt: "Kitchen backsplash partly cleaned, sponge on the sink edge",
    sample: true,
  },
  {
    name: "Sneha P.",
    city: "Ahmedabad",
    rating: 4,
    title: "Good quantity, quick delivery",
    text: "Got 25 sponges in a simple pouch, delivered in 4 days with COD. Plenty for the whole house. Packaging could be nicer if you want to gift it.",
    date: "2026-09-24",
    pack: "Home Pack",
    photo: "/images/reviews/unboxing.webp",
    photoAlt: "A pile of white sponges unpacked on a bed next to a courier bag",
    sample: true,
  },
  {
    name: "Arjun N.",
    city: "Chennai",
    rating: 5,
    title: "Same result, fraction of the price",
    text: "I used to buy the imported ones from the supermarket. These clean exactly the same and the per-piece price is much lower.",
    date: "2026-09-20",
    pack: "Mega Pack",
    sample: true,
  },
  {
    name: "Meera J.",
    city: "Jaipur",
    rating: 3,
    title: "Good, but not for everything",
    text: "Great on walls and switches. I tried it on my glossy kitchen cabinet and it left a dull patch. My mistake, the site does say avoid glossy finishes. Test first!",
    date: "2026-09-15",
    pack: "Starter Pack",
    sample: true,
  },
  {
    name: "Karthik R.",
    city: "Kochi",
    rating: 5,
    title: "Office desks cleaned in an hour",
    text: "Bought the Mega Pack for our small office. Pen marks on desks and scuffs on the walls, all gone.",
    date: "2026-09-11",
    pack: "Mega Pack",
    sample: true,
  },
];

export function reviewStats(list: Review[] = reviews) {
  const count = list.length;
  const average = count ? list.reduce((s, r) => s + r.rating, 0) / count : 0;
  const distribution = ([5, 4, 3, 2, 1] as const).map((stars) => ({
    stars,
    count: list.filter((r) => r.rating === stars).length,
  }));
  return { count, average, distribution, hasSamples: list.some((r) => r.sample) };
}

/**
 * The only reviews the site shows or sends to Google. Sample reviews stay in
 * the list above for reference but are never published.
 */
export const genuineReviews = reviews.filter((r) => !r.sample);
