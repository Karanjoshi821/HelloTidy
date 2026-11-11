import { showPlaceholders } from "./previews";

/**
 * Customer video reviews.
 *
 * Files live in public/videos/reviews/: a web copy of each clip plus a cover
 * image from a clear before/after frame. Make them with ffmpeg (a 43 MB phone
 * clip becomes about 2.5 MB):
 *
 *   ffmpeg -i in.mp4 -vf scale=720:1280 -c:v libx264 -preset slow -crf 27 \
 *     -maxrate 1800k -bufsize 3600k -pix_fmt yuv420p -c:a aac -b:a 96k \
 *     -movflags +faststart review-N.mp4
 *   ffmpeg -ss 9.5 -i in.mp4 -frames:v 1 -vf scale=720:1280 -q:v 4 review-N.jpg
 *
 * The card shows a before half over an after half. Take both from the same
 * clip (crop=width:height:x:y, 2:1, clear of any text the customer added):
 *
 *   ffmpeg -ss 8.5 -i review-N.mp4 -frames:v 1 -vf crop=720:360:0:40 -q:v 4 review-N-before.jpg
 *   ffmpeg -ss 8.5 -i review-N.mp4 -frames:v 1 -vf crop=720:360:0:720 -q:v 4 review-N-after.jpg
 *
 * Publish only clips your customers made and agreed to share. A clip shows on
 * the live site only when `consent` is true and it isn't a placeholder.
 */
export type VideoReview = {
  id: string;
  src: string;
  poster: string;
  /** Length in seconds, shown on the card. */
  duration: number;
  /** What the clip shows, in a few words. */
  title: string;
  /** The customer's first name and city, only as they agreed to be shown. */
  name?: string;
  city?: string;
  /** Order the clip came from; shows a "Verified buyer" badge. */
  orderNumber?: string;
  /** The customer's own photo for the card, only if they sent it to be shown. */
  avatar?: string;
  /** Before and after frames from this same clip, 2:1. Without them the card shows the poster. */
  before?: string;
  after?: string;
  /** WebVTT captions for the clip. */
  captions?: string;
  /** Card label: "review" (default) or "home". */
  label?: "review" | "home";
  /** The customer agreed (in writing, e.g. on WhatsApp) to show this clip. */
  consent: boolean;
  /** Reuses another clip to preview the layout. Never shown on the live site. */
  placeholder?: boolean;
};

const clip1 = { src: "/videos/reviews/review-1.mp4", poster: "/videos/reviews/review-1.jpg", duration: 17 };
const wall = { before: "/videos/reviews/review-1-wall-before.jpg", after: "/videos/reviews/review-1-wall-after.jpg" };
const shoes = {
  before: "/videos/reviews/review-1-shoes-before.jpg",
  after: "/videos/reviews/review-1-shoes-after.jpg",
};

export const videoReviews: VideoReview[] = [
  {
    id: "review-1",
    ...clip1,
    ...wall,
    title: "Pencil off the wall, grime off white sneakers",
    // Vanshika agreed to share this clip (Karan confirmed, 11 Nov 2026). First name and initial only.
    name: "Vanshika S.",
    consent: true,
  },
  // Placeholders: same clip until the other customers' videos arrive.
  { id: "placeholder-2", ...clip1, ...wall, title: "Crayon art on a painted wall", placeholder: true, consent: false },
  {
    id: "placeholder-3",
    ...clip1,
    ...shoes,
    title: "Scuffed sneakers back to white",
    label: "home",
    placeholder: true,
    consent: false,
  },
  {
    id: "placeholder-4",
    ...clip1,
    ...wall,
    title: "Kitchen tiles and switchboards",
    placeholder: true,
    consent: false,
  },
];

/** Clips the live site may show. */
export const publishedVideoReviews = videoReviews.filter((v) => v.consent && !v.placeholder);

/** Clips this build shows: published ones, plus everything in a local preview. */
export const displayedVideoReviews = showPlaceholders ? videoReviews : publishedVideoReviews;
