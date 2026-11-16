# Live Tracking & MapLibre Map Configuration

All live maps (Plumber, Customer, Admin, and Request Form) use **MapLibre GL JS** via `src/components/map/LiveMap.tsx`, configured by `NEXT_PUBLIC_MAP_STYLE_URL`.

When `NEXT_PUBLIC_MAP_STYLE_URL` is unset, the app falls back to public OpenStreetMap raster tiles (`tile.openstreetmap.org`) for local development only. The Admin Settings page displays a warning while this fallback is active.

## Setting Up a Production Vector Map Key

### Option A: MapTiler (Recommended)
1. Create an account at [cloud.maptiler.com](https://cloud.maptiler.com/).
2. Go to **Account → Keys**, create a dedicated browser key (or edit the default key).
3. Under **Allowed HTTP origins / Referrers**, restrict the key to your production domain(s):
   - `https://binplumbing.com.ng/*`
   - `https://www.binplumbing.com.ng/*`
   - `http://localhost:3000/*` (optional, for local testing)
4. Copy the **Streets** or **Basic** style JSON URL:
   `https://api.maptiler.com/maps/streets-v2/style.json?key=YOUR_DOMAIN_RESTRICTED_KEY`

### Option B: Stadia Maps
1. Create an account at [client.stadiamaps.com](https://client.stadiamaps.com/).
2. Add your domain (`binplumbing.com.ng`) under **Domain Authentication** or create a domain-restricted API key.
3. Use the style JSON URL:
   `https://tiles.stadiamaps.com/styles/osm_bright.json?api_key=YOUR_DOMAIN_RESTRICTED_KEY`

## Applying the Environment Variable

- **Local development (`.env.local`):**
  ```env
  NEXT_PUBLIC_MAP_STYLE_URL=https://api.maptiler.com/maps/streets-v2/style.json?key=YOUR_KEY
  ```
- **Production (Vercel / Hosting Provider):**
  Add `NEXT_PUBLIC_MAP_STYLE_URL` in your project's Environment Variables for **Production** (and Preview if desired) and trigger a new deployment (remember `NEXT_PUBLIC_*` values are inlined at build time).
