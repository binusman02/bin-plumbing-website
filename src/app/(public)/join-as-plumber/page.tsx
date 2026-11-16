import type { Metadata } from "next";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { ShieldCheck, CheckCircle2, Award } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedAppRole } from "@/lib/auth-role";
import {
  PLUMBER_SESSION_COOKIE,
  verifyPlumberSessionToken,
} from "@/lib/customer-session";
import {
  getAllPlumberAccounts,
  getAllPlumbers,
  getMarketplaceSettings,
  type PlumberProfile,
} from "@/lib/marketplace";
import PlumberApplicationClient from "@/components/public/PlumberApplicationClient";

export const instant = false;

export const metadata: Metadata = {
  title: "Apply to Join as a Plumber",
  description:
    "Create a plumber account and apply to join the reviewed plumbing technician network at Bin Plumbing Services Ltd.",
  alternates: { canonical: "/join-as-plumber" },
};

export default async function JoinAsPlumberPage() {
  await connection();
  const [settings, supabase, cookieStore] = await Promise.all([
    getMarketplaceSettings(),
    createClient(),
    cookies(),
  ]);

  const activeAreas = settings.active_coverage_locations || [];
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const role = getVerifiedAppRole(user);

  let plumberAccount: { fullName: string; phone: string; email: string } | null = null;

  if (user && role === "plumber") {
    const meta = user.user_metadata || {};
    plumberAccount = {
      fullName: (meta.full_name as string) || user.email || "Plumber",
      phone: (meta.phone as string) || "",
      email: (user.email || "").toLowerCase(),
    };
  } else {
    const fallback = verifyPlumberSessionToken(
      cookieStore.get(PLUMBER_SESSION_COOKIE)?.value
    );
    if (fallback) {
      const accounts = await getAllPlumberAccounts();
      const matched = accounts.find((a) => a.id === fallback.accountId);
      if (matched) {
        plumberAccount = {
          fullName: matched.full_name,
          phone: matched.phone,
          email: matched.email,
        };
      }
    }
  }

  let existingApplication: PlumberProfile | null = null;
  if (plumberAccount) {
    const plumbers = await getAllPlumbers();
    const emailLower = plumberAccount.email.toLowerCase();
    const phoneDigits = plumberAccount.phone.replace(/\D/g, "").slice(-8);
    existingApplication =
      plumbers.find(
        (p) =>
          (emailLower && p.email?.toLowerCase() === emailLower) ||
          (phoneDigits && p.phone.replace(/\D/g, "").slice(-8) === phoneDigits)
      ) || null;
  }

  return (
    <div className="bg-white">
      <section className="bg-[#07152B] py-14 text-white md:py-20">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <p className="text-sm font-semibold uppercase tracking-wider text-[#F5B301]">
            Technician Network
          </p>
          <h1 className="mt-3 font-heading text-4xl font-bold tracking-tight text-white md:text-5xl">
            Apply to Join as a Plumber
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-[#C9D3E0] md:text-lg">
            Create your plumber account first, then submit your plumbing specialties, experience, and verification documents for review.
          </p>
        </div>
      </section>

      <section className="bg-[#F4F6F9] py-14 md:py-20">
        <div className="mx-auto max-w-[960px] px-4 sm:px-6 lg:px-8">
          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex items-start gap-3 rounded-xl border border-[#E3E8EF] bg-white p-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#F5B301] text-[#0B1F3A]">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <p className="font-heading text-sm font-bold text-[#0B1F3A]">
                  Transparent Payouts
                </p>
                <p className="mt-1 text-sm text-[#5B6675]">
                  Commission applies to labour only. Materials remain 100% separate.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-xl border border-[#E3E8EF] bg-white p-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#0B1F3A] text-white">
                <ShieldCheck className="h-5 w-5 text-[#F5B301]" />
              </div>
              <div>
                <p className="font-heading text-sm font-bold text-[#0B1F3A]">
                  Coordinated Jobs
                </p>
                <p className="mt-1 text-sm text-[#5B6675]">
                  Requests are reviewed by our office before dispatch.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-xl border border-[#E3E8EF] bg-white p-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#F5B301] text-[#0B1F3A]">
                <Award className="h-5 w-5" />
              </div>
              <div>
                <p className="font-heading text-sm font-bold text-[#0B1F3A]">
                  Reviewed Onboarding
                </p>
                <p className="mt-1 text-sm text-[#5B6675]">
                  Track your application status anytime from your account.
                </p>
              </div>
            </div>
          </div>

          <PlumberApplicationClient
            activeLocations={activeAreas}
            plumberAccount={plumberAccount}
            existingApplication={existingApplication}
          />
        </div>
      </section>
    </div>
  );
}
