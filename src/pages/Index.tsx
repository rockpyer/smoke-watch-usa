
import React, { useState, useEffect, Suspense } from 'react';
import TimeControls from '@/components/TimeControls';
import { ForecastSkeleton, MapSkeleton } from '@/components/LoadingSkeleton';
import { useSmokeData } from '@/hooks/useSmokeDataOptimized';
import { Cloud } from 'lucide-react';
import tzLookup from 'tz-lookup';

// Import lazy components
import { SmokeMap, LocationInfo, SmokeLegend, CityForecast } from '@/components/LazyComponents';

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
  
  const { smokeLayers, currentLayer, isLoading } = useSmokeData(selectedTime);

  useEffect(() => {
    if (searchedCity) return;

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
          setSearchedCity({
            coordinates: { lat: 40.0150, lng: -105.2705 },
            name: 'Boulder, CO'
          });
        },
        { timeout: 5000, enableHighAccuracy: false }
      );
    } else {
      console.log('🌍 Geolocation not supported, using Boulder, CO default');
      setSearchedCity({
        coordinates: { lat: 40.0150, lng: -105.2705 },
        name: 'Boulder, CO'
      });
    }
  }, [searchedCity]);

  const cityTimeZone = searchedCity ? tzLookup(searchedCity.coordinates.lat, searchedCity.coordinates.lng) : undefined;
  
  useEffect(() => {
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
  const cityTimeZone = searchedCity ? tzLookup(searchedCity.coordinates.lat, searchedCity.coordinates.lng) : undefined;

  return (
    <div className="min-h-screen bg-sky-gradient">
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
            
            <div className="hidden md:block w-full md:w-auto mt-2 md:mt-0 min-h-[80px] max-w-2xl">
              <Suspense fallback={<ForecastSkeleton />}>
                {searchedCity && !isLoading ? (
                  <CityForecast 
                    cityCoordinates={searchedCity?.coordinates}
                    cityName={searchedCity?.name}
                    selectedTime={selectedTime}
                  />
                ) : (
                  <ForecastSkeleton />
                )}
              </Suspense>
            </div>
          </div>

          <div className="block md:hidden mt-2 space-y-2 min-h-[140px]">
            <Suspense fallback={<ForecastSkeleton compact />}>
              {searchedCity && !isLoading ? (
                <CityForecast 
                  cityCoordinates={searchedCity?.coordinates}
                  cityName={searchedCity?.name}
                  selectedTime={selectedTime}
                  compact
                />
              ) : (
                <ForecastSkeleton compact />
              )}
            </Suspense>
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

      <div className="relative z-10 h-[calc(100vh-88px)] pb-16 md:pb-0">
        <div className="grid grid-cols-1 md:grid-cols-4 h-full gap-4 p-4">
          <div className="md:col-span-3 relative min-h-[400px] h-full">
            <Suspense fallback={<MapSkeleton />}>
              {!isLoading && smokeLayers.length > 0 ? (
                <SmokeMap 
                  onLocationSelect={handleLocationSelect}
                  onCitySearch={handleCitySearch}
                  selectedTime={selectedTime}
                  currentLayer={currentLayer}
                />
              ) : (
                <MapSkeleton />
              )}
            </Suspense>
          </div>

          <div className="hidden md:block md:col-span-1 space-y-4 overflow-y-auto h-full">
            <TimeControls 
              onTimeChange={handleTimeChange}
              autoPlay={false}
              availableTimes={smokeLayers.map(layer => layer.timestamp)}
              timeZone={cityTimeZone}
            />

            <Suspense fallback={<div className="h-32 bg-muted animate-pulse rounded-lg" />}>
              <LocationInfo 
                coordinates={selectedLocation?.coordinates}
                locationName={selectedLocation?.name}
                selectedTime={selectedTime}
                smokeData={selectedLocation?.smokeData}
              />
            </Suspense>

            <Suspense fallback={<div className="h-24 bg-muted animate-pulse rounded-lg" />}>
              <SmokeLegend />
            </Suspense>
          </div>
        </div>
      </div>

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
