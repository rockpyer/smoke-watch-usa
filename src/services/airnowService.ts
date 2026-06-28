// AirNow observed AQI service
// Note: key is exposed client-side; AirNow keys are free, read-only, and rate-limited.
const AIRNOW_API_KEY = 'B3DEE055-3D6A-4F7B-931B-F0A3D1F08FC0';

export interface AirNowObservation {
  parameter: string; // "PM2.5", "OZONE", "PM10"
  aqi: number;
  category: string;
  reportingArea?: string;
  stateCode?: string;
  dateObserved?: string;
  hourObserved?: number;
}

interface AirNowRaw {
  DateObserved: string;
  HourObserved: number;
  LocalTimeZone: string;
  ReportingArea: string;
  StateCode: string;
  Latitude: number;
  Longitude: number;
  ParameterName: string;
  AQI: number;
  Category: { Number: number; Name: string };
}

export async function fetchObservedAQI(
  lat: number,
  lng: number,
  distanceMiles = 25
): Promise<AirNowObservation[] | null> {
  try {
    const url = `https://www.airnowapi.org/aq/observation/latLong/current/?format=application/json&latitude=${lat}&longitude=${lng}&distance=${distanceMiles}&API_KEY=${AIRNOW_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data: AirNowRaw[] = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    return data.map((d) => ({
      parameter: d.ParameterName,
      aqi: d.AQI,
      category: d.Category?.Name ?? '',
      reportingArea: d.ReportingArea,
      stateCode: d.StateCode,
      dateObserved: d.DateObserved?.trim(),
      hourObserved: d.HourObserved,
    }));
  } catch (err) {
    console.warn('AirNow fetch failed:', err);
    return null;
  }
}