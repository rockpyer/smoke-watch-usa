
import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin } from 'lucide-react';

interface SmokeData {
  concentration_ugm3: number;
  forecast_hour: string;
  smoke_class: number;
  smoke_classdesc: string;
  todate: string;
}

interface LocationInfoProps {
  coordinates?: [number, number];
  locationName?: string;
  selectedTime?: Date;
  smokeData?: SmokeData;
  edgeless?: boolean;
}

const LocationInfo: React.FC<LocationInfoProps> = ({ 
  coordinates, 
  locationName, 
  selectedTime,
  smokeData,
  edgeless = false
}) => {
  // Convert concentration to AQI (simplified conversion)
  const concentrationToAQI = (concentration: number): number => {
    // Simplified PM2.5 to AQI conversion
    if (concentration <= 12) return Math.round(concentration * 50 / 12);
    if (concentration <= 35.4) return Math.round(50 + (concentration - 12) * 50 / 23.4);
    if (concentration <= 55.4) return Math.round(100 + (concentration - 35.4) * 50 / 20);
    if (concentration <= 150.4) return Math.round(150 + (concentration - 55.4) * 50 / 95);
    if (concentration <= 250.4) return Math.round(200 + (concentration - 150.4) * 100 / 100);
    return Math.round(300 + (concentration - 250.4) * 100 / 249.6);
  };
  
  if (!coordinates || !locationName) {
    return (
      <Wrapper edgeless={edgeless}>
        <div className="p-4 text-center">
          <MapPin className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            Search for a location to view smoke forecast
          </p>
        </div>
      </Wrapper>
    );
  }

  if (!smokeData) {
    return (
      <Wrapper edgeless={edgeless}>
        <div className="p-4 space-y-4">
          <div className="flex items-start space-x-2">
            <MapPin className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm text-foreground truncate">
                {locationName}
              </h3>
              <p className="text-xs text-muted-foreground">
                {coordinates[1].toFixed(4)}°, {coordinates[0].toFixed(4)}°
              </p>
            </div>
          </div>
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground">
              Use the forecast timeline above to see smoke conditions for this location
            </p>
          </div>
        </div>
      </Wrapper>
    );
  }

  const c = smokeData.concentration_ugm3;
  const aqi = concentrationToAQI(c);

  const getSmokeLevel = (c: number) => {
    if (c < 3) return { label: 'No Smoke', color: 'bg-smoke-none', textColor: 'text-white' };
    if (c <= 12) return { label: 'Light Smoke', color: 'bg-smoke-light', textColor: 'text-black' };
    const aqiVal = concentrationToAQI(c);
    if (aqiVal <= 100) return { label: 'Moderate', color: 'bg-smoke-moderate', textColor: 'text-black' };
    if (aqiVal <= 150) return { label: 'Unhealthy for Sensitive Groups', color: 'bg-smoke-unhealthy-sensitive', textColor: 'text-white' };
    if (aqiVal <= 200) return { label: 'Unhealthy', color: 'bg-smoke-unhealthy', textColor: 'text-white' };
    if (aqiVal <= 300) return { label: 'Very Unhealthy', color: 'bg-smoke-very-unhealthy', textColor: 'text-white' };
    return { label: 'Hazardous', color: 'bg-smoke-hazardous', textColor: 'text-white' };
  };

  const smokeLevel = getSmokeLevel(c);

  return (
    <Wrapper edgeless={edgeless}>
      <div className="p-4 space-y-4">
        {/* Location Header */}
        <div className="flex items-start space-x-2">
          <MapPin className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm text-foreground truncate">
              {locationName}
            </h3>
            <p className="text-xs text-muted-foreground">
              {coordinates[1].toFixed(4)}°, {coordinates[0].toFixed(4)}°
            </p>
          </div>
        </div>

        {/* Air Quality Status */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">Air Quality</span>
            <Badge 
              className={`${smokeLevel.color} ${smokeLevel.textColor} border-0`}
            >
              AQI {aqi}
            </Badge>
          </div>
          
          <div className={`p-3 rounded-lg ${smokeLevel.color}`}>
            <div className={`text-sm font-semibold ${smokeLevel.textColor}`}>
              {smokeLevel.label}
            </div>
          </div>
        </div>

        {/* Forecast Details */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-foreground">Forecast Details</h4>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center space-x-2">
              <div className="h-4 w-4 text-muted-foreground">🔥</div>
              <div>
                <div className="text-xs text-muted-foreground">Concentration</div>
                <div className="text-sm font-medium">{smokeData.concentration_ugm3.toFixed(1)} μg/m³</div>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <div className="h-4 w-4 text-muted-foreground">⏰</div>
              <div>
                <div className="text-xs text-muted-foreground">Forecast Time</div>
                <div className="text-sm font-medium">{new Date(smokeData.todate).toLocaleString()}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Health Recommendations */}
        <div className="pt-3 border-t border-border">
          <h4 className="text-sm font-semibold text-foreground mb-2">Recommendations</h4>
          <div className="text-xs text-muted-foreground leading-relaxed">
            {(() => {
              if (c < 3) return "No smoke detected.";
              if (c <= 12) return "Light Smoke — Limited air quality impact.";
              if (aqi <= 100) return "Moderate air quality. Most people can continue normal activities.";
              if (aqi <= 150) return "Sensitive groups should limit outdoor activities. Consider moving activities indoors.";
              return "Limit outdoor activities. Consider postponing outdoor events.";
            })()}
          </div>
        </div>
      </div>
    </Wrapper>
  );
};

const Wrapper: React.FC<{ edgeless: boolean; children: React.ReactNode }> = ({ edgeless, children }) => {
  if (edgeless) {
    return <div className="bg-transparent">{children}</div>;
  }
  return <Card className="bg-background/95 backdrop-blur-sm border shadow-lg">{children}</Card>;
};

export default LocationInfo;
