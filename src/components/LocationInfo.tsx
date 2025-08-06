import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, Wind, Eye, Thermometer } from 'lucide-react';

interface LocationInfoProps {
  coordinates?: [number, number];
  locationName?: string;
  selectedTime?: Date;
}

const LocationInfo: React.FC<LocationInfoProps> = ({ 
  coordinates, 
  locationName, 
  selectedTime 
}) => {
  // Mock data for demonstration - in a real app, this would come from weather APIs
  const getSmokeData = () => {
    if (!coordinates) return null;
    
    // Simulate different smoke conditions based on location
    const mockConditions = [
      { level: 'good', aqi: 42, visibility: '10+ mi', temp: 72 },
      { level: 'moderate', aqi: 76, visibility: '6-10 mi', temp: 68 },
      { level: 'unhealthy-sensitive', aqi: 132, visibility: '3-6 mi', temp: 70 },
      { level: 'unhealthy', aqi: 178, visibility: '1-3 mi', temp: 65 },
    ];
    
    // Simple hash to get consistent results for same coordinates
    const hash = Math.abs(Math.floor(coordinates[0] * coordinates[1] * 1000)) % mockConditions.length;
    return mockConditions[hash];
  };

  const smokeData = getSmokeData();
  
  if (!coordinates || !locationName || !smokeData) {
    return (
      <Card className="bg-background/95 backdrop-blur-sm border shadow-lg">
        <div className="p-4 text-center">
          <MapPin className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            Click on the map or search for a location to view smoke conditions
          </p>
        </div>
      </Card>
    );
  }

  const getSmokeLevel = (aqi: number) => {
    if (aqi <= 50) return { label: 'Good', color: 'bg-smoke-good', textColor: 'text-white' };
    if (aqi <= 100) return { label: 'Moderate', color: 'bg-smoke-moderate', textColor: 'text-black' };
    if (aqi <= 150) return { label: 'Unhealthy for Sensitive Groups', color: 'bg-smoke-unhealthy-sensitive', textColor: 'text-white' };
    if (aqi <= 200) return { label: 'Unhealthy', color: 'bg-smoke-unhealthy', textColor: 'text-white' };
    if (aqi <= 300) return { label: 'Very Unhealthy', color: 'bg-smoke-very-unhealthy', textColor: 'text-white' };
    return { label: 'Hazardous', color: 'bg-smoke-hazardous', textColor: 'text-white' };
  };

  const smokeLevel = getSmokeLevel(smokeData.aqi);

  return (
    <Card className="bg-background/95 backdrop-blur-sm border shadow-lg">
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
              AQI {smokeData.aqi}
            </Badge>
          </div>
          
          <div className={`p-3 rounded-lg ${smokeLevel.color}`}>
            <div className={`text-sm font-semibold ${smokeLevel.textColor}`}>
              {smokeLevel.label}
            </div>
          </div>
        </div>

        {/* Current Conditions */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-foreground">Current Conditions</h4>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center space-x-2">
              <Eye className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="text-xs text-muted-foreground">Visibility</div>
                <div className="text-sm font-medium">{smokeData.visibility}</div>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <Thermometer className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="text-xs text-muted-foreground">Temperature</div>
                <div className="text-sm font-medium">{smokeData.temp}°F</div>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <Wind className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="text-xs text-muted-foreground">Wind</div>
                <div className="text-sm font-medium">SW 8 mph</div>
              </div>
            </div>
          </div>
        </div>

        {/* Health Recommendations */}
        <div className="pt-3 border-t border-border">
          <h4 className="text-sm font-semibold text-foreground mb-2">Recommendations</h4>
          <div className="text-xs text-muted-foreground leading-relaxed">
            {smokeData.aqi <= 50 && "Great conditions for outdoor activities!"}
            {smokeData.aqi > 50 && smokeData.aqi <= 100 && "Good conditions. Sensitive individuals should consider limiting prolonged outdoor activities."}
            {smokeData.aqi > 100 && smokeData.aqi <= 150 && "Sensitive groups should limit outdoor activities. Consider moving activities indoors."}
            {smokeData.aqi > 150 && "Limit outdoor activities. Consider postponing outdoor events."}
          </div>
        </div>
      </div>
    </Card>
  );
};

export default LocationInfo;