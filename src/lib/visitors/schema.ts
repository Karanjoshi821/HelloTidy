import { z } from "zod";

/**
 * Messages from the browser tracker (tracker.ts) to POST /api/visits.
 * `sid` is the tab's visit id. With `consent: false` the server keeps no
 * cookie, IP address, PIN area or phone model.
 */

/** Actions recorded besides page views. Keep in step with EVENT_LABELS in reports. */
export const VISIT_EVENTS = [
  "pack_select",
  "add_to_cart",
  "begin_checkout",
  "payment_method",
  "pin_check",
  "video_play",
  "whatsapp_click",
] as const;
export type VisitEventName = (typeof VISIT_EVENTS)[number];

const common = {
  sid: z.uuid(),
  consent: z.boolean(),
};

const deviceSchema = z.object({
  /** "412x915", CSS pixels. */
  screen: z.string().max(20).optional(),
  lang: z.string().max(35).optional(),
  tz: z.string().max(60).optional(),
  touch: z.number().int().min(0).max(32).optional(),
  model: z.string().max(60).optional(),
  platformVersion: z.string().max(30).optional(),
});

const eventValue = z.union([z.string().max(100), z.number().finite(), z.boolean(), z.null()]);

export const visitSchema = z.discriminatedUnion("t", [
  /** `pv` is the view's id, so time can be added to it later. */
  z.object({
    ...common,
    t: z.literal("view"),
    pv: z.uuid(),
    path: z.string().min(1).max(600),
    /** First page of the visit only. */
    ref: z.string().max(1000).optional(),
    device: deviceSchema.optional(),
  }),
  /** Engaged seconds on a page since the last report. */
  z.object({
    ...common,
    t: z.literal("time"),
    pv: z.uuid(),
    s: z.number().int().min(1).max(1800),
  }),
  z.object({
    ...common,
    t: z.literal("event"),
    name: z.enum(VISIT_EVENTS),
    path: z.string().max(600).optional(),
    data: z
      .record(z.string().max(30), eventValue)
      .refine((d) => Object.keys(d).length <= 8, "Too many fields")
      .optional(),
  }),
  /** The cookie choice changed; `consent` carries the answer. */
  z.object({
    ...common,
    t: z.literal("consent"),
  }),
]);

export type VisitInput = z.infer<typeof visitSchema>;
