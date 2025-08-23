
import React, { useState, useEffect } from 'react';
import SmokeMap from '@/components/SmokeMap';
import TimeControls from '@/components/TimeControls';
import SmokeLegend from '@/components/SmokeLegend';
import LocationInfo from '@/components/LocationInfo';
import { CityForecast } from '@/components/CityForecast';
import { useSmokeData } from '@/hooks/useSmokeData';
import { Cloud } from 'lucide-react';
import tzLookup from 'tz-lookup';

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

  // Auto-detect user location or default to Boulder, CO
  useEffect(() => {
    if (searchedCity) return; // Don't override if user has already selected a city

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setSearchedCity({
            coordinates: { lat: latitude, lng: longitude },
            name: 'Your Location'
          });
          console.log('🌍 Using user location:', latitude, longitude);
        },
        (error) => {
          console.log('🌍 Geolocation failed, using Boulder, CO default:', error);
          // Default to Boulder, CO
          setSearchedCity({
            coordinates: { lat: 40.0150, lng: -105.2705 },
            name: 'Boulder, CO'
          });
        },
        { timeout: 5000, enableHighAccuracy: false }
      );
    } else {
      console.log('🌍 Geolocation not supported, using Boulder, CO default');
      // Default to Boulder, CO
      setSearchedCity({
        coordinates: { lat: 40.0150, lng: -105.2705 },
        name: 'Boulder, CO'
      });
    }
  }, [searchedCity]);

  const cityTimeZone = searchedCity ? tzLookup(searchedCity.coordinates.lat, searchedCity.coordinates.lng) : undefined;
  
  useEffect(() => {
    // SEO basics - updated title
    document.title = 'Will smoke affect my biking/hiking/fishing plans? – Real-time Forecast';
    const desc = 'Real-time NOAA HRRR smoke forecast with wildfire locations and air quality.';
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
                <h1 className="text-lg md:text-2xl font-bold text-foreground">Will smoke affect my biking/hiking/fishing plans?</h1>
                <p className="text-xs md:text-sm text-muted-foreground">48 hour wildfire smoke forecasting</p>
              </div>
            </div>
            
            {/* City Forecast (Desktop) */}
            <div className="hidden md:block w-full md:w-auto mt-2 md:mt-0">
              <CityForecast 
                cityCoordinates={searchedCity?.coordinates}
                cityName={searchedCity?.name}
              />
            </div>
          </div>

          {/* Mobile top controls */}
          <div className="block md:hidden mt-2 space-y-2">
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
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="relative z-10 h-[calc(100vh-88px)] pb-16 md:pb-0">
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
            {/* Time Controls - SINGLE INSTANCE */}
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
      </div>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 z-20 bg-background/95 backdrop-blur-sm border-t border-border">
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
