## What to change

### 1. Remove the Analytics link from the home page
In `src/pages/Index.tsx`, remove the `<Link to="/analytics">` chip next to the TrailSmoke title (and its `BarChart3` / `Link` imports if no longer used). The `/analytics` route itself can stay in `App.tsx` for now so nothing breaks if you bookmark it — just no UI entry from the home page.

### 2. Stop the disconnected‑Supabase analytics traffic
The network log shows the app firing a POST to the (now disconnected) Supabase `smokeusage` table every ~10s, each failing with `NetworkError`. On mobile this competes for bandwidth and main‑thread time during the first paint, which makes the initial polygon load feel broken.

Make all analytics calls no‑ops while the backend is disconnected:

- In `src/services/analyticsService.ts`, add a top‑level `ANALYTICS_ENABLED` flag (default `false`) and short‑circuit every public method (`trackPageLoad`, `trackCitySearch`, `trackLocationClick`, `trackTimeChange`, `trackForecastView`, plus the periodic flush/heartbeat timer) when the flag is off. Also clear any existing `setInterval` flush loop so no background timer keeps firing.
- Leave the `useAnalytics` hook API unchanged so call sites in `Index.tsx`, `CityForecast.tsx`, and `PrivacyReality.tsx` don't need edits.

This single flag is what we flip back when Lovable Cloud is reconnected.

### 3. Fix mobile "no polygons on initial load"
Root cause in `src/components/SmokeMap.tsx`: the unified render effect only fires when one of its dependencies changes, but it gates on `map.current.isStyleLoaded()`. On slower mobile devices the style isn't loaded yet when `currentLayer` first arrives, the effect bails, and nothing re‑triggers it until the user pans the map (which is exactly the reported symptom — polygons appear after the first map interaction).

Fixes:

- After `new mapboxgl.Map(...)`, attach `map.current.on('styledata', ...)` and `map.current.on('idle', ...)` handlers that bump a `styleReadyTick` state. Add that tick to the render effect's dependency array so the effect re‑runs as soon as the style is actually ready.
- In the render effect, when `map.current.isStyleLoaded()` is false but a `layerToRender` exists, schedule one retry via `map.current.once('idle', addSmokeLayer)` instead of silently returning.
- Remove `isUpdatingLayers` from `addSmokeLayer`'s `useCallback` deps and from the render effect deps — it's a transient flag the same callback sets, so including it causes redundant re‑creations and missed renders. Keep the in‑function guard.
- Keep the existing "fit to bounds on first render" behavior; just make sure it runs after the retry path too.

### 4. Smaller speed/reliability wins (low risk, no functional change)

- `src/services/smokeDataService.ts`: the paginated fetch is sequential. After the first page returns `exceededTransferLimit`, fire pages 2..N in parallel with `Promise.all` using the known `pageSize`. This typically cuts cold‑load time from ~4 sequential round‑trips to ~1.
- `src/services/smokeDataService.ts`: drop the unused `ensureFullForecastRange` and `generateFallbackSmokeData` helpers (per your "no simulated data" rule). Removes ~110 lines and prevents accidental future use.
- `src/hooks/useSmokeDataOptimized.ts`: the `timeSlicedProcess` call on initial load just pushes layers into an array — it doesn't actually slice any heavy work and adds a `setTimeout`/`requestIdleCallback` ladder. Replace with a direct `setSmokeLayers(data)` inside `startTransition`. Faster TTI, same result.
- `src/components/SmokeMap.tsx`: the polygon "process features in chunks" loop is just shaping objects — for typical NOAA frame sizes this is sub‑millisecond, but wrapping it in `setTimeout(0)` chains delays the first paint by ~30–80ms on mobile. Replace with a synchronous map; keep the Promise return shape so call sites don't change.
- `src/components/SmokeMap.tsx`: the bare `setTimeout(() => initializeMap(), 100)` before map init is a leftover. Initialize on mount directly.

### 5. Things I am NOT changing (calling out so you can confirm)

- Not removing the `/analytics` route or `src/pages/Analytics.tsx` — only the home‑page link. Say the word and I'll delete the route too.
- Not touching `useWeatherData`, `fireDataService`, `CityForecast`, or the time‑slider UI.
- Not adding any fabricated/fallback smoke data.

## Verification plan

- Hard‑reload on mobile (DuckDuckGo + Firefox) and confirm polygons appear without panning.
- Confirm the network panel no longer shows repeated POSTs to `…/smokeusage`.
- Confirm cold load time to first polygon paint drops on a throttled "Fast 3G" run in DevTools.
- Confirm the time slider, city search, fire dots, and CityForecast still behave exactly as before.
