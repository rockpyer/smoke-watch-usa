import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, Info } from 'lucide-react';
import { useSmokeData } from '@/hooks/useSmokeData';
import tzLookup from 'tz-lookup';

interface CityForecastProps {
  cityCoordinates?: { lat: number; lng: number };
  cityName?: string;
  compact?: boolean;
}

interface ForecastData {
  timestamp: Date;
  smokeLevel: number;
  smokeDescription: string;
  concentration: number;
}

export const CityForecast: React.FC<CityForecastProps> = ({
  cityCoordinates,
  cityName,
  compact = false
}) => {
  const { smokeLayers, refetch, isLoading } = useSmokeData();
  const [forecastData, setForecastData] = useState<ForecastData[]>([]);

  useEffect(() => {
    console.log('🌆 CityForecast: useEffect triggered', { 
      cityCoordinates, 
      smokeLayers: smokeLayers.length,
      sampleTimestamp: smokeLayers[0]?.timestamp?.toISOString()
    });
    
    if (!cityCoordinates || !smokeLayers.length) {
      setForecastData([]);
      return;
    }

    // Extract forecast data for the city location
    const forecast: ForecastData[] = [];
    
    smokeLayers.forEach(layer => {
      // Find smoke data that contains this city's coordinates
      let citySmoke = null;
      
      for (const polygon of layer.data) {
        if (isPointInPolygon(cityCoordinates, polygon.geometry.coordinates[0])) {
          citySmoke = polygon.properties;
          break;
        }
      }
      
      forecast.push({
        timestamp: layer.timestamp,
        smokeLevel: citySmoke?.smoke_class || 0,
        smokeDescription: citySmoke?.smoke_classdesc || 'No Smoke',
        concentration: citySmoke?.concentration_ugm3 || 0
      });
      
      console.log(`🕐 Forecast entry: ${layer.timestamp.toISOString()} - Level: ${citySmoke?.smoke_class || 0}`);
    });
    
    console.log(`📊 Generated ${forecast.length} forecast entries`);
    setForecastData(forecast.slice(0, 48)); // Show next 48 time periods if available
  }, [cityCoordinates, smokeLayers]);

  // Point-in-polygon check (simple ray casting)
  const isPointInPolygon = (point: { lat: number; lng: number }, polygon: number[][]) => {
    const x = point.lng;
    const y = point.lat;
    let inside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0];
      const yi = polygon[i][1];
      const xj = polygon[j][0];
      const yj = polygon[j][1];

      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }

    return inside;
  };

  const getSmokeColor = (smokeLevel: number) => {
    switch (smokeLevel) {
      case 1: return 'bg-green-500';
      case 2: return 'bg-yellow-500';
      case 3: return 'bg-orange-500';
      case 4: return 'bg-red-500';
      case 5: return 'bg-purple-500';
      default: return 'bg-gray-300';
    }
  };

  // Enhanced air quality description function
  const getAirQualityDescription = (concentration: number) => {
    if (concentration < 3) return 'Good Air Quality';
    if (concentration <= 12) return 'Light Smoke';
    if (concentration <= 35) return 'Moderate Smoke';
    if (concentration <= 55) return 'Unhealthy for Sensitive Groups';
    if (concentration <= 150) return 'Unhealthy';
    if (concentration <= 250) return 'Very Unhealthy';
    return 'Hazardous';
  };

  if (!cityCoordinates || !cityName) {
    return null;
  }

  if (!forecastData.length) {
    return (
      <Card className={`${compact ? 'p-2' : 'p-3'} bg-background/95 backdrop-blur-sm shadow-lg max-w-2xl`}>
        <div className="flex items-center justify-between mb-2">
          <h3 className={`${compact ? 'text-xs' : 'text-sm'} font-semibold text-foreground whitespace-nowrap`}>
            {cityName} • 48h Smoke Forecast
          </h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={refetch}
            disabled={isLoading}
            className="h-6 w-6 p-0"
            aria-label="Refresh city forecast"
          >
            <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <div className="text-[11px] text-muted-foreground">
          {isLoading ? 'Loading forecast…' : 'No smoke forecast data for this location yet.'}
        </div>
      </Card>
    );
  }

// Timeline helpers and local timezone formatting
const tz = cityCoordinates ? tzLookup(cityCoordinates.lat, cityCoordinates.lng) : 'America/Denver';
const tzShort = new Date().toLocaleTimeString('en-US', { timeZone: tz, timeZoneName: 'short' }).split(' ').pop() || 'local';
const concentrationToCategory = (c: number) => {
  if (c < 3) return 'none';
  if (c <= 12) return 'light';
  if (c <= 35) return 'moderate';
  if (c <= 55) return 'unhealthy-sensitive';
  if (c <= 150) return 'unhealthy';
  if (c <= 250) return 'very-unhealthy';
  return 'hazardous';
};
const categoryClass: Record<string, string> = {
  none: 'bg-smoke-none',
  light: 'bg-smoke-light',
  moderate: 'bg-smoke-moderate',
  'unhealthy-sensitive': 'bg-smoke-unhealthy-sensitive',
  unhealthy: 'bg-smoke-unhealthy',
  'very-unhealthy': 'bg-smoke-very-unhealthy',
  hazardous: 'bg-smoke-hazardous'
};
const formatLocal = (d: Date) =>
  d.toLocaleString('en-US', { hour: 'numeric', hour12: true, timeZone: tz });
const total = forecastData.length;
const tickIndices = [
  0,
  Math.min(12, total - 1),
  Math.min(24, total - 1),
  Math.min(36, total - 1),
  Math.max(0, total - 1)
];

  return (
    <Card className={`${compact ? 'p-2' : 'p-3'} bg-background/95 backdrop-blur-sm shadow-lg max-w-2xl`}>
      <div className="flex items-center justify-between mb-2">
        <h3 className={`${compact ? 'text-xs' : 'text-sm'} font-semibold text-foreground whitespace-nowrap`}>
          {cityName} • 48h Smoke Forecast <span className="ml-1 text-[10px] text-muted-foreground">({tzShort})</span>
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={refetch}
          disabled={isLoading}
          className="h-6 w-6 p-0"
          aria-label="Refresh city forecast"
        >
          <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* 48-hour single-line timeline with enhanced tooltips */}
      <div className="flex items-center space-x-0.5 overflow-x-auto py-1">
        {forecastData.map((f, i) => {
          const category = concentrationToCategory(f.concentration);
          const colorClass = categoryClass[category] || 'bg-muted';
          const airQualityDesc = getAirQualityDescription(f.concentration);
          
          return (
            <div
              key={i}
              className={`${colorClass} h-3 sm:h-4 w-2 sm:w-2.5 rounded flex-shrink-0 cursor-pointer transition-all hover:scale-110 hover:z-10 relative group`}
              title={`${f.timestamp.toLocaleString('en-US', { 
                month: 'short', 
                day: 'numeric', 
                hour: 'numeric', 
                hour12: true, 
                timeZone: tz 
              })} • ${f.concentration.toFixed(1)} μg/m³ • ${airQualityDesc}`}
            >
              <Info className="h-2 w-2 text-white/70 absolute top-0 left-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            </div>
          );
        })}
      </div>

      {/* Time scale (single line, small) */}
      <div className="flex justify-between text-[10px] text-muted-foreground whitespace-nowrap mt-1">
        {tickIndices.map((idx) => (
          <span key={idx}>{forecastData[idx] ? formatLocal(forecastData[idx].timestamp) : ''}</span>
        ))}
      </div>
    </Card>
  );
};
