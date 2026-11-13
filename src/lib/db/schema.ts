import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const orderStatus = pgEnum("order_status", [
  "pending_payment",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "rto",
]);

export const paymentStatus = pgEnum("payment_status", ["unpaid", "paid", "failed", "refunded"]);

export const paymentMethod = pgEnum("payment_method", ["cod", "prepaid"]);

export const adminRole = pgEnum("admin_role", ["owner", "staff"]);

export const contactStatus = pgEnum("contact_status", ["new", "handled"]);

export const packStatus = pgEnum("pack_status", ["active", "hidden"]);

export const discountType = pgEnum("discount_type", ["percent", "flat"]);

/** Where an order came from: the storefront checkout, or created by staff in the admin. */
export const orderSource = pgEnum("order_source", ["web", "admin"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Human-friendly, shown to customers, e.g. HT-7K3P9Q. */
    orderNumber: text("order_number").notNull(),
    /** Unguessable token for the confirmation page URL. */
    publicToken: text("public_token").notNull(),
    /** Client checkout id; a repeated submit returns the same order. */
    idempotencyKey: text("idempotency_key").notNull(),

    status: orderStatus("status").notNull(),
    paymentMethod: paymentMethod("payment_method").notNull(),
    paymentStatus: paymentStatus("payment_status").notNull().default("unpaid"),

    customerName: text("customer_name").notNull(),
    phone: text("phone").notNull(),
    email: text("email"),
    address1: text("address1").notNull(),
    address2: text("address2"),
    landmark: text("landmark"),
    city: text("city").notNull(),
    state: text("state").notNull(),
    pincode: text("pincode").notNull(),

    /** All amounts in paise. */
    subtotal: integer("subtotal").notNull(),
    discount: integer("discount").notNull().default(0),
    shippingFee: integer("shipping_fee").notNull().default(0),
    codFee: integer("cod_fee").notNull().default(0),
    total: integer("total").notNull(),
    couponCode: text("coupon_code"),

    razorpayOrderId: text("razorpay_order_id"),
    razorpayPaymentId: text("razorpay_payment_id"),

    courierName: text("courier_name"),
    awbCode: text("awb_code"),
    trackingUrl: text("tracking_url"),
    /** Set once the order exists in Shiprocket (pushed when it's confirmed). */
    shiprocketOrderId: text("shiprocket_order_id"),
    shiprocketShipmentId: text("shiprocket_shipment_id"),
    shiprocketSyncedAt: timestamp("shiprocket_synced_at", { withTimezone: true }),
    /** The last push's error, cleared by the next successful push. */
    shiprocketError: text("shiprocket_error"),
    adminNotes: text("admin_notes"),

    /** Used for fraud review and Meta Conversions API matching. */
    clientIp: text("client_ip"),
    userAgent: text("user_agent"),
    fbp: text("fbp"),
    fbc: text("fbc"),
    attribution: jsonb("attribution").$type<Record<string, string | undefined>>(),

    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    source: orderSource("source").notNull().default("web"),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Set when staff confirmed a COD order with the customer (call/WhatsApp), to cut returns. */
    codVerifiedAt: timestamp("cod_verified_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),
    /** Sum of recorded refunds, in paise. */
    refundedAmount: integer("refunded_amount").notNull().default(0),
    /** For manual orders paid outside Razorpay, e.g. a UPI transaction id. */
    paymentReference: text("payment_reference"),
    /** The visit the order was placed in (src/lib/visitors). */
    visitId: uuid("visit_id").references(() => visitorSessions.id, { onDelete: "set null" }),
    /** Only when the buyer accepted cookies: links every earlier visit of theirs. */
    visitorId: uuid("visitor_id").references(() => visitors.id, { onDelete: "set null" }),

    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("orders_order_number_idx").on(t.orderNumber),
    uniqueIndex("orders_public_token_idx").on(t.publicToken),
    uniqueIndex("orders_idempotency_key_idx").on(t.idempotencyKey),
    uniqueIndex("orders_razorpay_order_id_idx")
      .on(t.razorpayOrderId)
      .where(sql`${t.razorpayOrderId} is not null`),
    index("orders_status_created_idx").on(t.status, t.createdAt),
    index("orders_created_idx").on(t.createdAt),
    index("orders_phone_idx").on(t.phone),
    index("orders_customer_idx").on(t.customerId, t.createdAt),
    index("orders_coupon_idx").on(t.couponCode),
    index("orders_visit_idx").on(t.visitId),
    index("orders_visitor_idx").on(t.visitorId),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    packId: text("pack_id").notNull(),
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    /** Sponges per pack. */
    packCount: integer("pack_count").notNull(),
    qty: integer("qty").notNull(),
    unitPrice: integer("unit_price").notNull(),
    lineTotal: integer("line_total").notNull(),
    /** Units taken from tracked stock for this line; returned on a cancel/RTO restock. */
    stockDeducted: integer("stock_deducted").notNull().default(0),
  },
  (t) => [index("order_items_order_idx").on(t.orderId)],
);

/** Audit trail: every status change, payment event and admin edit. */
export const orderEvents = pgTable(
  "order_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    message: text("message").notNull(),
    /** "system", "customer", "razorpay" or the admin's email. */
    actor: text("actor").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("order_events_order_idx").on(t.orderId, t.createdAt)],
);

export const contactMessages = pgTable(
  "contact_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    email: text("email"),
    topic: text("topic").notNull(),
    orderNumber: text("order_number"),
    message: text("message").notNull(),
    status: contactStatus("status").notNull().default("new"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("contact_messages_status_idx").on(t.status, t.createdAt)],
);

export const adminUsers = pgTable(
  "admin_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: adminRole("role").notNull().default("staff"),
    active: boolean("active").notNull().default(true),
    /** Set for new staff and after a password reset: they must choose their own password first. */
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("admin_users_email_idx").on(t.email)],
);

export const adminSessions = pgTable(
  "admin_sessions",
  {
    /** SHA-256 of the session token; the raw token only lives in the cookie. */
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => adminUsers.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("admin_sessions_user_idx").on(t.userId)],
);

/**
 * Phones running the Hello Tidy admin app, for push notifications (FCM). Each
 * device belongs to the app session it signed in with, so signing out (or
 * "sign out everywhere", or expiry) stops pushes to that phone.
 */
export const adminDevices = pgTable(
  "admin_devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** FCM registration token. */
    token: text("token").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => adminUsers.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => adminSessions.id, { onDelete: "cascade" }),
    platform: text("platform").notNull().default("android"),
    deviceName: text("device_name"),
    notifyOrders: boolean("notify_orders").notNull().default(true),
    notifyAlerts: boolean("notify_alerts").notNull().default(true),
    notifyMessages: boolean("notify_messages").notNull().default(true),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [uniqueIndex("admin_devices_token_idx").on(t.token), index("admin_devices_user_idx").on(t.userId)],
);

/** Fixed-window counters shared by every serverless instance. */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: bigint("window_start", { mode: "number" }).notNull(),
  count: integer("count").notNull(),
});

/** Processed webhook event ids, so provider retries are applied only once. */
export const webhookEvents = pgTable("webhook_events", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  type: text("type").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Sellable packs (variants) of a product. Prices are paise, inclusive of GST.
 * The id is public: it appears in saved carts and ad links (?pack=pack-50).
 */
export const packs = pgTable(
  "packs",
  {
    id: text("id").primaryKey(),
    productSlug: text("product_slug").notNull(),
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    /** Pieces in the pack. */
    count: integer("count").notNull(),
    price: integer("price").notNull(),
    /** Must match the MRP printed on the physical pack (Legal Metrology rules). */
    mrp: integer("mrp").notNull(),
    badge: text("badge"),
    blurb: text("blurb").notNull().default(""),
    /** Approximate shipped weight, used for courier exports. */
    weightGrams: integer("weight_grams").notNull(),
    position: integer("position").notNull().default(0),
    status: packStatus("status").notNull().default("active"),
    /** When off, the pack never runs out (stock isn't counted). */
    trackInventory: boolean("track_inventory").notNull().default(false),
    stock: integer("stock").notNull().default(0),
    lowStockThreshold: integer("low_stock_threshold").notNull().default(10),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("packs_sku_idx").on(t.sku),
    index("packs_product_idx").on(t.productSlug, t.position),
    check("packs_price_check", sql`${t.price} > 0 and ${t.mrp} >= ${t.price} and ${t.count} > 0`),
  ],
);

/** Every stock change and its reason: the inventory history shown in the admin. */
export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    packId: text("pack_id")
      .notNull()
      .references(() => packs.id, { onDelete: "cascade" }),
    delta: integer("delta").notNull(),
    stockAfter: integer("stock_after").notNull(),
    /** order | cancelled | returned | received | damaged | correction */
    reason: text("reason").notNull(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    note: text("note"),
    actor: text("actor").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("inventory_movements_pack_idx").on(t.packId, t.createdAt)],
);

/** One row per phone number (the identity used at checkout), created on the first order. */
export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 10-digit Indian mobile number. */
    phone: text("phone").notNull(),
    name: text("name").notNull(),
    email: text("email"),
    notes: text("notes"),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** After repeated refusals (RTO): this number can only pay online. */
    codBlocked: boolean("cod_blocked").notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex("customers_phone_idx").on(t.phone), index("customers_created_idx").on(t.createdAt)],
);

/** Discount codes. Amounts in paise; percent values are whole percents. */
export const discounts = pgTable(
  "discounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Stored upper-case; customers can type it in any case. */
    code: text("code").notNull(),
    /** Shown to the customer when the code is applied. */
    description: text("description").notNull(),
    type: discountType("type").notNull(),
    value: integer("value").notNull(),
    minOrder: integer("min_order").notNull().default(0),
    /** Cap for percent codes. */
    maxDiscount: integer("max_discount"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    /** Total uses across all customers; null = unlimited. A cancelled order gives its use back. */
    usageLimit: integer("usage_limit"),
    oncePerCustomer: boolean("once_per_customer").notNull().default(false),
    /** Only this 10-digit mobile number can use the code (set on codes made for one customer, e.g. on a recovery call). */
    customerPhone: text("customer_phone"),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("discounts_code_idx").on(t.code),
    check(
      "discounts_value_check",
      sql`(${t.type} = 'percent' and ${t.value} between 1 and 90) or (${t.type} = 'flat' and ${t.value} > 0)`,
    ),
  ],
);

/** Store-wide checkout settings. Exactly one row (id = 1). */
export const storeSettings = pgTable(
  "store_settings",
  {
    id: integer("id").primaryKey().default(1),
    /** Paise. */
    codFee: integer("cod_fee").notNull(),
    /** COD isn't offered above this order total (paise). */
    codMaxOrderValue: integer("cod_max_order_value").notNull(),
    updatedBy: text("updated_by"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [check("store_settings_singleton", sql`${t.id} = 1`)],
);

/** Refunds recorded against an order (issued in Razorpay, or by UPI/bank for COD). */
export const refunds = pgTable(
  "refunds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    reason: text("reason").notNull(),
    reference: text("reference"),
    actor: text("actor").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("refunds_order_idx").on(t.orderId)],
);

/**
 * Where a saved cart is in the call-recovery flow (src/lib/recovery):
 * open → waiting for a call; called → a call reached the customer; converted → they ordered;
 * opted_out → never call this number again; closed → given up, or the customer withdrew consent.
 */
export const cartLeadStatus = pgEnum("cart_lead_status", ["open", "called", "converted", "opted_out", "closed"]);

/**
 * A cart left at checkout by a customer who typed their mobile number and agreed
 * to a call about it. The automation calls them if no order follows.
 */
export const cartLeads = pgTable(
  "cart_leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Random id kept by the customer's browser, so edits on the checkout page update one lead. */
    clientKey: text("client_key").notNull(),
    /** 10-digit Indian mobile number. */
    phone: text("phone").notNull(),
    name: text("name").notNull(),
    lines: jsonb("lines").$type<{ packId: string; qty: number }[]>().notNull(),
    /** Paise, priced when the cart was last saved. */
    subtotal: integer("subtotal").notNull(),
    /** The cart in words for the caller, e.g. "Pack of 50 × 1". */
    itemsSummary: text("items_summary").notNull(),
    consentAt: timestamp("consent_at", { withTimezone: true }).notNull(),
    status: cartLeadStatus("status").notNull().default("open"),
    /** When the automation (n8n) accepted the lead. */
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    callAttempts: integer("call_attempts").notNull().default(0),
    lastCallAt: timestamp("last_call_at", { withTimezone: true }),
    /** How the last call went, e.g. will_order, declined, no_answer. */
    lastOutcome: text("last_outcome"),
    /** One or two sentences written by the voice agent after the call. */
    callSummary: text("call_summary"),
    couponCode: text("coupon_code"),
    couponSentAt: timestamp("coupon_sent_at", { withTimezone: true }),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("cart_leads_client_key_idx").on(t.clientKey),
    index("cart_leads_phone_idx").on(t.phone),
    index("cart_leads_status_created_idx").on(t.status, t.createdAt),
  ],
);

/** Who changed what in the admin: catalogue, discounts, settings, staff, customers and sign-ins. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    summary: text("summary").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_created_idx").on(t.createdAt), index("audit_log_entity_idx").on(t.entityType, t.entityId)],
);

/**
 * Website visitors, recorded by our own tracker (src/lib/visitors). Without
 * cookie consent each visit is its own anonymous visitor (keyed by the visit
 * id, no cookie, no IP). With consent, a first-party cookie links visits and
 * the IP, PIN area and phone model are kept. Deleted 12 months after last seen.
 */
export const visitors = pgTable(
  "visitors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The visit id of an anonymous visitor; null once they accept cookies. */
    anonKey: text("anon_key"),
    anonymous: boolean("anonymous").notNull().default(true),
    consentAt: timestamp("consent_at", { withTimezone: true }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    visitCount: integer("visit_count").notNull().default(0),
    pageviews: integer("pageviews").notNull().default(0),
    engagedSeconds: integer("engaged_seconds").notNull().default(0),
    /** How they first arrived. */
    source: text("source"),
    medium: text("medium"),
    campaign: text("campaign"),
    referrer: text("referrer"),
    landingPage: text("landing_page"),
    deviceType: text("device_type"),
    os: text("os"),
    browser: text("browser"),
    screen: text("screen"),
    language: text("language"),
    timezone: text("timezone"),
    country: text("country"),
    region: text("region"),
    city: text("city"),
    /** Consent only. */
    deviceModel: text("device_model"),
    postalCode: text("postal_code"),
    ip: text("ip"),
    /** Set when a consenting visitor places an order. */
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
  },
  (t) => [
    uniqueIndex("visitors_anon_key_idx")
      .on(t.anonKey)
      .where(sql`${t.anonKey} is not null`),
    index("visitors_last_seen_idx").on(t.lastSeenAt),
    index("visitors_customer_idx").on(t.customerId),
  ],
);

/** One visit: ends after 30 minutes without activity (the browser starts a new visit id). */
export const visitorSessions = pgTable(
  "visitor_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    visitorId: uuid("visitor_id")
      .notNull()
      .references(() => visitors.id, { onDelete: "cascade" }),
    /** The browser's random visit id. */
    key: text("key").notNull(),
    /** The visitor's first visit (only known to be false for visitors who accepted cookies). */
    firstVisit: boolean("first_visit").notNull().default(true),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    pageviews: integer("pageviews").notNull().default(0),
    engagedSeconds: integer("engaged_seconds").notNull().default(0),
    landingPage: text("landing_page"),
    exitPage: text("exit_page"),
    /** The page open right now, for the live view. */
    currentPage: text("current_page"),
    referrer: text("referrer"),
    source: text("source"),
    medium: text("medium"),
    campaign: text("campaign"),
    deviceType: text("device_type"),
    browser: text("browser"),
    os: text("os"),
    country: text("country"),
    region: text("region"),
    city: text("city"),
    /** Consent only. */
    ip: text("ip"),
  },
  (t) => [
    uniqueIndex("visitor_sessions_visitor_key_idx").on(t.visitorId, t.key),
    index("visitor_sessions_started_idx").on(t.startedAt),
    index("visitor_sessions_last_seen_idx").on(t.lastSeenAt),
  ],
);

/** Page views (with engaged seconds) and actions within a visit. */
export const visitorEvents = pgTable(
  "visitor_events",
  {
    /** For page views, the browser's view id, so time can be added to it later. */
    id: uuid("id").primaryKey().defaultRandom(),
    visitorId: uuid("visitor_id")
      .notNull()
      .references(() => visitors.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => visitorSessions.id, { onDelete: "cascade" }),
    /** view | add_to_cart | begin_checkout | pack_select | pin_check | video_play | whatsapp_click | payment_method | order_placed | consent */
    type: text("type").notNull(),
    path: text("path"),
    seconds: integer("seconds").notNull().default(0),
    data: jsonb("data").$type<Record<string, string | number | boolean | null>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("visitor_events_session_idx").on(t.sessionId, t.createdAt),
    index("visitor_events_visitor_idx").on(t.visitorId, t.createdAt),
    index("visitor_events_type_created_idx").on(t.type, t.createdAt),
  ],
);

export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type OrderEvent = typeof orderEvents.$inferSelect;
export type AdminUser = typeof adminUsers.$inferSelect;
export type ContactMessage = typeof contactMessages.$inferSelect;
export type OrderStatus = (typeof orderStatus.enumValues)[number];
export type PackRow = typeof packs.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Discount = typeof discounts.$inferSelect;
export type InventoryMovement = typeof inventoryMovements.$inferSelect;
export type Refund = typeof refunds.$inferSelect;
export type AuditEntry = typeof auditLog.$inferSelect;
export type CartLead = typeof cartLeads.$inferSelect;
export type CartLeadStatus = (typeof cartLeadStatus.enumValues)[number];
export type Visitor = typeof visitors.$inferSelect;
export type VisitorSession = typeof visitorSessions.$inferSelect;
export type VisitorEvent = typeof visitorEvents.$inferSelect;
