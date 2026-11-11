import { getAdmin } from "@/lib/auth/dal";
import { getOrderById } from "@/lib/orders/service";
import { shiprocketInvoiceUrl } from "@/lib/shipping/shiprocket";

/** Opens Shiprocket's invoice PDF for an order that has been sent there (staff only). */
export async function GET(_request: Request, { params }: RouteContext<"/admin/orders/[id]/shiprocket-invoice">) {
  const user = await getAdmin();
  if (!user || user.mustChangePassword) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });

  const order = await getOrderById(id);
  if (!order?.shiprocketOrderId) return new Response("This order hasn't been sent to Shiprocket yet.", { status: 404 });
  try {
    return Response.redirect(await shiprocketInvoiceUrl(order.shiprocketOrderId), 302);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return new Response(`Shiprocket couldn't make the invoice: ${reason}`, { status: 502 });
  }
}
