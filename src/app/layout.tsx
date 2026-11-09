import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { siteConfig } from "@/config/site";
import { adminThemeScript } from "@/lib/admin-theme";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
});

const defaultTitle = `${siteConfig.name} — Magic Eraser Sponge | Erase Stains with Just Water`;

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: { default: defaultTitle, template: `%s | ${siteConfig.name}` },
  description: siteConfig.shortDescription,
  applicationName: siteConfig.name,
  keywords: [
    "magic eraser sponge",
    "melamine sponge",
    "magic sponge for cleaning",
    "stain remover sponge",
    "wall stain remover",
    "magic eraser India",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: siteConfig.name,
    locale: siteConfig.locale,
    url: "/",
    title: defaultTitle,
    description: siteConfig.shortDescription,
  },
  twitter: { card: "summary_large_image", title: defaultTitle, description: siteConfig.shortDescription },
  robots: { index: true, follow: true },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: siteConfig.themeColor,
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The head script may add the admin's "dark" class before React hydrates.
    <html lang="en-IN" className={`${jakarta.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: adminThemeScript }} />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
