## Unified edgeless, map‑first redesign (mobile + desktop)

One design language across both form factors: the map is the canvas, controls float as translucent chips with `backdrop-blur`, and bordered "AI dashboard" cards are gone. Desktop keeps a sidebar but it adopts the same edgeless chrome.

### A. Shared design tokens (apply everywhere)

- **Chip style**: `bg-background/70 backdrop-blur-md rounded-2xl` (or `rounded-full` for single‑row controls). No `border`, no `shadow-lg`. Subtle `shadow-[0_2px_12px_rgba(0,0,0,0.15)]` only where contrast over the map needs help.
- **Card style** inside the details sheet / desktop sidebar: plain padded `div`s with a hairline `border-border/30` divider between sections instead of stacked bordered cards.
- **Colors**: only semantic tokens (`bg-background/70`, `text-foreground`, `border-border/30`). No hardcoded hex.
- **Icon‑first**: small `lucide-react` icons inside chips; labels appear inline only at `md+` widths where there's room.

### B. Header

- **Mobile**: replace the full‑width header with a floating top‑left wordmark chip — `Cloud` icon + `TrailSmoke` in `text-sm font-semibold`, no card background, just `drop-shadow`. Tapping it opens the details sheet.
- **Desktop**: same wordmark moves to top‑left as a chip too (no full‑width header bar). Subtitle "48h wildfire smoke forecasting" sits as `text-xs text-muted-foreground` inline next to the wordmark. This frees ~70px of vertical space across desktop and unifies the visual language.

### C. CityForecast strip

- Render as a **transparent strip** on both mobile and desktop when used as the top overlay: `bg-transparent shadow-none border-0`. The colored bars + weather glyphs are the visible UI.
- Position: floating top‑center over the map on both breakpoints, `max-w-[640px]` desktop, full‑width minus 16px padding on mobile.
- Fix the clipped "9 P" with `pr-3` on the inner `min-w-max` wrapper.
- Position date labels absolutely above their matching time column so `Jun 27` no longer collides with the prior day's `9 PM`.
- **Tappable bars** (both breakpoints): each colored bar is a `<button>` with `aria-label="3 PM, light smoke"` that calls a new optional `onTimeSelect` prop. `Index.tsx` wires `handleTimeChange` so a tap jumps the time slider + repaints map polygons.
- Replace the invisible `ring-2 ring-black` active indicator with a small `▼` caret in `text-foreground` above the active bar — visible on every smoke color and in both themes.

### D. TimeControls

- **Mobile** and **desktop**: a single floating pill at the bottom of the map. Inline order: ⟲ ◀ ▶/⏸ ▶ • slider • time label. `rounded-full`, no border, `backdrop-blur-md`.
- Drop the "Frame N of M" and "Current Conditions / Forecast Time" sub‑labels — redundant given the time label.
- This deletes the desktop sidebar `TimeControls` block entirely; the sidebar shrinks to just details + legend.

### E. Map chrome

- **Search**: collapsed `Search` icon chip top‑left on both breakpoints. Tap expands inline to `max-w-[260px]` (mobile) / `max-w-[360px]` (desktop) with input + locate button. Auto‑collapses on blur.
- **NOAA forecast date chip**: shrink to `text-[10px] py-1 px-2 bottom-2 left-2 rounded-full bg-background/70 backdrop-blur` on both breakpoints.
- Hide the fixed bottom footer on mobile; on desktop keep it but restyle as a slim translucent chip bottom‑right with just "NOAA HRRR‑Smoke · Real‑time". No more full‑width bordered bar.

### F. Details + Legend

- **Mobile**: floating chip bottom‑right of the map showing `Info` icon + truncated city name. Tap opens a `Sheet side="bottom"` with `LocationInfo` + `SmokeLegend` + data‑source footer. Chip pulses once when a new location is selected.
- **Desktop**: keep the right sidebar but restyle it edgeless — single `bg-background/70 backdrop-blur-md rounded-2xl` panel containing `LocationInfo` + a thin divider + `SmokeLegend`. No nested cards. The sidebar narrows from `col-span-1 of 4` to a fixed `w-[300px]` panel floating over the map (`absolute right-4 top-20 bottom-20`), so the map takes the full width underneath. Add a small collapse chevron to hide the panel.

### G. Layout shift

- `Index.tsx` becomes: full‑viewport `<SmokeMapLazy />` as the base layer, everything else (`wordmark`, `search`, `CityForecast`, `TimeControls`, details chip/panel, NOAA chip) absolutely positioned over it. No more grid columns or stacked sections on either breakpoint.
- `useIsMobile()` only toggles where the details panel lives (right‑side floating panel on desktop, bottom sheet on mobile) and the wordmark/subtitle inline behavior.

### What stays the same

- No changes to data services, smoke/fire fetching, polygon rendering, the weather hook, or analytics.
- No new dependencies. Uses existing `Sheet`, `Button`, `lucide-react`, `useIsMobile`.
- No changes to `/analytics` or `/privacy-reality` pages.

### Technical notes

- All overlays sit in a `pointer-events-none` absolute layer with `pointer-events-auto` on each chip so the map stays pannable in the gaps between controls.
- `onTimeSelect` is additive on `CityForecast`; existing call sites work unchanged.
- The desktop sidebar collapse state lives in `Index.tsx` `useState`, not persisted.

### Verification

- **Mobile** (390×844): map fills ~90% of viewport. Wordmark, search icon, forecast strip, time pill, details chip all float without bordered cards. Tap forecast bar → time updates. Tap details chip → bottom sheet opens.
- **Desktop** (1280×800): same overlay language. Right‑side details panel is a single translucent rounded panel, collapsible. Tap forecast bar → time updates. Time pill sits at bottom‑center over the map.
- No clipped labels in the forecast strip; active‑hour caret visible on every smoke color in both themes.
