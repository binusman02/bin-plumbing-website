# Comprehensive UI/UX and SEO Audit & Improvement Report — FlowGuard Plumbing Enterprises

**Website:** https://bin-plumbing-website.vercel.app/ (canonical production domain configured as `https://flowguard.com.ng`)  
**Brand:** FlowGuard Plumbing Enterprises  
**Framework:** Next.js `16.4.6` (App Router, Turbopack, Cache Components + Partial Prefetching enabled), React `19.3.0`, Tailwind CSS `4.3.3`  
**Audit Date:** 2026-11-18  

---

## A. Website Inventory

### 1. Static & Utility Public Routes

| Page URL | Page purpose | Existing primary keyword | Existing supporting keywords | Current title (after audit improvements) | Current H1 |
|---|---|---|---|---|---|
| `/` | Main landing page: service overview, workflow, gallery, FAQs, reviews, Kano coverage links, CTA | `plumber in Kano` | `plumbing services in Kano`, `pumping machine repair in Kano`, `water leakage repair in Kano`, `mai aikin famfo Kano` | `Plumber in Kano \| FlowGuard Plumbing Enterprises` | `Reliable Plumbing Services, Coordinated Clearly.` |
| `/services` | Full catalog of coordinated plumbing services with gallery preview | `plumbing services in Kano` | `pipework`, `leak detection`, `water pump repair`, `overhead tank installation`, `bathrooms`, `drainage` | `Plumbing Services in Kano \| FlowGuard Plumbing Enterprises` | `Plumbing Services We Coordinate` |
| `/areas` | Directory of active Kano State service coverage areas | `plumbing service areas in Kano` | `Hotoro`, `Nassarawa GRA`, `Tarauni`, `Fagge`, `Dala`, `Gwale`, `Kano Municipal`, `Kumbotso`, `Bompai` | `Plumbing Service Areas in Kano \| FlowGuard Plumbing Enterprises` | `Active Service Areas` |
| `/about` | Operating principles, transparent quotation workflow, company background | `Kano plumbing company` | `FlowGuard Plumbing Enterprises`, `reviewed technicians`, `itemised quotes`, `live tracking` | `About Us \| Kano Plumbing Company \| FlowGuard Plumbing Enterprises` | `How {settings.company_name} Works` |
| `/how-it-works` | Step-by-step customer & technician coordination guide | `how Kano plumbing service works` | `on-site inspection`, `itemised quote approval`, `request tracking` | `How Our Kano Plumbing Service Works \| FlowGuard Plumbing Enterprises` | `How It Works` |
| `/gallery` | Completed project photo gallery | `completed plumbing projects` | `plumbing installations and repairs`, `Kano` | `Project Gallery \| FlowGuard Plumbing Enterprises` | `Completed Work Gallery` |
| `/request` | Customer plumbing service request booking form | `request a plumber in Kano` | `on-site inspection review`, `itemised quotation`, `tracking reference` | `Request a Plumber in Kano \| FlowGuard Plumbing Enterprises` | `Request a Plumber` |
| `/tracking` | Customer request lookup by reference number + phone (`noindex, nofollow`) | `track plumbing request` | `live status`, `itemised quotations`, `estimate approval` | `Track Your Request \| FlowGuard Plumbing Enterprises` | `Track Your Plumbing Request` |
| `/contact` | Direct enquiries form, phone, email, WhatsApp, Kano office address | `contact FlowGuard Plumbing Enterprises in Kano` | `plumbing enquiries`, `quotations`, `customer support` | `Contact Us in Kano \| FlowGuard Plumbing Enterprises` | `Get in Touch` |
| `/faq` | Frequently asked questions with `FAQPage` JSON-LD | `plumbing FAQs in Kano` | `on-site inspection quotations`, `active coverage areas`, `live request tracking` | `Plumbing FAQs in Kano \| FlowGuard Plumbing Enterprises` | `Frequently Asked Questions` |
| `/join-as-plumber` | Technician onboarding & application portal | `apply to join as a plumber` | `reviewed plumbing technician network`, `Kano` | `Apply to Join as a Plumber \| FlowGuard Plumbing Enterprises` | `Apply to Join as a Plumber` |
| `/en/blog` | English plumbing guides & troubleshooting index (12 articles) | `plumbing guides for Kano homes` | `water pump troubleshooting`, `pipe leaks`, `water tank care`, `toilet repair`, `drainage` | `Plumbing Guides & Blog for Kano Homes \| FlowGuard Plumbing Enterprises` | `Plumbing Guides & Maintenance Tips for Kano Homes` |
| `/ha/blog` | Hausa plumbing guides & troubleshooting index (12 articles) | `shawarwarin gyaran famfo da injin ruwa` | `bututun ruwa mai yoyo`, `tankin ruwa`, `bandaki`, `magudanar ruwa a Kano` | `Shawarwarin Gyaran Famfo da Injin Ruwa (Hausa) \| FlowGuard Plumbing Enterprises` | `Shawarwarin Gyaran Famfo da Injin Ruwa a Kano` |
| `/privacy` | Privacy Policy (marked Draft in footer link) | `privacy policy` | `customer and technician request information` | `Privacy Policy \| FlowGuard Plumbing Enterprises` | `Privacy Policy` |
| `/terms` | Terms of Service (marked Draft in footer link) | `terms of service` | `on-site inspections`, `quotation approvals`, `plumbing coordination` | `Terms of Service \| FlowGuard Plumbing Enterprises` | `Terms of Service` |
| `/guides`, `/guides/[slug]`, `/projects` | Permanent redirects (`/en/blog`, `/en/blog/[slug]`, `/gallery`) | N/A | N/A | N/A | N/A |

### 2. Service Detail Pages (`/services/[slug]` — 9 Default Services)
1. `/services/pipe-installation-repairs` — **Pipe Installation & Repairs** (`Pipe Installation & Repairs in Kano`)
2. `/services/leak-detection-repairs` — **Leak Detection & Repairs** (`Leak Detection & Repairs in Kano`)
3. `/services/drainage-blockage-issues` — **Drainage & Blockage Issues** (`Drainage & Blockage Issues in Kano`)
4. `/services/bathroom-toilet-plumbing` — **Bathroom & Toilet Plumbing** (`Bathroom & Toilet Plumbing in Kano`)
5. `/services/kitchen-plumbing` — **Kitchen Plumbing** (`Kitchen Plumbing in Kano`)
6. `/services/water-storage-supply-systems` — **Water Storage & Supply Systems** (`Water Storage & Supply Systems in Kano`)
7. `/services/pump-installation-repairs` — **Pump Installation & Repairs** (`Pump Installation & Repairs in Kano`)
8. `/services/commercial-plumbing` — **Commercial & Facility Plumbing** (`Commercial & Facility Plumbing in Kano`)
9. `/services/plumbing-maintenance` — **Preventative Plumbing Maintenance** (`Preventative Plumbing Maintenance in Kano`)

### 3. Kano Area Pages (`/areas/[slug]` — 9 Active Locations in Settings)
1. `/areas/hotoro` — **Plumbing Services in Hotoro** (`Plumber in Hotoro, Kano`)
2. `/areas/nassarawa-gra` — **Plumbing Services in Nassarawa GRA** (`Plumber in Nassarawa GRA, Kano`)
3. `/areas/tarauni` — **Plumbing Services in Tarauni** (`Plumber in Tarauni, Kano`)
4. `/areas/fagge` — **Plumbing Services in Fagge** (`Plumber in Fagge, Kano`)
5. `/areas/dala` — **Plumbing Services in Dala** (`Plumber in Dala, Kano`)
6. `/areas/gwale` — **Plumbing Services in Gwale** (`Plumber in Gwale, Kano`)
7. `/areas/kano-municipal` — **Plumbing Services in Kano Municipal** (`Plumber in Kano Municipal, Kano`)
8. `/areas/kumbotso` — **Plumbing Services in Kumbotso** (`Plumber in Kumbotso, Kano`)
9. `/areas/bompai` — **Plumbing Services in Bompai** (`Plumber in Bompai, Kano`)

### 4. English & Hausa Blog Articles (12 Bilingual Pairs)
Source: `src/data/bilingual-blog-starter.ts`
1. `/en/blog/why-your-water-pump-keeps-stopping-kano` ↔ `/ha/blog/me-ya-sa-injin-ruwa-ke-kashewa-kano`
2. `/en/blog/how-to-fix-a-leaking-water-pipe-kano` ↔ `/ha/blog/yadda-ake-gyara-bututun-ruwa-mai-yoyo-kano`
3. `/en/blog/signs-your-water-pump-needs-repair` ↔ `/ha/blog/alamomin-injin-ruwa-na-bukatar-gyara`
4. `/en/blog/how-to-choose-a-water-pump-for-your-home` ↔ `/ha/blog/yadda-ake-zabar-injin-ruwa-na-gida`
5. `/en/blog/common-causes-of-low-water-pressure` ↔ `/ha/blog/dalilan-raguwar-karfin-ruwan-gida`
6. `/en/blog/emergency-plumbing-problems-and-what-to-do` ↔ `/ha/blog/matsalolin-famfo-na-gaggawa-da-abin-yi`
7. `/en/blog/how-to-maintain-your-water-tank` ↔ `/ha/blog/yadda-ake-kula-da-tankin-ruwa`
8. `/en/blog/common-toilet-problems-and-their-solutions` ↔ `/ha/blog/matsalolin-bandaki-da-yadda-ake-magance-su`
9. `/en/blog/how-to-prevent-blocked-drainage` ↔ `/ha/blog/yadda-ake-hana-toshewar-magudanar-ruwa`
10. `/en/blog/plumbing-work-for-new-houses-in-kano` ↔ `/ha/blog/aikin-famfo-na-sabon-gini-a-kano`
11. `/en/blog/bathroom-plumbing-installation-guide` ↔ `/ha/blog/girka-kayan-bandaki-da-shawa-kano`
12. `/en/blog/when-to-call-a-professional-plumber` ↔ `/ha/blog/yaushe-ya-kamata-a-kira-mai-aikin-famfo`

### 5. Private Portals & Login Pages (Indexability & Consistency)
- `/admin/login` — `Admin Login` (`noindex, nofollow`, disallowed in `robots.txt`). Consistent `AuthLayout`.
- `/customer` — `Customer Portal` (`noindex, nofollow`, disallowed in `robots.txt`). Consistent `AuthLayout` / `PortalShell`.
- `/plumber` — `Technician Portal` (`noindex, nofollow`, disallowed in `robots.txt`). Consistent `AuthLayout` / `PortalShell`.

*(Search volumes, impressions, CTR, and rankings are **unknown** from repository inspection and were not invented.)*

---

## B. Existing Keyword Map

| Keyword Theme | Primary Target Page | Supporting Pages | Title / H1 / Body Presence | Search Intent |
|---|---|---|---|---|
| `plumber in Kano`, `plumbing services in Kano` | `/`, `/services` | `/about`, `/request`, `/en/blog/when-to-call-a-professional-plumber` | In `/` `<title>`, `/services` `<title>` & H1, body copy | Commercial / transactional local hire |
| `pipe installation and repairs`, `water pipe installation in Kano` | `/services/pipe-installation-repairs` | `/en/blog/plumbing-work-for-new-houses-in-kano`, `/en/blog/common-causes-of-low-water-pressure` | In service `<title>`, H1, problems list, FAQs | Transactional service vs informational guide |
| `leak detection and repairs`, `leaking pipe repair in Kano` | `/services/leak-detection-repairs` | `/en/blog/how-to-fix-a-leaking-water-pipe-kano`, `/en/blog/emergency-plumbing-problems-and-what-to-do` | In service `<title>`, H1, and guide content | Transactional vs emergency DIY triage |
| `drainage and blockage issues`, `blocked drainage repair in Kano` | `/services/drainage-blockage-issues` | `/en/blog/how-to-prevent-blocked-drainage` | In service `<title>`, H1, and prevention guide | Transactional vs prevention |
| `bathroom and toilet plumbing`, `toilet repair in Kano` | `/services/bathroom-toilet-plumbing` | `/en/blog/common-toilet-problems-and-their-solutions`, `/en/blog/bathroom-plumbing-installation-guide` | In service `<title>`, H1, and guides | Transactional vs troubleshooting/planning |
| `water storage & supply systems`, `water tank installation in Kano` | `/services/water-storage-supply-systems` | `/en/blog/how-to-maintain-your-water-tank` | In service `<title>`, H1, and tank care guide | Transactional vs maintenance |
| `water pump installation and repairs`, `pumping machine repair in Kano` | `/services/pump-installation-repairs` | 3 pump guides (`why-your-water-pump-keeps-stopping-kano`, `signs-your-water-pump-needs-repair`, `how-to-choose-a-water-pump-for-your-home`) | Strong coverage across service page + 3 distinct intent guides | Service hire vs fault diagnosis vs selection |
| `kitchen plumbing`, `commercial plumbing`, `preventative maintenance` | `/services/kitchen-plumbing`, `/services/commercial-plumbing`, `/services/plumbing-maintenance` | `/services`, `/request` | In service `<title>`, H1, descriptions | Transactional |
| Kano neighborhood queries (`Hotoro`, `Nassarawa GRA`, `Tarauni`, `Fagge`, `Dala`, `Gwale`, `Kano Municipal`, `Kumbotso`, `Bompai`) | `/areas/[slug]` (9 pages) | `/areas`, `/contact`, `/` | In area `<title>`, H1, JSON-LD `areaServed` | Local neighborhood intent |
| Hausa plumbing queries (`mai aikin famfo`, `gyaran injin ruwa`, `bututun ruwa`, `tankin ruwa`, `magudanar ruwa`, `bandaki`, `matsalolin famfo na gaggawa`) | `/ha/blog` & `/ha/blog/[slug]` (12 pages) | `/` (`Guides (Hausa)` link), footer | Natural Hausa titles, summaries, and full guides | Hausa informational + booking CTA |

---

## C. Keyword Overlap

- **Pump Repair & Installation (`/services/pump-installation-repairs` vs 3 English pump guides):** Intentional and healthy separation of search intent — the service page targets `"Pump Installation & Repairs in Kano"` (booking/quote intent), while the 3 articles target distinct informational queries (pump stopping/tripping, repair warning signs, choosing pump capacity). Fixing the broken `target_service_slug` now connects all 3 guides directly back to `/services/pump-installation-repairs`.
- **Bathroom & Toilet Guides (`/services/bathroom-toilet-plumbing` vs 2 bathroom/toilet articles):** Distinct intents (repairing common toilet faults vs new bathroom installation planning).
- **Area Pages (`/areas/[slug]`):** All 9 area pages share the same structural template with `matchedArea` swapped in. They do not cannibalize `/services/[slug]` (service intent vs neighborhood intent), though adding genuine area-specific operational notes (once confirmed by the business) would further differentiate them.

---

## D. Missing Opportunities (Genuine Gaps Only)

1. **Hausa Service / Booking Entry Framing:** Hausa-speaking visitors land on `/ha/blog` and individual `/ha/blog/[slug]` articles, which link to English `/services/[slug]` and `/request`. Keeping a clear bilingual callout or Hausa summary on `/request` (without duplicating pages) would help Hausa searchers convert more smoothly.
2. **Supporting Guides for Commercial Plumbing & Kitchen Plumbing:** 10 of 12 blog articles map to pumps, pipes/leaks, drainage, tanks, and bathrooms; `kitchen-plumbing` and `commercial-plumbing` currently have no dedicated supporting guide articles.
3. **Real Case-Study / Project Details in `/gallery`:** Publishing more real completed Kano job photos with neighborhood/service tags in `/admin/gallery` will strengthen both local trust and visual search relevance.

---

## E. On-Page SEO Findings

1. **Duplicate Brand Name in `<title>` (Fixed):** `/about`, `/contact`, and `/faq` included `FlowGuard Plumbing Enterprises` inside `title` while root `layout.tsx` also applied `title.template` (`%s | FlowGuard Plumbing Enterprises`), producing doubled titles. Fixed on all three pages.
2. **Broken `target_service_slug` Links on 5 Bilingual Articles (Fixed):** `bilingual-blog-starter.ts` referenced `water-pump-installation-repair`, `water-tank-installation`, and `drainage-unblocking`, which did not match `DEFAULT_SERVICE_CATEGORIES` (`pump-installation-repairs`, `water-storage-supply-systems`, `drainage-blockage-issues`). Fixed all 5 so both blog-to-service CTAs and service-to-blog related guides resolve cleanly.
3. **Overlong Blog Article `<title>` Tags (Fixed):** `/en/blog/[slug]` and `/ha/blog/[slug]` appended `| FlowGuard Plumbing Enterprises` to `rawTitle` up to 65 chars (~96 chars total). Tightened to 52 chars + `| FlowGuard Plumbing`.
4. **Generic `/areas` Title & Missing OG/Twitter Metadata (Fixed):** Updated `/areas` title to `"Plumbing Service Areas in Kano"` and added `openGraph`/`twitter` metadata to `/areas`, `/join-as-plumber`, `/privacy`, `/terms`, and `/tracking`.
5. **Kano Location Missing Above the Fold on `/` Hero (Fixed):** Updated the hero subheadline in `src/app/(public)/page.tsx` to explicitly state **"across Kano State"** above the fold on both mobile and desktop.

---

## F. Local SEO Findings

- **Strengths:** Dedicated `/areas` index and 9 `/areas/[slug]` pages (`Hotoro`, `Nassarawa GRA`, `Tarauni`, `Fagge`, `Dala`, `Gwale`, `Kano Municipal`, `Kumbotso`, `Bompai`), `Plumber` + `Organization` JSON-LD with `PostalAddress` (`Kano State, NG`) and `areaServed`, and Kano-specific guides (`/en/blog`, `/ha/blog`).
- **Improvements Made:** Added `"across Kano State"` to the homepage hero above the fold and added direct internal links from `/areas/[slug]` to `/services` and `/en/blog`.
- **Remaining Business-Dependent Items:** `DEFAULT_SETTINGS.company_address` in `src/lib/marketplace.ts` is empty (`""`) — `/areas` and `/areas/[slug]` rely on Supabase `settings.company_address` being populated at runtime to remain indexable. Also, `binplumbingservices@gmail.com` is still visible in the live footer/contact details because it is stored in Supabase `settings` and fallback `marketplace-data.json`.

---

## G. English and Hausa Findings

- **Strengths:** Clean URL separation (`/en/blog` vs `/ha/blog`), bidirectional `hreflang` (`en-NG`, `ha`, `x-default`) in both page metadata and `sitemap.ts`, natural Hausa plumbing terminology (`mai aikin famfo`, `gyaran injin ruwa`, `bututun ruwa mai yoyo`, `magudanar ruwa`, `bandaki`), and `BlogPosting` JSON-LD with explicit `inLanguage` (`"en-NG"` vs `"ha"`).
- **Issue Found & Fixed:** On `/ha/blog`, category filter pills and article card category badges rendered raw English category names (`"Water Tanks & Pumps"`, `"Drainage & Unblocking"`, etc.). Added `HAUSA_CATEGORY_LABELS` in `src/components/blog/BlogIndexClient.tsx` so `/ha/blog` displays natural Hausa category labels while preserving filter behavior.

---

## H. UI/UX Findings (Desktop `1280x800` & Mobile `390x844`)

- **Layout & Overflow:** Zero horizontal overflow (`scrollWidth === innerWidth`) across all 7 audited live pages (`/`, `/services`, `/areas`, `/en/blog`, `/ha/blog`, `/request`, `/contact`) on both desktop and mobile.
- **Navigation & Footer:** Desktop navbar, mobile drawer, and mobile footer bottom spacing (`pb-24 md:pb-10`) render cleanly with zero clipping or footer overlap.
- **Accessibility & Contrast:** Previously resolved Lighthouse contrast (`#7A5400`) and unique `"Request this service"` link names, bringing Accessibility to `100/100`.
- **Remaining Visual / Mobile Observations (Documented for Owner Action):**
  - On `/services`, `/` gallery, and `/en/blog`, `/images/gallery/real-work-water-tank-fitting.jpg` shows a close-up personal selfie rather than water tank plumbing, and another service card shows an outdoor portrait rather than pipework.
  - On mobile (`390x844`), the fixed bottom-right floating WhatsApp button can sit over the bottom-right corner of mid-page form inputs/text while scrolling (`/request` dropdown, `/contact` office address).

---

## I. Technical SEO Findings

- **Sitemap & Robots:** `/sitemap.xml` and `/robots.txt` are dynamically generated, valid, and exclude `/admin`, `/customer`, `/plumber`, `/tracking`, and `/api`.
- **Canonical & Indexability:** Every public page has a canonical URL anchored to `SITE_URL` (`https://flowguard.com.ng`); `/tracking` and portal/login pages correctly set `robots: { index: false, follow: false }`.
- **Structured Data & Discovery:** `WebSite`, `Plumber`/`Organization`, `Service`, `FAQPage`, `BreadcrumbList`, and `BlogPosting` JSON-LD schemas are in place alongside `/.well-known/ard.json` and `/llms.txt`.
- **Live Hydration Note:** Live `/` still logs `Minified React error #418` (`HTML` mismatch) in the production browser console on `bin-plumbing-website.vercel.app` (does not reproduce on `/services`, `/contact`, `/faq`, `/about`, `/gallery`, or local `next start`, and produces `0` 4xx/5xx responses).

---

## J. Changes Implemented

1. [src/app/(public)/about/page.tsx](file:///c:/Users/HP/OneDrive/Documents/bin-plumbing-website/src/app/(public)/about/page.tsx): Removed duplicate brand suffix from `title` and added `twitter` metadata.
2. [src/app/(public)/contact/page.tsx](file:///c:/Users/HP/OneDrive/Documents/bin-plumbing-website/src/app/(public)/contact/page.tsx): Removed duplicate brand suffix from `title` and added `twitter` metadata.
3. [src/app/(public)/faq/page.tsx](file:///c:/Users/HP/OneDrive/Documents/bin-plumbing-website/src/app/(public)/faq/page.tsx): Removed duplicate brand suffix from `title` and added `twitter` metadata.
4. [src/app/(public)/areas/page.tsx](file:///c:/Users/HP/OneDrive/Documents/bin-plumbing-website/src/app/(public)/areas/page.tsx): Updated title to `"Plumbing Service Areas in Kano"` and added `openGraph` & `twitter` metadata.
5. [src/app/(public)/areas/[slug]/page.tsx](file:///c:/Users/HP/OneDrive/Documents/bin-plumbing-website/src/app/(public)/areas/[slug]/page.tsx): Added internal links to `/services` and `/en/blog`.
6. [src/app/(public)/join-as-plumber/page.tsx](file:///c:/Users/HP/OneDrive/Documents/bin-plumbing-website/src/app/(public)/join-as-plumber/page.tsx), [privacy/page.tsx](file:///c:/Users/HP/OneDrive/Documents/bin-plumbing-website/src/app/(public)/privacy/page.tsx), [terms/page.tsx](file:///c:/Users/HP/OneDrive/Documents/bin-plumbing-website/src/app/(public)/terms/page.tsx), [tracking/page.tsx](file:///c:/Users/HP/OneDrive/Documents/bin-plumbing-website/src/app/(public)/tracking/page.tsx): Added `openGraph` & `twitter` metadata (preserving `noindex, nofollow` on `/tracking`).
7. [src/app/(public)/en/blog/[slug]/page.tsx](file:///c:/Users/HP/OneDrive/Documents/bin-plumbing-website/src/app/(public)/en/blog/[slug]/page.tsx) & [src/app/(public)/ha/blog/[slug]/page.tsx](file:///c:/Users/HP/OneDrive/Documents/bin-plumbing-website/src/app/(public)/ha/blog/[slug]/page.tsx): Shortened appended title length to prevent SERP truncation.
8. [src/data/bilingual-blog-starter.ts](file:///c:/Users/HP/OneDrive/Documents/bin-plumbing-website/src/data/bilingual-blog-starter.ts): Fixed the 5 broken `target_service_slug` references to match `pump-installation-repairs`, `water-storage-supply-systems`, and `drainage-blockage-issues`.
9. [src/app/(public)/page.tsx](file:///c:/Users/HP/OneDrive/Documents/bin-plumbing-website/src/app/(public)/page.tsx): Added `"across Kano State"` to the above-the-fold hero subheadline.
10. [src/components/blog/BlogIndexClient.tsx](file:///c:/Users/HP/OneDrive/Documents/bin-plumbing-website/src/components/blog/BlogIndexClient.tsx): Localized blog category pills and card badges into Hausa on `/ha/blog`.

---

## K. Items Not Changed (Require Business Confirmation / Asset Replacement / Backend Data)

1. **Email & Fallback Seed References (`binplumbingservices@gmail.com` / `Bin Plumbing Services Ltd`):** Live email comes from Supabase `settings` (`company_email` / `notification_email`) and fallback `src/data/marketplace-data.json`. Kept untouched to avoid breaking active email channels without business confirmation.
2. **Mismatched Service/Gallery Photos:** `public/images/gallery/real-work-water-tank-fitting.jpg` (personal selfie) and the outdoor portrait service image should be replaced with real plumbing job photos by the owner.
3. **Footer Legal Labels (`Privacy Policy (Draft)`, `Terms & Conditions (Draft)`) & Attribution:** Retained pending final legal review.
4. **Custom Domain & Search Console:** `flowguard.com.ng` DNS connection on Vercel and Google Search Console verification/indexing remain external operational steps.
5. **Backend / Database / Auth / APIs:** Strictly untouched per project scope.

---

## L. Final Verification

All checks were run after the final code edits:
- `npm test`: **38/38 passed** (9 suites, 0 failed, 0 skipped).
- `npx tsc --noEmit`: **passed** (exit code `0`).
- `npm run lint`: **0 errors** (1 pre-existing unused-variable warning in `src/lib/portal-auth.ts` line 40 for `normalizeDigits`).
- `npm run build`: **succeeded** (`61/61` static/PPR routes generated cleanly, `sitemap.xml` and `robots.txt` valid).
