# Smoke Watch USA

Smoke Watch USA is a modern web application for visualizing wildfire smoke forecasts and active fire incidents across North America. It provides interactive mapping, city-level smoke forecasts, and real-time fire metadata, making it a valuable tool for air quality awareness and wildfire monitoring.

## Features

- **48-Hour Smoke Forecasts:**
  - Fetches official government (NOAA HRRR) smoke forecast data as polygons for the next 48 hours.
  - Visualizes smoke plumes and concentrations on an interactive map.
  - Allows users to look back and forecast smoke conditions for any city searched, covering the full 48-hour period.

- **Active Fire Mapping:**
  - Displays current wildfire perimeters and incidents on the map.
  - Provides additional metadata for each fire, including location, status, and other relevant details.

- **City Search & Forecast Details:**
  - Search for any city to view its smoke exposure timeline and forecast.
  - See historical and predicted smoke levels for the selected location.

- **Responsive, Modern UI:**
  - Built with React, Vite, TypeScript, shadcn-ui, and Tailwind CSS.
  - Fast, mobile-friendly, and visually appealing interface.

## Technologies Used

- Vite
- React
- TypeScript
- shadcn-ui
- Tailwind CSS

## Getting Started

1. **Clone the repository:**
   ```sh
   git clone <YOUR_GIT_URL>
   cd smoke-watch-usa
   ```
2. **Install dependencies:**
   ```sh
   npm i
   ```
3. **Start the development server:**
   ```sh
   npm run dev
   ```
4. **Open your browser:**
   Visit the local URL shown in your terminal (usually http://localhost:5173).

## Data Sources

- **Smoke Forecasts:** NOAA HRRR model (polygon data)
- **Wildfire Incidents:** Official government fire data feeds

## Project Structure

- `src/components/SmokeMap.tsx` — Main interactive map for smoke and fire visualization
- `src/services/smokeDataService.ts` — Fetches and processes smoke forecast data
- `src/services/fireDataService.ts` — Fetches and processes active fire data
- `src/components/CityForecast.tsx` — City-level smoke forecast details
- `src/components/LocationInfo.tsx` — Location metadata and info
- `src/components/TimeControls.tsx` — Timeline controls for lookback/forecast

## License

This project is open source. See the LICENSE file for details.

---

For more information, see the Lovable-README.md for Lovable-specific instructions and deployment options.
