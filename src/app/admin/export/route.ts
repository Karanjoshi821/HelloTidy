import { getAdmin } from "@/lib/auth/dal";
import { csvCell, csvResponse, istDateTime } from "@/lib/csv";
import { getDb } from "@/lib/db";
import { packs } from "@/lib/db/schema";
import { paiseToRupees } from "@/lib/money";
import { getOrdersWithItems } from "@/lib/orders/admin";

/**
 * CSV export of orders (owner only), with the same filters as the Orders page.
 * Columns follow the fields Shiprocket's bulk order upload asks for, so you
 * can paste them into its template.
 */

const HEADERS = [
  "Order Number",
  "Order Date (IST)",
  "Status",
  "Payment Method",
  "Payment Status",
  "Customer Name",
  "Phone",
  "Email",
  "Address Line 1",
  "Address Line 2",
  "Landmark",
  "City",
  "State",
  "Pincode",
  "Country",
  "SKUs",
  "Products",
  "Units",
  "Sub Total",
  "Discount",
  "COD Charges",
  "Order Total",
  "Refunded",
  "Weight (kg)",
  "Courier",
  "AWB",
  "Tags",
  "Source",
  "COD Verified",
  "UTM Source",
  "UTM Campaign",
  "UTM Content",
];

export async function GET(request: Request) {
  const user = await getAdmin();
  if (!user || user.mustChangePassword) return new Response("Unauthorized", { status: 401 });
  if (user.role !== "owner") return new Response("Forbidden", { status: 403 });

  const sp = new URL(request.url).searchParams;
  const get = (key: string) => sp.get(key)?.slice(0, 100) || undefined;
  const filters = {
    status: get("status"),
    q: get("q"),
    payment: get("payment"),
    paymentStatus: get("paymentStatus"),
    source: get("source"),
    tag: get("tag"),
    from: get("from"),
    to: get("to"),
    sort: get("sort"),
  };

  const [orders, packRows] = await Promise.all([
    getOrdersWithItems(filters),
    getDb().then((db) => db.select({ id: packs.id, weightGrams: packs.weightGrams }).from(packs)),
  ]);
  // By pack id, not SKU: order lines keep the SKU of the day, which may have been renamed since.
  const weightByPack = new Map(packRows.map((p) => [p.id, p.weightGrams]));

  const lines = [HEADERS.map(csvCell).join(",")];
  for (const o of orders) {
    const units = o.items.reduce((s, i) => s + i.qty, 0);
    const grams = o.items.reduce((s, i) => s + (weightByPack.get(i.packId) ?? 500) * i.qty, 0);
    const a = o.attribution ?? {};
    lines.push(
      [
        o.orderNumber,
        istDateTime(o.createdAt),
        o.status,
        o.paymentMethod === "cod" ? "COD" : "Prepaid",
        o.paymentStatus,
        o.customerName,
        o.phone,
        o.email,
        o.address1,
        o.address2,
        o.landmark,
        o.city,
        o.state,
        o.pincode,
        "India",
        o.items.map((i) => `${i.sku} x${i.qty}`).join(" | "),
        o.items.map((i) => `${i.name} (${i.packCount} pcs) x${i.qty}`).join(" | "),
        units,
        paiseToRupees(o.subtotal),
        paiseToRupees(o.discount),
        paiseToRupees(o.codFee),
        paiseToRupees(o.total),
        paiseToRupees(o.refundedAmount),
        (grams / 1000).toFixed(2),
        o.courierName,
        o.awbCode,
        o.tags.join(", "),
        o.source,
        o.paymentMethod === "cod" ? (o.codVerifiedAt ? "yes" : "no") : "",
        a.utmSource,
        a.utmCampaign,
        a.utmContent,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return csvResponse(lines, `orders-${filters.status ?? "all"}`);
}
