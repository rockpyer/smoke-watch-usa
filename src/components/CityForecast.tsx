import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, Info, Sun, Cloud, CloudRain, CloudSnow, CloudLightning } from 'lucide-react';
import { useSmokeData } from '@/hooks/useSmokeDataOptimized';
import { useWeatherData } from '@/hooks/useWeatherData';
import tzLookup from 'tz-lookup';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point as turfPoint } from '@turf/helpers';

interface CityForecastProps {
  cityCoordinates?: { lat: number; lng: number };
  cityName?: string;
  compact?: boolean;
  selectedTime?: Date;
}

interface ForecastData {
  timestamp: Date;
  smokeLevel: number;
  smokeDescription: string;
  concentration: number;
  weatherCode?: number;
  temperature?: number;
}

const WeatherIcon = ({ code }: { code: number }) => {
  if (code >= 95) return <CloudLightning className="w-4 h-4" />;
  if (code >= 80) return <CloudRain className="w-4 h-4" />;
  if (code >= 71) return <CloudSnow className="w-4 h-4" />;
  if (code >= 51) return <CloudRain className="w-4 h-4" />;
  if (code > 1) return <Cloud className="w-4 h-4" />;
  return <Sun className="w-4 h-4" />;
};

export const CityForecast: React.FC<CityForecastProps> = ({
  cityCoordinates,
  cityName,
  compact = false,
  selectedTime
}) => {
  const { smokeLayers, refetch, isLoading: smokeLoading } = useSmokeData();
  const { weatherData, loading: weatherLoading, error: weatherError } = useWeatherData(cityCoordinates?.lat ?? 0, cityCoordinates?.lng ?? 0);
  const [forecastData, setForecastData] = useState<ForecastData[]>([]);
  
  // Use ref to prevent unnecessary re-renders
  const lastSelectedTimeRef = useRef<Date | null>(null);

  useEffect(() => {
    if (!cityCoordinates || !smokeLayers.length || !weatherData) {
      setForecastData([]);
      return;
    }

    const point = turfPoint([cityCoordinates.lng, cityCoordinates.lat]);

    // Extract forecast data for the city location
    const forecast: ForecastData[] = [];
    
    smokeLayers.forEach((layer, layerIndex) => {
      // Find smoke data that contains this city's coordinates
      let citySmoke = null;
      
      for (const polygon of layer.data) {
        if (booleanPointInPolygon(point, polygon.geometry)) {
          citySmoke = polygon.properties;
          break;
        }
      }

      let closestWeatherIndex = -1;
      let minDiff = Infinity;

      weatherData.hourly.time.forEach((t, index) => {
        const diff = Math.abs(new Date(t).getTime() - layer.timestamp.getTime());
        if (diff < minDiff) {
          minDiff = diff;
          closestWeatherIndex = index;
        }
      });

      let weatherCode, temperature;
      if (closestWeatherIndex !== -1 && minDiff < 30 * 60 * 1000) {
        weatherCode = weatherData.hourly.weather_code[closestWeatherIndex];
        temperature = weatherData.hourly.temperature_2m[closestWeatherIndex];
      }
      
      forecast.push({
        timestamp: layer.timestamp,
        smokeLevel: citySmoke?.smoke_class || 0,
        smokeDescription: citySmoke?.smoke_classdesc || 'No Smoke',
        concentration: citySmoke?.concentration_ugm3 || 0,
        weatherCode: weatherCode,
        temperature: temperature,
      });
    });
    
    setForecastData(forecast.slice(0, 48)); // Show next 48 time periods if available
  }, [cityCoordinates, smokeLayers, weatherData]);

  // Memoize timeline calculations and current time index - OPTIMIZED
  const timelineData = useMemo(() => {
    if (!forecastData.length) return null;

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
    const formatDate = (d: Date) =>
      d.toLocaleString('en-US', { month: 'short', day: 'numeric', timeZone: tz });

    const total = forecastData.length;
    const tickIndices = [
      0,
      Math.min(12, total - 1),
      Math.min(24, total - 1),
      Math.min(36, total - 1),
      Math.max(0, total - 1)
    ];

    // Find current time index for highlighting - STABLE calculation
    let currentTimeIndex = -1;
    if (selectedTime) {
      // Only recalculate if selectedTime actually changed
      const timeChanged = !lastSelectedTimeRef.current || 
        lastSelectedTimeRef.current.getTime() !== selectedTime.getTime();
      
      if (timeChanged) {
        lastSelectedTimeRef.current = selectedTime;
        
        // First try exact timestamp match
        currentTimeIndex = forecastData.findIndex(f => 
          f.timestamp.getTime() === selectedTime.getTime()
        );
        
        // If no exact match, find closest within 30 minutes
        if (currentTimeIndex === -1) {
          let closestDiff = Infinity;
          forecastData.forEach((f, i) => {
            const diff = Math.abs(f.timestamp.getTime() - selectedTime.getTime());
            if (diff < closestDiff && diff < 30 * 60 * 1000) { // Within 30 minutes
              closestDiff = diff;
              currentTimeIndex = i;
            }
          });
        }
      }
    }

    // Generate date labels - only show date when it changes
    const dateLabels: Array<{index: number, date: string}> = [];
    let lastDate = '';
    tickIndices.forEach(idx => {
      if (forecastData[idx]) {
        const currentDate = formatDate(forecastData[idx].timestamp);
        if (currentDate !== lastDate) {
          dateLabels.push({index: idx, date: currentDate});
          lastDate = currentDate;
        }
      }
    });

    return {
      tz,
      tzShort,
      concentrationToCategory,
      categoryClass,
      formatLocal,
      total,
      tickIndices,
      currentTimeIndex,
      dateLabels
    };
  }, [forecastData, selectedTime, cityCoordinates]);

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

  if (!forecastData.length || !timelineData) {
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
            disabled={smokeLoading}
            className="h-6 w-6 p-0"
            aria-label="Refresh city forecast"
          >
            <RefreshCw className={`h-3 w-3 ${smokeLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <div className="text-[11px] text-muted-foreground">
          {smokeLoading ? 'Loading forecast…' : 'No smoke forecast data for this location yet.'}
        </div>
      </Card>
    );
  }

  const { tz, tzShort, concentrationToCategory, categoryClass, formatLocal, total, tickIndices, currentTimeIndex, dateLabels } = timelineData;

  return (
    <Card className={`${compact ? 'p-2' : 'p-3'} bg-background/95 backdrop-blur-sm shadow-lg max-w-2xl`}>
      <div className="flex items-center justify-between mb-2">
        <h3 className={`${compact ? 'text-xs' : 'text-sm'} font-semibold text-foreground whitespace-nowrap`}>
          {cityName} • 48h Smoke & Weather Forecast <span className="ml-1 text-[10px] text-muted-foreground">({tzShort})</span>
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={refetch}
          disabled={smokeLoading || weatherLoading}
          className="h-6 w-6 p-0"
          aria-label="Refresh city forecast"
        >
          <RefreshCw className={`h-3 w-3 ${smokeLoading || weatherLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Date labels - positioned above the timeline */}
      <div className="relative mb-1">
        <div className="flex justify-between text-[9px] text-muted-foreground font-medium h-3">
          {dateLabels.map(({index, date}) => {
            const position = (index / Math.max(1, total - 1)) * 100;
            return (
              <div 
                key={index} 
                className="absolute transform -translate-x-1/2" 
                style={{left: `${position}%`}}
              >
                {date}
              </div>
            );
          })}
        </div>
      </div>

      {/* 48-hour single-line timeline with enhanced tooltips */}
      <div className="flex items-center space-x-0.5 overflow-x-auto py-1">
        {forecastData.map((f, i) => {
          const category = concentrationToCategory(f.concentration);
          const colorClass = categoryClass[category] || 'bg-muted';
          const airQualityDesc = getAirQualityDescription(f.concentration);
          const isCurrentTime = i === currentTimeIndex;
          
          return (
            <div
              key={i}
              className="flex flex-col items-center"
            >
              {f.weatherCode !== undefined && <WeatherIcon code={f.weatherCode} />}
              <div
                className={`${colorClass} h-3 sm:h-4 w-2 sm:w-2.5 rounded flex-shrink-0 cursor-pointer transition-all hover:scale-110 hover:z-10 relative group ${
                  isCurrentTime ? 'ring-2 ring-black ring-inset' : ''
                }`}
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
              {f.temperature !== undefined && <span className="text-[10px]">{f.temperature.toFixed(0)}°</span>}
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
