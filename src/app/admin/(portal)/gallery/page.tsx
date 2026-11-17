import { connection } from "next/server";
import { getAllGalleryItems, getMarketplaceSettings } from "@/lib/marketplace";
import { GalleryManagerClient } from "@/components/admin/GalleryManagerClient";

export const instant = false;

export const metadata = {
  title: "Gallery CMS | FlowGuard Plumbing Admin",
};

export default async function GalleryAdminPage() {
  await connection();
  const [items, settings] = await Promise.all([
    getAllGalleryItems(),
    getMarketplaceSettings(),
  ]);

  const categories =
    settings.service_categories?.filter((c) => c.visible).map((c) => c.title || c.name || "General Plumbing") || [
      "Pipework & Leaks",
      "Water Tank & Pump",
      "Bathroom & Sanitaryware",
      "Drainage & Blockages",
      "General Plumbing",
    ];

  return <GalleryManagerClient initialItems={items} categories={categories} />;
}
