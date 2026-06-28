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
    label: 'Hazy',
    color: 'bg-blue-300',
    description: 'Some smoke detected aloft or at surface. Often noticeable but limited impact.',
    concentration: '1-12 μg/m³'
  },
  {
    level: 'moderate',
    label: 'Moderate Smoke',
    color: 'bg-yellow-500',
    description: 'Sensitive groups may feel effects. Most people are fine outside.',
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

interface SmokeLegendProps { edgeless?: boolean }
const SmokeLegend: React.FC<SmokeLegendProps> = ({ edgeless = false }) => {
  const Wrap: React.FC<{ children: React.ReactNode }> = ({ children }) =>
    edgeless ? <div className="bg-transparent">{children}</div> : <Card className="bg-background/95 backdrop-blur-sm border shadow-lg">{children}</Card>;
  return (
    <Wrap>
      <div className="px-3 py-2">
        <h3 className="font-semibold text-sm mb-2 text-foreground">
          Smoke PM2.5 (forecast)
        </h3>
        <div className="space-y-1.5">
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
                <p className="text-xs text-muted-foreground leading-snug">
                  {level.description}
                </p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 pt-2 border-t border-border">
          <p className="text-xs text-muted-foreground">
            Forecast wildfire smoke PM2.5 from the NOAA HRRR-Smoke model. This is not a full AQI — ozone, dust, and local sources are not included, so actual air may be worse than shown.
          </p>
          <p className="text-xs text-foreground/70 mt-1">
            Developed by <a href="https://ryweller.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Ryan Weller</a>
          </p>
        </div>
      </div>
    </Wrap>
  );
};

export default SmokeLegend;
