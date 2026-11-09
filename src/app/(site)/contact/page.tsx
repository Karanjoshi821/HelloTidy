import type { Metadata } from "next";
import { Clock, Mail, MapPin, Phone, ShieldCheck } from "lucide-react";
import { formattedAddress, isPlaceholder, siteConfig, whatsappLink } from "@/config/site";
import { ContactForm } from "@/components/contact-form";
import { WhatsAppIcon } from "@/components/site/whatsapp-button";
import { buttonClasses } from "@/components/ui/button";
import { Container } from "@/components/ui/layout";

export const metadata: Metadata = {
  title: "Contact Us",
  description: `Questions about your order or our magic cleaning sponges? Reach ${siteConfig.name} on WhatsApp, phone or email.`,
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  const { contact, grievanceOfficer: go } = siteConfig;
  const wa = whatsappLink("Hi! I have a question.");

  return (
    <Container className="py-12 sm:py-16">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">We&apos;re here to help</h1>
        <p className="mt-3 text-lg text-muted">
          Questions about an order, a product, or bulk buying for your office or hotel? {contact.responseTime}
        </p>
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_380px]">
        <section aria-labelledby="form-title">
          <h2 id="form-title" className="mb-6 text-xl font-bold">
            Send us a message
          </h2>
          <ContactForm />
        </section>

        <aside className="space-y-4">
          {wa && (
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClasses("whatsapp", "lg", "w-full")}
            >
              <WhatsAppIcon className="size-5" /> Chat on WhatsApp
            </a>
          )}
          <ul className="space-y-4 rounded-3xl border border-line p-6 text-sm">
            <li className="flex gap-3">
              <Phone className="size-5 shrink-0 text-brand" />
              <div>
                <p className="font-semibold">Phone</p>
                {isPlaceholder(contact.phone) ? (
                  <p className="text-muted">{contact.phoneDisplay}</p>
                ) : (
                  <a href={`tel:+${contact.phone}`} className="text-muted hover:text-ink">
                    {contact.phoneDisplay}
                  </a>
                )}
              </div>
            </li>
            <li className="flex gap-3">
              <Mail className="size-5 shrink-0 text-brand" />
              <div>
                <p className="font-semibold">Email</p>
                <a href={`mailto:${contact.email}`} className="break-all text-muted hover:text-ink">
                  {contact.email}
                </a>
              </div>
            </li>
            <li className="flex gap-3">
              <Clock className="size-5 shrink-0 text-brand" />
              <div>
                <p className="font-semibold">Hours</p>
                <p className="text-muted">{contact.hours}</p>
              </div>
            </li>
            <li className="flex gap-3">
              <MapPin className="size-5 shrink-0 text-brand" />
              <div>
                <p className="font-semibold">Registered address</p>
                <p className="text-muted">
                  {isPlaceholder(siteConfig.legalName) ? siteConfig.name : siteConfig.legalName}
                  <br />
                  {formattedAddress()}
                </p>
              </div>
            </li>
          </ul>

          <div className="rounded-3xl bg-surface p-6 text-sm">
            <p className="mb-2 flex items-center gap-2 font-semibold">
              <ShieldCheck className="size-5 text-brand" /> Grievance Officer
            </p>
            <p className="text-muted">
              {go.name}, {go.designation}
              <br />
              {go.email}
              <br />
              {go.phone}
            </p>
            <p className="mt-3 text-xs text-muted">
              As per the Consumer Protection (E-Commerce) Rules, 2020, we acknowledge complaints within 48 hours and
              resolve them within one month.
            </p>
          </div>
        </aside>
      </div>
    </Container>
  );
}
