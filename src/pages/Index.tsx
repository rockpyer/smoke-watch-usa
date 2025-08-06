import React, { useState } from 'react';
import SmokeMap from '@/components/SmokeMap';
import TimeControls from '@/components/TimeControls';
import SmokeLegend from '@/components/SmokeLegend';
import LocationInfo from '@/components/LocationInfo';
import { useSmokeData } from '@/hooks/useSmokeData';
import { Cloud } from 'lucide-react';

const Index = () => {
  const [selectedLocation, setSelectedLocation] = useState<{
    coordinates: [number, number];
    name: string;
    smokeData?: any;
  } | null>(null);
  const [selectedTime, setSelectedTime] = useState<Date | undefined>();
  
  const { smokeLayers, currentLayer } = useSmokeData(selectedTime);
  
  console.log(`🏠 INDEX: selectedTime: ${selectedTime?.toISOString() || 'undefined'}`);
  console.log(`🏠 INDEX: currentLayer time: ${currentLayer?.timestamp.toISOString() || 'undefined'}`);
  console.log(`🏠 INDEX: smokeLayers count: ${smokeLayers.length}`);

  const handleLocationSelect = (coordinates: [number, number], locationName: string, smokeData?: any) => {
    setSelectedLocation({ coordinates, name: locationName, smokeData });
  };

  const handleTimeChange = (time: Date, index: number) => {
    console.log(`🏠 INDEX: handleTimeChange called with time: ${time.toISOString()}, index: ${index}`);
    setSelectedTime(time);
    console.log(`🏠 INDEX: selectedTime state updated to: ${time.toISOString()}`);
  };

  return (
    <div className="min-h-screen bg-sky-gradient">
      {/* Header */}
      <header className="relative z-20 bg-background/95 backdrop-blur-sm border-b border-border shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <Cloud className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-2xl font-bold text-foreground">USA Smoke Forecast</h1>
                <p className="text-sm text-muted-foreground">Real-time wildfire smoke and air quality monitoring</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="relative z-10 h-[calc(100vh-88px)]">
        <div className="grid grid-cols-1 lg:grid-cols-4 h-full gap-4 p-4">
          {/* Map Area */}
          <div className="lg:col-span-3 relative">
            <SmokeMap 
              onLocationSelect={handleLocationSelect}
              selectedTime={selectedTime}
              currentLayer={currentLayer}
            />
          </div>

          {/* Controls Panel */}
          <div className="lg:col-span-1 space-y-4 overflow-y-auto">
            {/* Time Controls */}
            <TimeControls 
              onTimeChange={handleTimeChange}
              autoPlay={false}
              availableTimes={smokeLayers.map(layer => layer.timestamp)}
            />

            {/* Location Info */}
            <LocationInfo 
              coordinates={selectedLocation?.coordinates}
              locationName={selectedLocation?.name}
              selectedTime={selectedTime}
              smokeData={selectedLocation?.smokeData}
            />

            {/* Smoke Legend */}
            <SmokeLegend />
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="absolute bottom-0 left-0 right-0 z-20 bg-background/95 backdrop-blur-sm border-t border-border">
        <div className="container mx-auto px-4 py-2">
          <div className="flex flex-col sm:flex-row justify-between items-center text-xs text-muted-foreground">
            <div className="flex items-center space-x-4">
              <span>Data: NOAA HRRR-Smoke</span>
              <span>Updated: Real-time</span>
            </div>
            <div className="mt-1 sm:mt-0">
              <span>For outdoor activity planning and health awareness</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
