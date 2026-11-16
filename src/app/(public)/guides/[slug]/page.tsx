import { permanentRedirect } from "next/navigation";

export const instant = false;

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function GuideDetailRedirectPage({ params }: Props) {
  const { slug } = await params;
  permanentRedirect(`/en/blog/${slug}`);
}
