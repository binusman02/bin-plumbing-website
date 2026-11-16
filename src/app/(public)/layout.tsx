import { cacheLife, cacheTag } from "next/cache";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import WhatsAppFloatingButton from "@/components/layout/WhatsAppFloatingButton";
import { getMarketplaceSettings } from "@/lib/marketplace";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  "use cache";
  cacheLife("minutes");
  cacheTag("settings");

  const settings = await getMarketplaceSettings();

  return (
    <div className="flex min-h-screen flex-col bg-white text-[#1B2430]">
      <Header companyName={settings.company_name} />
      <main className="flex-1">{children}</main>
      <Footer settings={settings} />
      <WhatsAppFloatingButton whatsapp={settings.company_whatsapp || settings.company_phone} />
    </div>
  );
}
