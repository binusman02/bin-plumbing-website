import { cacheLife, cacheTag } from "next/cache";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import WhatsAppFloatingButton from "@/components/layout/WhatsAppFloatingButton";
import AminaConciergeWidget from "@/components/public/AminaConciergeWidget";
import { getMarketplaceSettings, getServiceCategories } from "@/lib/marketplace";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  "use cache";
  cacheLife("minutes");
  cacheTag("settings", "service-categories");

  const [settings, categories] = await Promise.all([
    getMarketplaceSettings(),
    getServiceCategories(true),
  ]);

  return (
    <div className="flex min-h-screen flex-col bg-white text-[#1B2430]">
      <Header companyName={settings.company_name} />
      <main className="flex-1">{children}</main>
      <Footer settings={settings} />
      <AminaConciergeWidget
        activeLocations={settings.active_coverage_locations || []}
        serviceOptions={categories
          .map((c) => ({ id: c.id, title: c.title || c.name || "" }))
          .filter((c) => c.title)}
        defaultState={settings.default_state || "Kano State"}
      />
      <WhatsAppFloatingButton whatsapp={settings.company_whatsapp || settings.company_phone} />
    </div>
  );
}
