import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
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
  const { smokeLayers } = useSmokeData();
  const [forecastData, setForecastData] = useState<ForecastData[]>([]);

  useEffect(() => {
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

  return (
    <Card className="p-4 bg-white/90 backdrop-blur-sm shadow-lg">
      <h3 className="text-lg font-semibold mb-3">{cityName} Smoke Forecast</h3>
      
      <div className="space-y-2">
        {forecastData.map((forecast, index) => (
          <div key={index} className="flex items-center justify-between text-sm">
            <span className="text-gray-600">
              {forecast.timestamp.toLocaleDateString()} {forecast.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${getSmokeColor(forecast.smokeLevel)}`} />
              <span className="text-gray-800 min-w-[80px] text-right">
                {forecast.smokeDescription}
              </span>
            </div>
          </div>
        ))}
      </div>
      
      {forecastData.length === 0 && (
        <p className="text-gray-500 text-sm">No smoke forecast data available for this location.</p>
      )}
    </Card>
  );
};