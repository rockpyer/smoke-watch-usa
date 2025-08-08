import React, { useState, useEffect } from 'react';
import SmokeMap from '@/components/SmokeMap';
import TimeControls from '@/components/TimeControls';
import SmokeLegend from '@/components/SmokeLegend';
import LocationInfo from '@/components/LocationInfo';
import { CityForecast } from '@/components/CityForecast';
import { useSmokeData } from '@/hooks/useSmokeData';
import { Cloud } from 'lucide-react';
import tzLookup from 'tz-lookup';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerTrigger } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';

const Index = () => {
  const [selectedLocation, setSelectedLocation] = useState<{
    coordinates: [number, number];
    name: string;
    smokeData?: any;
  } | null>(null);
  const [selectedTime, setSelectedTime] = useState<Date | undefined>();
  const [searchedCity, setSearchedCity] = useState<{
    coordinates: { lat: number; lng: number };
    name: string;
  } | null>(null);
  
  const { smokeLayers, currentLayer } = useSmokeData(selectedTime);
  
  const isMobile = useIsMobile();

  const cityTimeZone = searchedCity ? tzLookup(searchedCity.coordinates.lat, searchedCity.coordinates.lng) : undefined;
  
  useEffect(() => {
    // SEO basics
    document.title = 'North American Smoke Map – Real-time Forecast';
    const desc = 'Real-time NOAA HRRR smoke forecast with wildfire perimeters and air quality.';
    let meta = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'description');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', desc);
    let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.setAttribute('rel', 'canonical');
      document.head.appendChild(link);
    }
    link.setAttribute('href', window.location.href);
  }, []);
  
  console.log(`🏠 INDEX: selectedTime: ${selectedTime?.toISOString() || 'undefined'}`);
  console.log(`🏠 INDEX: currentLayer time: ${currentLayer?.timestamp.toISOString() || 'undefined'}`);
  console.log(`🏠 INDEX: smokeLayers count: ${smokeLayers.length}`);

  const handleLocationSelect = (coordinates: [number, number], locationName: string, smokeData?: any) => {
    setSelectedLocation({ coordinates, name: locationName, smokeData });
    setSearchedCity({ coordinates: { lat: coordinates[1], lng: coordinates[0] }, name: locationName });
  };

  const handleCitySearch = (coordinates: { lat: number; lng: number }, cityName: string) => {
    setSearchedCity({ coordinates, name: cityName });
  };

  const handleTimeChange = (time: Date, index: number) => {
    console.log(`🏠 INDEX: handleTimeChange called with time: ${time.toISOString()}, index: ${index}`);
    setSelectedTime(time);
    console.log(`🏠 INDEX: selectedTime state updated to: ${time.toISOString()}`);
  };

  console.log('🚀 INDEX: Component rendering...');

  return (
    <div className="min-h-screen bg-sky-gradient">
      {/* Header */}
      <header className="relative z-20 bg-background/95 backdrop-blur-sm border-b border-border shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Cloud className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-2xl font-bold text-foreground">North American Smoke Map</h1>
                <p className="text-sm text-muted-foreground">Real-time wildfire smoke and air quality forecasting</p>
              </div>
            </div>
            
            {/* City Forecast */}
            <div className="hidden md:block w-full md:w-auto mt-2 md:mt-0">
              <CityForecast 
                cityCoordinates={searchedCity?.coordinates}
                cityName={searchedCity?.name}
              />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="relative z-10 h-[calc(100vh-88px)]">
        <div className="grid grid-cols-1 md:grid-cols-4 h-full gap-4 p-4">
          {/* Map Area */}
          <div className="md:col-span-3 relative">
            <SmokeMap 
              onLocationSelect={handleLocationSelect}
              onCitySearch={handleCitySearch}
              selectedTime={selectedTime}
              currentLayer={currentLayer}
            />
          </div>

          {/* Controls Panel */}
          <div className="hidden md:block md:col-span-1 space-y-4 overflow-y-auto">
            {/* Time Controls */}
            <TimeControls 
              onTimeChange={handleTimeChange}
              autoPlay={false}
              availableTimes={smokeLayers.map(layer => layer.timestamp)}
              timeZone={cityTimeZone}
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

        {/* Mobile Drawer Controls */}
        {isMobile && (
          <Drawer>
            <DrawerTrigger asChild>
              <div className="fixed bottom-4 inset-x-0 z-30 flex justify-center">
                <Button variant="default" className="shadow-lg">
                  Open Controls
                </Button>
              </div>
            </DrawerTrigger>
            <DrawerContent>
              <DrawerHeader className="text-center">
                <DrawerTitle>Smoke Forecast Controls</DrawerTitle>
                <DrawerDescription>Timeline, location details, and legend</DrawerDescription>
              </DrawerHeader>
              <div className="p-4 space-y-4">
                <CityForecast 
                  cityCoordinates={searchedCity?.coordinates}
                  cityName={searchedCity?.name}
                  compact
                />
                <TimeControls 
                  onTimeChange={handleTimeChange}
                  autoPlay={false}
                  availableTimes={smokeLayers.map(layer => layer.timestamp)}
                  timeZone={cityTimeZone}
                  compact
                />
                <LocationInfo 
                  coordinates={selectedLocation?.coordinates}
                  locationName={selectedLocation?.name}
                  selectedTime={selectedTime}
                  smokeData={selectedLocation?.smokeData}
                />
                <SmokeLegend />
              </div>
            </DrawerContent>
          </Drawer>
        )}
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
