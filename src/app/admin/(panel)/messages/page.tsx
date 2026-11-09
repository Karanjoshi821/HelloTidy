import type { Metadata } from "next";
import Link from "next/link";
import { Mail, MessageSquare, Phone } from "lucide-react";
import { setMessageStatusAction } from "@/app/admin/actions";
import { EmptyState, PageHeader, Tabs } from "@/components/admin/ui";
import { WhatsAppIcon } from "@/components/site/whatsapp-button";
import { buttonClasses } from "@/components/ui/button";
import { Badge } from "@/components/ui/layout";
import { siteConfig } from "@/config/site";
import { requireAdmin } from "@/lib/auth/dal";
import { listContactMessages, TOPIC_LABELS } from "@/lib/contact/service";
import { formatDateTime } from "@/lib/utils";
import { waLink } from "@/lib/whatsapp-templates";

export const metadata: Metadata = { title: "Messages" };

/** Internal page: always rendered per request, navigation may block. */
export const instant = false;

export default async function MessagesPage({ searchParams }: PageProps<"/admin/messages">) {
  await requireAdmin();
  const sp = await searchParams;
  const filter = sp.show === "handled" ? "handled" : sp.show === "all" ? "all" : "new";
  const messages = await listContactMessages(filter);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Messages"
        description="From the contact form. Reply on WhatsApp or by phone, then mark them handled."
      />
      <Tabs
        label="Message filters"
        items={(["new", "handled", "all"] as const).map((f) => ({
          href: `/admin/messages${f === "new" ? "" : `?show=${f}`}`,
          label: f === "new" ? "New" : f === "handled" ? "Handled" : "All",
          active: filter === f,
        }))}
      />

      {messages.length === 0 ? (
        <div className="rounded-2xl bg-white shadow-card">
          <EmptyState icon={MessageSquare} title={filter === "new" ? "No new messages" : "Nothing here"}>
            {filter === "new" ? "You're all caught up." : undefined}
          </EmptyState>
        </div>
      ) : (
        <ul className="space-y-3">
          {messages.map((m) => (
            <li key={m.id} className="rounded-2xl bg-white p-4 shadow-card sm:p-5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-bold">{m.name}</p>
                <Badge tone={m.topic === "bulk" ? "sun" : "neutral"}>
                  {TOPIC_LABELS[m.topic as keyof typeof TOPIC_LABELS] ?? m.topic}
                </Badge>
                {m.orderNumber && (
                  <Link href={`/admin/orders?q=${encodeURIComponent(m.orderNumber)}`} className="hover:underline">
                    <Badge tone="brand">{m.orderNumber}</Badge>
                  </Link>
                )}
                {m.status === "handled" && <Badge tone="success">Handled</Badge>}
                <span className="ml-auto text-xs text-muted">{formatDateTime(m.createdAt)}</span>
              </div>
              <p className="mt-1 text-sm text-muted">
                +91 {m.phone}
                {m.email && ` · ${m.email}`}
              </p>
              <p className="mt-3 text-sm break-words whitespace-pre-wrap">{m.message}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <a
                  href={waLink(
                    m.phone,
                    `Hi ${m.name.split(" ")[0]}, this is ${siteConfig.name}, replying to your message.`,
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonClasses("whatsapp", "sm")}
                >
                  <WhatsAppIcon className="size-4" /> WhatsApp
                </a>
                <a href={`tel:+91${m.phone}`} className={buttonClasses("outline", "sm")}>
                  <Phone className="size-4" /> Call
                </a>
                {m.email && (
                  <a
                    href={`mailto:${m.email}?subject=${encodeURIComponent(`Re: your message to ${siteConfig.name}`)}`}
                    className={buttonClasses("outline", "sm")}
                  >
                    <Mail className="size-4" /> Email
                  </a>
                )}
                <form action={setMessageStatusAction} className="ml-auto">
                  <input type="hidden" name="id" value={m.id} />
                  <input type="hidden" name="status" value={m.status === "new" ? "handled" : "new"} />
                  <button type="submit" className={buttonClasses(m.status === "new" ? "secondary" : "outline", "sm")}>
                    {m.status === "new" ? "Mark handled" : "Mark as new"}
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
