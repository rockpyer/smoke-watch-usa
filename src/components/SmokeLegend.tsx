import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface SmokeLevel {
  level: string;
  label: string;
  color: string;
  description: string;
  aqi: string;
}

const smokeLevels: SmokeLevel[] = [
  {
    level: 'good',
    label: 'Good',
    color: 'bg-smoke-good',
    description: 'Little to no smoke. Safe for all activities.',
    aqi: '0-50'
  },
  {
    level: 'moderate',
    label: 'Moderate',
    color: 'bg-smoke-moderate',
    description: 'Light smoke. Most people can continue outdoor activities.',
    aqi: '51-100'
  },
  {
    level: 'unhealthy-sensitive',
    label: 'Unhealthy for Sensitive Groups',
    color: 'bg-smoke-unhealthy-sensitive',
    description: 'Sensitive individuals should limit outdoor activities.',
    aqi: '101-150'
  },
  {
    level: 'unhealthy',
    label: 'Unhealthy',
    color: 'bg-smoke-unhealthy',
    description: 'Everyone should limit outdoor activities.',
    aqi: '151-200'
  },
  {
    level: 'very-unhealthy',
    label: 'Very Unhealthy',
    color: 'bg-smoke-very-unhealthy',
    description: 'Avoid outdoor activities. Stay indoors.',
    aqi: '201-300'
  },
  {
    level: 'hazardous',
    label: 'Hazardous',
    color: 'bg-smoke-hazardous',
    description: 'Health emergency. Avoid all outdoor activities.',
    aqi: '301+'
  }
];

const SmokeLegend: React.FC = () => {
  return (
    <Card className="bg-background/95 backdrop-blur-sm border shadow-lg">
      <div className="p-4">
        <h3 className="font-semibold text-sm mb-3 text-foreground">
          Smoke Air Quality Index
        </h3>
        
        <div className="space-y-2">
          {smokeLevels.map((level) => (
            <div key={level.level} className="flex items-center space-x-3">
              <div className={`w-4 h-4 rounded ${level.color} flex-shrink-0`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium text-foreground">
                    {level.label}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {level.aqi}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-tight">
                  {level.description}
                </p>
              </div>
            </div>
          ))}
        </div>
        
        <div className="mt-4 pt-3 border-t border-border">
          <p className="text-xs text-muted-foreground">
            Based on EPA Air Quality Index standards. Data from NOAA HRRR-Smoke model.
          </p>
        </div>
      </div>
    </Card>
  );
};

export default SmokeLegend;