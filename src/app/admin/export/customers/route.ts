import { getAdmin } from "@/lib/auth/dal";
import { csvCell, csvResponse, istDateTime } from "@/lib/csv";
import { getCustomersForExport } from "@/lib/customers/admin";
import { paiseToRupees } from "@/lib/money";

/**
 * Customers CSV (owner only), e.g. to build a Meta custom audience of buyers.
 * Contains personal data: keep the file private and delete it after use.
 */
export async function GET() {
  const user = await getAdmin();
  if (!user || user.mustChangePassword) return new Response("Unauthorized", { status: 401 });
  if (user.role !== "owner") return new Response("Forbidden", { status: 403 });

  const rows = await getCustomersForExport();
  const lines = [
    [
      "Name",
      "Phone",
      "Email",
      "Orders",
      "Total Spent (INR)",
      "Returns (RTO)",
      "COD Blocked",
      "Tags",
      "First Seen (IST)",
      "Last Order (IST)",
    ]
      .map(csvCell)
      .join(","),
    ...rows.map((c) =>
      [
        c.name,
        `+91${c.phone}`,
        c.email,
        c.orders,
        paiseToRupees(c.spent),
        c.rto,
        c.codBlocked ? "yes" : "no",
        c.tags.join(", "),
        istDateTime(c.createdAt),
        istDateTime(c.lastOrderAt),
      ]
        .map(csvCell)
        .join(","),
    ),
  ];
  return csvResponse(lines, "customers");
}
