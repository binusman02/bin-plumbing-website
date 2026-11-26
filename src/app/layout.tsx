import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { cacheLife, cacheTag } from "next/cache";
import localFont from "next/font/local";
import "./globals.css";
import { COMPANY } from "@/data/company";
import { getMarketplaceSettings, getServiceCategories } from "@/lib/marketplace";
import { SITE_NAME, SITE_URL } from "@/lib/seo";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import { ClientIncidentReporter } from "@/components/pwa/ClientIncidentReporter";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";

const plusJakarta = localFont({
  src: "./fonts/plus-jakarta-sans-latin-wght-normal.woff2",
  weight: "600 800",
  variable: "--font-plus-jakarta",
  display: "swap",
});

const inter = localFont({
  src: "./fonts/inter-latin-wght-normal.woff2",
  weight: "400 700",
  variable: "--font-inter",
  display: "swap",
});

const siteUrl = SITE_URL;

export const viewport: Viewport = {
  themeColor: "#07152B",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: {
    default: `${SITE_NAME} | Plumber & Plumbing Services in Kano`,
    template: `%s | ${SITE_NAME}`,
  },
  description: `${SITE_NAME} provides residential and commercial plumbing services in Kano State—pipe repairs, leak detection, water pumps, overhead tanks, bathrooms, and drainage with itemised quotes.`,
  keywords: [
    "FlowGuard Plumbing Enterprises",
    "plumber in Kano",
    "plumbing services in Kano",
    "pumping machine repair in Kano",
    "water leakage repair in Kano",
    "water tank installation in Kano",
    "bathroom plumbing installation in Kano",
    "blocked drainage repair in Kano",
    "mai aikin famfo Kano",
    "gyaran injin famfo",
  ],
  category: "Home Services",
  applicationName: "FlowGuard Plumbing",
  icons: {
    icon: "/images/logo/flowguard-icon.jpg",
    apple: "/icons/icon-192x192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "FlowGuard Plumbing",
  },
  formatDetection: {
    telephone: true,
  },
  metadataBase: new URL(siteUrl),
  robots: {
    index: true,
    follow: true,
  },
  verification: {
    ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
      ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION }
      : {}),
    ...(process.env.NEXT_PUBLIC_BING_VERIFICATION
      ? { other: { "msvalidate.01": process.env.NEXT_PUBLIC_BING_VERIFICATION } }
      : {}),
  },
  openGraph: {
    title: `${COMPANY.name} | Reliable Plumbing Services, Coordinated with Care`,
    description: `Coordinated plumbing services with reviewed technicians, transparent itemised quotations, and clear progress tracking.`,
    url: siteUrl,
    siteName: COMPANY.name,
    locale: "en_NG",
    type: "website",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "FlowGuard Plumbing Enterprises - Coordinated Plumbing Services",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${COMPANY.name} | Reliable Plumbing Services`,
    description: `Coordinated plumbing services with transparent itemised quotations.`,
    images: ["/opengraph-image"],
  },
};

async function OrganizationJsonLd() {
  "use cache";
  cacheLife("minutes");
  cacheTag("settings", "service-categories");

  const [settings, activeServices] = await Promise.all([
    getMarketplaceSettings(),
    getServiceCategories(true),
  ]);

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        url: siteUrl,
        name: settings.company_name || COMPANY.name,
        inLanguage: "en-NG",
      },
      {
        "@type": ["Plumber", "Organization"],
        "@id": `${siteUrl}/#organization`,
        name: settings.company_name || COMPANY.name,
        legalName: settings.company_name || COMPANY.name,
        alternateName: COMPANY.shortName,
        priceRange: "₦₦",
        url: siteUrl,
        logo: `${siteUrl}/images/logo/flowguard-icon.jpg`,
        image: `${siteUrl}/opengraph-image`,
        description: COMPANY.tagline,
        telephone: settings.company_phone,
        email: settings.company_email,
        contactPoint: {
          "@type": "ContactPoint",
          telephone: settings.company_phone,
          email: settings.company_email,
          contactType: "customer service",
          availableLanguage: ["English", "Hausa"],
        },
        address: {
          "@type": "PostalAddress",
          streetAddress: settings.company_address,
          addressLocality: "Kano",
          addressRegion: "Kano State",
          addressCountry: "NG",
        },
        hasMap: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          settings.company_address?.trim() || "FlowGuard Plumbing Enterprises, Kano, Nigeria"
        )}`,
        ...(settings.active_coverage_locations.length > 0
          ? {
              areaServed: settings.active_coverage_locations.map((loc) => ({
                "@type": "Place",
                name: loc,
              })),
            }
          : {}),
        ...(settings.working_hours ? { openingHours: settings.working_hours } : {}),
        hasOfferCatalog: {
          "@type": "OfferCatalog",
          name: "Plumbing Services",
          itemListElement: activeServices.map((srv) => ({
            "@type": "Offer",
            itemOffered: {
              "@type": "Service",
              name: srv.title || srv.name,
              description: srv.short_description || srv.description,
            },
          })),
        },
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en-NG"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={`${plusJakarta.variable} ${inter.variable} font-sans h-full antialiased scroll-smooth`}
    >
      <head>
        <link rel="ard" href="/.well-known/ard.json" type="application/json" />
      </head>
      <body
        suppressHydrationWarning
        className="min-h-full flex flex-col bg-white text-[#1B2430] selection:bg-[#0B1F3A] selection:text-white"
      >
        <Suspense fallback={null}>
          <OrganizationJsonLd />
        </Suspense>
        <ServiceWorkerRegister />
        <ClientIncidentReporter />
        {children}
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
