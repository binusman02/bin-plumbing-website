# Google Business Profile (GBP) Setup & Local SEO Checklist

Follow this checklist after configuring your real business details in **Admin -> Settings -> Business**:

## 1. Consistent NAP (Name, Address, Phone)
Ensure your Google Business Profile matches **Admin -> Settings -> Business** character-for-character:
- **Business Name:** `Bin Plumbing Services Ltd` (exact match to `settings.company_name`)
- **Primary Category:** `Plumber`
- **Secondary Categories:** `Drainage Service`, `Water Pump Supplier` (only if applicable)
- **Address:** Must match `settings.company_address`
- **Phone Number:** Must match `settings.company_phone`
- **Website URL:** Your live production domain (e.g. `https://binplumbing.com`)
- **Working Hours:** Must match `settings.working_hours`

## 2. Service Areas
- Add **only** the active areas configured in `settings.active_coverage_locations`.
- Do not add states or LGAs where you do not actively dispatch technicians.

## 3. Verification & Photos
- Complete Google Business Profile postcard, video, or phone verification.
- Upload genuine, high-resolution work photos from the same set published in `/gallery` (avoid stock images or watermarked photos).

## 4. Reviews & Citations
- After each job reaches `completed`, ask the customer to submit a review through their Customer Portal (`/customer`), or share your GBP review link alongside the on-site review option.
- Keep your CAC RC Number (`settings.rc_number`) consistent on Nigerian business directories (e.g. VConnect, Finelib, Nigeria Directory).

## 5. Search Console & Bing Verification
Set these environment variables in your production hosting dashboard to verify site ownership automatically:
- `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION=<token>`
- `NEXT_PUBLIC_BING_VERIFICATION=<token>`
