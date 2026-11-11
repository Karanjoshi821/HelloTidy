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
  /** The customer agreed (in writing, e.g. on WhatsApp) to show this clip. */
  consent: boolean;
  /** Reuses another clip to preview the layout. Never shown on the live site. */
  placeholder?: boolean;
};

const clip1 = { src: "/videos/reviews/review-1.mp4", poster: "/videos/reviews/review-1.jpg", duration: 17 };

export const videoReviews: VideoReview[] = [
  {
    id: "review-1",
    ...clip1,
    title: "Pencil off the wall, grime off white sneakers",
    // TODO: add the customer's first name and city once they agree, then set consent to true.
    consent: false,
  },
  // Placeholders: same clip until the other customers' videos arrive.
  { id: "placeholder-2", ...clip1, title: "Crayon art on a painted wall", placeholder: true, consent: false },
  { id: "placeholder-3", ...clip1, title: "Scuffed sneakers back to white", placeholder: true, consent: false },
  { id: "placeholder-4", ...clip1, title: "Kitchen tiles and switchboards", placeholder: true, consent: false },
];

/** Clips the live site may show. */
export const publishedVideoReviews = videoReviews.filter((v) => v.consent && !v.placeholder);

/** Clips this build shows: published ones, plus everything in a local preview. */
export const displayedVideoReviews = showPlaceholders ? videoReviews : publishedVideoReviews;
