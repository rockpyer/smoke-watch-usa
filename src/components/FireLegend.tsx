
import React from 'react';
import { Card } from '@/components/ui/card';

const FireLegend: React.FC = () => {
  return (
    <Card className="bg-background/95 backdrop-blur-sm border shadow-lg">
      <div className="p-3">
        <h4 className="font-semibold text-sm mb-2 text-foreground">
          Active Fires
        </h4>
        
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-red-500 rounded-full flex-shrink-0" />
          <span className="text-sm text-foreground">
            NOAA Wildfire Incidents
          </span>
        </div>
        
        <p className="text-xs text-muted-foreground mt-2">
          Real-time fire incident locations
        </p>
      </div>
    </Card>
  );
};

export default FireLegend;
