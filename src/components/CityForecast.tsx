import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { useSmokeData } from '@/hooks/useSmokeData';

interface CityForecastProps {
  cityCoordinates?: { lat: number; lng: number };
  cityName?: string;
}

interface ForecastData {
  timestamp: Date;
  smokeLevel: number;
  smokeDescription: string;
  concentration: number;
}

export const CityForecast: React.FC<CityForecastProps> = ({
  cityCoordinates,
  cityName
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

  if (!cityCoordinates || !cityName || !forecastData.length) {
    return null;
  }

// Timeline helpers and MT formatting
const tz = 'America/Denver';
const concentrationToCategory = (c: number) => {
  if (c <= 12) return 'good';
  if (c <= 35) return 'moderate';
  if (c <= 55) return 'unhealthy-sensitive';
  if (c <= 150) return 'unhealthy';
  if (c <= 250) return 'very-unhealthy';
  return 'hazardous';
};
const categoryClass: Record<string, string> = {
  good: 'bg-smoke-good',
  moderate: 'bg-smoke-moderate',
  'unhealthy-sensitive': 'bg-smoke-unhealthy-sensitive',
  unhealthy: 'bg-smoke-unhealthy',
  'very-unhealthy': 'bg-smoke-very-unhealthy',
  hazardous: 'bg-smoke-hazardous'
};
const formatMT = (d: Date) =>
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
    <Card className="p-3 bg-background/95 backdrop-blur-sm shadow-lg max-w-2xl">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-foreground whitespace-nowrap">
          {cityName} • 48h Smoke Forecast <span className="ml-1 text-[10px] text-muted-foreground">(MT)</span>
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

      {/* 48-hour single-line timeline */}
      <div className="flex items-center space-x-0.5 overflow-x-auto py-1">
        {forecastData.map((f, i) => {
          const category = concentrationToCategory(f.concentration);
          const colorClass = categoryClass[category] || 'bg-muted';
          return (
            <div
              key={i}
              className={`${colorClass} h-3 sm:h-4 w-2 sm:w-2.5 rounded flex-shrink-0`}
              title={`${f.timestamp.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', hour12: true, timeZone: tz })} • ${f.concentration.toFixed(1)} μg/m³ (${f.smokeDescription})`}
            />
          );
        })}
      </div>

      {/* Time scale (single line, small) */}
      <div className="flex justify-between text-[10px] text-muted-foreground whitespace-nowrap mt-1">
        {tickIndices.map((idx) => (
          <span key={idx}>{forecastData[idx] ? formatMT(forecastData[idx].timestamp) : ''}</span>
        ))}
      </div>
    </Card>
  );
};