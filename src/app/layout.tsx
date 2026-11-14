import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Inter } from "next/font/google";
import "./globals.css";
import { COMPANY } from "@/data/company";
import { getMarketplaceSettings, getServiceCategories } from "@/lib/marketplace";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-plus-jakarta",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://binplumbing.com.ng";

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
    default: `${COMPANY.name} | Reliable Plumbing Services, Coordinated with Care`,
    template: `%s | ${COMPANY.name}`,
  },
  description: `${COMPANY.name} coordinates plumbing services, itemised quotations, pipework, leak detection, drainage, bathroom sanitaryware, water storage, and pumps.`,
  applicationName: "Bin Plumbing",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Bin Plumbing",
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
        url: "/images/plumberz/carousel-1.jpg",
        width: 1200,
        height: 630,
        alt: "Bin Plumbing Services Ltd - Coordinated Plumbing Services",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${COMPANY.name} | Reliable Plumbing Services`,
    description: `Coordinated plumbing services with transparent itemised quotations.`,
    images: ["/images/plumberz/carousel-1.jpg"],
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
      },
      {
        "@type": ["Plumber", "Organization"],
        "@id": `${siteUrl}/#organization`,
        name: settings.company_name || COMPANY.name,
        legalName: settings.company_name || COMPANY.name,
        alternateName: COMPANY.shortName,
        url: siteUrl,
        logo: `${siteUrl}/images/logo/bin-plumbing-logo.jpg`,
        image: `${siteUrl}/opengraph-image`,
        description: COMPANY.tagline,
        telephone: settings.company_phone,
        email: settings.company_email,
        contactPoint: {
          "@type": "ContactPoint",
          telephone: settings.company_phone,
          email: settings.company_email,
          contactType: "customer service",
          availableLanguage: ["English"],
        },
        address: {
          "@type": "PostalAddress",
          streetAddress: settings.company_address,
          addressCountry: "NG",
        },
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
    <html
      lang="en-NG"
      suppressHydrationWarning
      className={`${plusJakarta.variable} ${inter.variable} font-sans h-full antialiased scroll-smooth`}
    >
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body
        suppressHydrationWarning
        className="min-h-full flex flex-col bg-white text-[#1B2430] selection:bg-[#0B1F3A] selection:text-white"
      >
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
