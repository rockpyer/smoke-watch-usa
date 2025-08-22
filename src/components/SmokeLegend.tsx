import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface SmokeLevel {
  level: string;
  label: string;
  color: string;
  description: string;
  concentration: string;
}

const smokeLevels: SmokeLevel[] = [
  {
    level: 'good',
    label: 'Good',
    color: 'bg-green-500',
    description: 'Air quality is good. Enjoy outdoor activities!',
    concentration: '0-3 μg/m³'
  },
  {
    level: 'light-smoke',
    label: 'Light Smoke',
    color: 'bg-blue-500',
    description: 'Minimal smoke impact. Air quality is still acceptable.',
    concentration: '3-12 μg/m³'
  },
  {
    level: 'moderate',
    label: 'Moderate',
    color: 'bg-yellow-500',
    description: 'Air quality is acceptable for most people.',
    concentration: '13-35 μg/m³'
  },
  {
    level: 'unhealthy-sensitive',
    label: 'Unhealthy for Sensitive Groups',
    color: 'bg-orange-500',
    description: 'Sensitive individuals should limit outdoor activities.',
    concentration: '36-55 μg/m³'
  },
  {
    level: 'unhealthy',
    label: 'Unhealthy',
    color: 'bg-red-500',
    description: 'Everyone should limit outdoor activities.',
    concentration: '56-150 μg/m³'
  },
  {
    level: 'very-unhealthy',
    label: 'Very Unhealthy',
    color: 'bg-purple-600',
    description: 'Health alert. Avoid outdoor activities.',
    concentration: '151-250 μg/m³'
  },
  {
    level: 'hazardous',
    label: 'Hazardous',
    color: 'bg-red-900',
    description: 'Health emergency. Avoid all outdoor activities.',
    concentration: '251+ μg/m³'
  }
];

const SmokeLegend: React.FC = () => {
  return (
    <Card className="bg-background/95 backdrop-blur-sm border shadow-lg">
      <div className="p-4">
        <h3 className="font-semibold text-sm mb-3 text-foreground">
          EPA Air Quality Index - Smoke
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
                    {level.concentration}
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
            Based on EPA Air Quality Index standards. Real-time data from NOAA HRRR-Smoke model.
          </p>
        </div>
      </div>
    </Card>
  );
};

export default SmokeLegend;
