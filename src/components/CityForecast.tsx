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
}

export const CityForecast: React.FC<CityForecastProps> = ({
  cityCoordinates,
  cityName
}) => {
  const { smokeLayers, refetch, isLoading } = useSmokeData();
  const [forecastData, setForecastData] = useState<ForecastData[]>([]);

  useEffect(() => {
    console.log('🌆 CityForecast: useEffect triggered', { cityCoordinates, smokeLayers: smokeLayers.length });
    
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
        smokeDescription: citySmoke?.smoke_classdesc || 'No Smoke'
      });
    });
    
    setForecastData(forecast.slice(0, 8)); // Show next 8 time periods
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

  // Group forecast by date for display
  const groupedForecast = forecastData.reduce((groups, forecast) => {
    const date = forecast.timestamp.toLocaleDateString();
    if (!groups[date]) groups[date] = [];
    groups[date].push(forecast);
    return groups;
  }, {} as Record<string, ForecastData[]>);

  return (
    <Card className="p-3 bg-white/95 backdrop-blur-sm shadow-lg max-w-md">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-base font-semibold">{cityName} Smoke Forecast</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={refetch}
          disabled={isLoading}
          className="h-6 w-6 p-0"
        >
          <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>
      
      {Object.keys(groupedForecast).length > 0 ? (
        <div className="space-y-3">
          {Object.entries(groupedForecast).slice(0, 2).map(([date, dayForecasts]) => (
            <div key={date} className="space-y-1">
              {/* Date header */}
              <div className="text-xs font-medium text-gray-600 text-center border-b pb-1">
                {date}
              </div>
              
              {/* Horizontal timeline */}
              <div className="flex justify-between items-end gap-1">
                {dayForecasts.slice(0, 8).map((forecast, index) => (
                  <div key={index} className="flex flex-col items-center text-xs">
                    {/* Smoke level indicator bar */}
                    <div 
                      className={`w-4 rounded-t-sm ${getSmokeColor(forecast.smokeLevel)} border border-gray-200`}
                      style={{ 
                        height: `${Math.max(8, forecast.smokeLevel * 8)}px`,
                        minHeight: '8px'
                      }}
                      title={forecast.smokeDescription}
                    />
                    
                    {/* Time label */}
                    <span className="text-gray-500 mt-1 text-[10px]">
                      {forecast.timestamp.toLocaleTimeString([], { 
                        hour: 'numeric',
                        hour12: true 
                      })}
                    </span>
                  </div>
                ))}
              </div>
              
              {/* Legend for the day */}
              <div className="flex justify-center text-[10px] text-gray-500">
                Smoke Level (1-5)
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-gray-500 text-xs text-center">No smoke forecast data available for this location.</p>
      )}
    </Card>
  );
};