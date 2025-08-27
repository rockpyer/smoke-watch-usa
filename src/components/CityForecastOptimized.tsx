
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { startTransition } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, Info } from 'lucide-react';
import { useSmokeData } from '@/hooks/useSmokeDataOptimized';
import { GeometryWorker } from '@/utils/geometryWorker';
import { useBackgroundProcessing } from '@/hooks/useBackgroundProcessing';
import tzLookup from 'tz-lookup';

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
}

// Global worker instance to reuse across components
let geometryWorker: GeometryWorker | null = null;

const getGeometryWorker = () => {
  if (!geometryWorker) {
    geometryWorker = new GeometryWorker();
  }
  return geometryWorker;
};

// Enhanced cache with LRU eviction
class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private maxSize: number;

  constructor(maxSize: number = 500) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove least recently used (first item)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  clear(): void {
    this.cache.clear();
  }
}

const polygonCache = new LRUCache<string, boolean>(1000);

export const CityForecast: React.FC<CityForecastProps> = ({
  cityCoordinates,
  cityName,
  compact = false,
  selectedTime
}) => {
  const { smokeLayers, refetch, isLoading } = useSmokeData(selectedTime);
  const [forecastData, setForecastData] = useState<ForecastData[]>([]);
  const { processInBackground, isProcessing } = useBackgroundProcessing();
  
  // Use ref to prevent unnecessary re-renders
  const lastSelectedTimeRef = useRef<Date | null>(null);
  const lastCityCoordinatesRef = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!cityCoordinates || !smokeLayers.length) {
      if (!smokeLayers.length) {
        startTransition(() => setForecastData([]));
      }
      return;
    }

    // Check if coordinates actually changed to prevent unnecessary processing
    const coordsChanged = !lastCityCoordinatesRef.current ||
      lastCityCoordinatesRef.current.lat !== cityCoordinates.lat ||
      lastCityCoordinatesRef.current.lng !== cityCoordinates.lng;

    if (!coordsChanged && forecastData.length > 0) {
      return;
    }

    lastCityCoordinatesRef.current = cityCoordinates;

    console.log(`🏙️ CITY FORECAST: Processing ${smokeLayers.length} smoke layers for ${cityName}`);

    // Process forecast data using background processing - FULL 48 hours
    processInBackground(
      smokeLayers, // Use ALL layers, not just slice(0, 48)
      async (layer) => {
        const worker = getGeometryWorker();
        
        // Prepare polygons for worker (limit to reasonable number)
        const polygons = layer.data.slice(0, 500).map(polygon => ({
          coordinates: polygon.geometry.coordinates[0],
          properties: polygon.properties
        }));

        // Use web worker for point-in-polygon calculation
        const matches = await worker.pointInPolygon(cityCoordinates, polygons);
        
        // Use first match (highest priority smoke data)
        const citySmoke = matches.length > 0 ? matches[0].properties : null;
        
        return {
          timestamp: layer.timestamp,
          smokeLevel: citySmoke?.smoke_class || 0,
          smokeDescription: citySmoke?.smoke_classdesc || 'No Smoke',
          concentration: citySmoke?.concentration_ugm3 || 0
        };
      },
      (results: ForecastData[]) => {
        console.log(`🏙️ CITY FORECAST: Generated forecast with ${results.length} time periods`);
        startTransition(() => {
          setForecastData(results);
        });
      }
    );
  }, [cityCoordinates, smokeLayers, processInBackground, cityName]);

  // Memoize timeline calculations with proper current time index detection
  const timelineData = useMemo(() => {
    if (!forecastData.length) return null;

    // Cache expensive timezone operations
    const tz = cityCoordinates ? tzLookup(cityCoordinates.lat, cityCoordinates.lng) : 'America/Denver';
    const tzShort = new Date().toLocaleTimeString('en-US', { timeZone: tz, timeZoneName: 'short' }).split(' ').pop() || 'local';
    
    // Pre-compute category mappings
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
      none: 'bg-green-200',
      light: 'bg-yellow-300', 
      moderate: 'bg-orange-400',
      'unhealthy-sensitive': 'bg-red-400',
      unhealthy: 'bg-red-600',
      'very-unhealthy': 'bg-purple-600',
      hazardous: 'bg-purple-800'
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

    // Fix current time index calculation
    let currentTimeIndex = -1;
    if (selectedTime) {
      console.log(`🕐 CITY FORECAST: Looking for selectedTime: ${selectedTime.toISOString()}`);
      
      // Check if time changed to avoid unnecessary recalculation
      const timeChanged = !lastSelectedTimeRef.current || 
        lastSelectedTimeRef.current.getTime() !== selectedTime.getTime();
      
      if (timeChanged) {
        lastSelectedTimeRef.current = selectedTime;
        
        // Find exact match first
        const exactMatch = forecastData.findIndex(f => 
          Math.abs(f.timestamp.getTime() - selectedTime.getTime()) < 1000 // Within 1 second
        );
        
        if (exactMatch !== -1) {
          currentTimeIndex = exactMatch;
          console.log(`🕐 CITY FORECAST: Found exact match at index ${currentTimeIndex}`);
        } else {
          // Find closest within reasonable range (30 minutes)
          let closestIndex = 0;
          let minDiff = Infinity;
          
          forecastData.forEach((f, i) => {
            const diff = Math.abs(f.timestamp.getTime() - selectedTime.getTime());
            if (diff < minDiff && diff < 30 * 60 * 1000) {
              minDiff = diff;
              closestIndex = i;
            }
          });
          
          if (minDiff < 30 * 60 * 1000) {
            currentTimeIndex = closestIndex;
            console.log(`🕐 CITY FORECAST: Found closest match at index ${currentTimeIndex} (${minDiff/1000}s diff)`);
          }
        }
      }
    }

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
            disabled={isLoading || isProcessing}
            className="h-6 w-6 p-0"
            aria-label="Refresh city forecast"
          >
            <RefreshCw className={`h-3 w-3 ${isLoading || isProcessing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <div className="text-[11px] text-muted-foreground">
          {isLoading || isProcessing ? 'Loading forecast…' : 'No smoke forecast data for this location yet.'}
        </div>
      </Card>
    );
  }

  const { tz, tzShort, concentrationToCategory, categoryClass, formatLocal, total, tickIndices, currentTimeIndex, dateLabels } = timelineData;

  console.log(`🏙️ CITY FORECAST: Rendering ${forecastData.length} forecast periods, currentTimeIndex: ${currentTimeIndex}`);

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
          disabled={isLoading || isProcessing}
          className="h-6 w-6 p-0"
          aria-label="Refresh city forecast"
        >
          <RefreshCw className={`h-3 w-3 ${isLoading || isProcessing ? 'animate-spin' : ''}`} />
        </Button>
      </div>

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

      <div className="flex items-center space-x-0.5 overflow-x-auto py-1">
        {forecastData.map((f, i) => {
          const category = concentrationToCategory(f.concentration);
          const colorClass = categoryClass[category] || 'bg-gray-300';
          const airQualityDesc = getAirQualityDescription(f.concentration);
          const isCurrentTime = i === currentTimeIndex;
          
          return (
            <div
              key={i}
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
          );
        })}
      </div>

      <div className="flex justify-between text-[10px] text-muted-foreground whitespace-nowrap mt-1">
        {tickIndices.map((idx) => (
          <span key={idx}>{forecastData[idx] ? formatLocal(forecastData[idx].timestamp) : ''}</span>
        ))}
      </div>
    </Card>
  );
};
