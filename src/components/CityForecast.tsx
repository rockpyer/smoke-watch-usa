import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, Info, Sun, Cloud, CloudRain, CloudSnow, CloudLightning } from 'lucide-react';
import { useSmokeData } from '@/hooks/useSmokeDataOptimized';
import { useWeatherData } from '@/hooks/useWeatherData';
import { useAnalytics } from '@/hooks/useAnalytics';
import tzLookup from 'tz-lookup';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point as turfPoint } from '@turf/helpers';
interface CityForecastProps {
  cityCoordinates?: {
    lat: number;
    lng: number;
  };
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
const WeatherIcon = ({
  code
}: {
  code: number;
}) => {
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
  const {
    smokeLayers,
    refetch,
    isLoading: smokeLoading
  } = useSmokeData();
  const {
    weatherData,
    loading: weatherLoading,
    error: weatherError
  } = useWeatherData(cityCoordinates?.lat ?? 0, cityCoordinates?.lng ?? 0);
  const {
    trackForecastView
  } = useAnalytics();
  const [forecastData, setForecastData] = useState<ForecastData[]>([]);

  // Use ref to prevent unnecessary re-renders and track meaningful forecast views
  const lastSelectedTimeRef = useRef<Date | null>(null);
  const lastTrackedCityRef = useRef<string | null>(null);
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
        temperature: temperature
      });
    });
    const forecastSlice = forecast.slice(0, 48);
    setForecastData(forecastSlice); // Show next 48 time periods if available

    // Track forecast view event only for new cities (not time changes)
    if (cityName && cityCoordinates && forecastSlice.length > 0 && lastTrackedCityRef.current !== cityName) {
      lastTrackedCityRef.current = cityName;
      trackForecastView(cityName, true, cityCoordinates.lat, cityCoordinates.lng);
    }
  }, [cityCoordinates, smokeLayers, weatherData, cityName, trackForecastView]);

  // Memoize timeline calculations and current time index - OPTIMIZED
  const timelineData = useMemo(() => {
    if (!forecastData.length) return null;
    const tz = cityCoordinates ? tzLookup(cityCoordinates.lat, cityCoordinates.lng) : 'America/Denver';
    const tzShort = new Date().toLocaleTimeString('en-US', {
      timeZone: tz,
      timeZoneName: 'short'
    }).split(' ').pop() || 'local';
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
    const formatLocal = (d: Date) => d.toLocaleString('en-US', {
      hour: 'numeric',
      hour12: true,
      timeZone: tz
    });
    const formatDate = (d: Date) => d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: tz
    });
    const total = forecastData.length;
    const tickIndices = [0, Math.min(12, total - 1), Math.min(24, total - 1), Math.min(36, total - 1), Math.max(0, total - 1)];

    // Find current time index for highlighting - STABLE calculation
    let currentTimeIndex = -1;
    if (selectedTime) {
      // Only recalculate if selectedTime actually changed
      const timeChanged = !lastSelectedTimeRef.current || lastSelectedTimeRef.current.getTime() !== selectedTime.getTime();
      if (timeChanged) {
        lastSelectedTimeRef.current = selectedTime;

        // First try exact timestamp match
        currentTimeIndex = forecastData.findIndex(f => f.timestamp.getTime() === selectedTime.getTime());

        // If no exact match, find closest within 30 minutes
        if (currentTimeIndex === -1) {
          let closestDiff = Infinity;
          forecastData.forEach((f, i) => {
            const diff = Math.abs(f.timestamp.getTime() - selectedTime.getTime());
            if (diff < closestDiff && diff < 30 * 60 * 1000) {
              // Within 30 minutes
              closestDiff = diff;
              currentTimeIndex = i;
            }
          });
        }
      }
    }

    // Generate date labels - now iterates over all forecastData
    const dateLabels: Array<{
      index: number;
      date: string;
    }> = [];
    let lastDate = '';
    forecastData.forEach((f, idx) => {
      const currentDate = formatDate(f.timestamp);
      if (currentDate !== lastDate) {
        dateLabels.push({
          index: idx,
          date: currentDate
        });
        lastDate = currentDate;
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
      case 1:
        return 'bg-green-500';
      case 2:
        return 'bg-yellow-500';
      case 3:
        return 'bg-orange-500';
      case 4:
        return 'bg-red-500';
      case 5:
        return 'bg-purple-500';
      default:
        return 'bg-gray-300';
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
    return <Card className={`${compact ? 'p-2' : 'p-3'} bg-background/95 backdrop-blur-sm shadow-lg max-w-2xl`}>
        <div className="flex items-center justify-between mb-2">
          <h3 className={`${compact ? 'text-xs' : 'text-sm'} font-semibold text-foreground whitespace-nowrap`}>
            {cityName} • 48h Smoke Forecast
          </h3>
          <Button variant="ghost" size="sm" onClick={refetch} disabled={smokeLoading} className="h-6 w-6 p-0" aria-label="Refresh city forecast">
            <RefreshCw className={`h-3 w-3 ${smokeLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <div className="text-[11px] text-muted-foreground">
          {smokeLoading ? 'Loading forecast…' : 'No smoke forecast data for this location yet.'}
        </div>
      </Card>;
  }
  const {
    tz,
    tzShort,
    concentrationToCategory,
    categoryClass,
    formatLocal,
    total,
    tickIndices,
    currentTimeIndex,
    dateLabels
  } = timelineData;
  return <Card className={`${compact ? 'p-1.5' : 'p-2'} bg-background/95 backdrop-blur-sm shadow-lg w-full flex flex-col min-h-0`} style={{
    height: '100%'
  }}>
      <div className="flex items-center justify-between mb-1 flex-shrink-0 py-0 my-0">
        <h3 className={`${compact ? 'text-xs' : 'text-xs'} font-semibold text-foreground truncate flex-1 min-w-0`}>
          {cityName} • 48h Forecast <span className="text-[9px] text-muted-foreground">({tzShort})</span>
        </h3>
        <Button variant="ghost" size="sm" onClick={refetch} disabled={smokeLoading || weatherLoading} className="h-6 w-6 p-0 flex-shrink-0" aria-label="Refresh city forecast">
          <RefreshCw className={`h-3 w-3 ${smokeLoading || weatherLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Combined scrolling container for forecast and date/time labels */}
      <div className="overflow-x-auto overflow-y-visible flex-1 min-h-0 pb-8 py-[6px]"> {/* Added bottom padding for scrollbar */}
        <div className="flex flex-col min-w-max h-full justify-between py-0">
          {/* 48-hour single-line timeline with enhanced tooltips */}
          <div className="flex items-center space-x-0.5 flex-1 justify-center relative">
            {forecastData.map((f, i) => {
            const category = concentrationToCategory(f.concentration);
            const colorClass = categoryClass[category] || 'bg-muted';
            const airQualityDesc = getAirQualityDescription(f.concentration);
            const isCurrentTime = i === currentTimeIndex;

            // Check if this is midnight (start of new day) for tick marks
            const isMidnight = f.timestamp.getHours() === 0;
            return <div key={`forecast-${i}`} className="flex flex-col items-center flex-shrink-0 relative" // Added relative for positioning
            >
                  {/* Midnight separator tick */}
                  {isMidnight && i > 0 && <div className="absolute left-[-2px] top-0 bottom-0 w-0.5 bg-border/60 z-10" />}
                  
                  {f.weatherCode !== undefined && <WeatherIcon code={f.weatherCode} />}
                  <div className={`${colorClass} h-3 sm:h-4 w-2 sm:w-2.5 rounded flex-shrink-0 cursor-pointer transition-all hover:scale-110 hover:z-10 relative group ${isCurrentTime ? 'ring-2 ring-black ring-inset' : ''}`} title={`${f.timestamp.toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                hour12: true,
                timeZone: tz
              })} • ${f.concentration.toFixed(1)} μg/m³ • ${airQualityDesc}`}>
                    <Info className="h-2 w-2 text-white/70 absolute top-0 left-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                  </div>
                  {f.temperature !== undefined && <span className="text-[10px]">{f.temperature.toFixed(0)}°</span>}
                </div>;
          })}
          </div>

          {/* Combined date and time labels at bottom with visual ticks */}
          <div className="flex text-muted-foreground whitespace-nowrap flex-shrink-0 relative mt-2 rounded-none py-0 my-[4px]">
            {forecastData.map((f, i) => {
            const dateLabel = dateLabels.find(label => label.index === i);
            const timeLabel = tickIndices.includes(i) ? formatLocal(f.timestamp) : '';
            const isMidnight = f.timestamp.getHours() === 0;
            return <div key={`datetime-${i}`} className="flex-shrink-0 w-[14px] text-center flex flex-col justify-end relative py-0">
                  {/* Midnight separator line extending up */}
                  {isMidnight && i > 0 && <div className="absolute left-[-2px] bottom-0 top-[-8px] w-0.5 bg-border/40" />}
                  
                  {/* Small tick mark for time alignment */}
                  {timeLabel && <div className="absolute left-1/2 transform -translate-x-1/2 bottom-[28px] w-0.5 h-2 bg-muted-foreground/30" />}
                  
                  {/* Date label on top line (only when there's a date change) */}
                  {dateLabel && <div className="text-[10px] font-medium leading-tight text-muted-foreground/90 mb-1">
                      {dateLabel.date}
                    </div>}
                  
                  {/* Time label on bottom line (at tick marks) */}
                  {timeLabel && <div className="text-[11px] leading-tight font-medium">
                      {timeLabel}
                    </div>}
                </div>;
          })}
          </div>
        </div>
      </div>
    </Card>;
};