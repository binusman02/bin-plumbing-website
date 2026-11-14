import { connection } from "next/server";
import { getGuides } from "@/lib/marketplace";
import { GuidesManagerClient } from "@/components/admin/GuidesManagerClient";

export const instant = false;

export const metadata = {
  title: "Guides CMS | Bin Plumbing Admin",
};

export default async function AdminGuidesPage() {
  await connection();
  const guides = await getGuides(false);
  return <GuidesManagerClient initialGuides={guides} />;
}
