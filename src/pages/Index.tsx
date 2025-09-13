import React, { useState, useEffect } from 'react';
import SmokeMap from '@/components/SmokeMap';
import TimeControls from '@/components/TimeControls';
import SmokeLegend from '@/components/SmokeLegend';
import LocationInfo from '@/components/LocationInfo';
import { CityForecast } from '@/components/CityForecast';
import { ForecastSkeleton, MapSkeleton } from '@/components/LoadingSkeleton';
import { useSmokeData } from '@/hooks/useSmokeDataOptimized';
import { useAnalytics } from '@/hooks/useAnalytics';
import { getSmokeDataForLocation } from '@/utils/aqi';
import { Cloud } from 'lucide-react';
import tzLookup from 'tz-lookup';

const Index = () => {
  // The useSmokeData hook is now the single source of truth for the current time.
  // We pass a function to it so it can update its internal state.
  const { smokeLayers, currentLayer, currentLayerIndex, isLoading, setTime } = useSmokeData();
  const { trackPageLoad, trackTimeChange } = useAnalytics();
  const smokeData = { frames: smokeLayers };

  console.log('Index component mounted/rendered');
  const [selectedLocation, setSelectedLocation] = useState<{
    coordinates: [number, number];
    name: string;
    smokeData?: any;
  } | null>(null);
  const [searchedCity, setSearchedCity] = useState<{
    coordinates: { lat: number; lng: number };
    name: string;
  } | null>(null);

  // ...existing code...
  const handleTimeChange = (time: Date, index: number, interactionType?: string) => {
    console.log(`🕐 INDEX: Time changed to ${time.toISOString()} (index ${index})`);
    
    // Track time change event
    if (currentLayer?.timestamp) {
      trackTimeChange(currentLayer.timestamp, time, interactionType || 'unknown');
    }
    
    setTime(time); // Tell the hook to change the time
  };

  useEffect(() => {
    if (selectedLocation) {
      const smokeProperties = getSmokeDataForLocation({ lat: selectedLocation.coordinates[1], lng: selectedLocation.coordinates[0] }, smokeData, currentLayerIndex);
      setSelectedLocation({ ...selectedLocation, smokeData: smokeProperties });
    }
  }, [currentLayerIndex]);

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
          
          // Track page load with user location
          trackPageLoad(latitude, longitude);
        },
        (error) => {
          console.log('🌍 Geolocation failed, using Boulder, CO default:', error);
          setSearchedCity({
            coordinates: { lat: 40.0150, lng: -105.2705 },
            name: 'Boulder, CO'
          });
          
          // Track page load with default location
          trackPageLoad(40.0150, -105.2705);
        },
        { timeout: 5000, enableHighAccuracy: false }
      );
    } else {
      console.log('🌍 Geolocation not supported, using Boulder, CO default');
      setSearchedCity({
        coordinates: { lat: 40.0150, lng: -105.2705 },
        name: 'Boulder, CO'
      });
      
      // Track page load with default location
      trackPageLoad(40.0150, -105.2705);
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
  
  console.log('🏠 INDEX DEBUG:');
  console.log(`  currentLayer:`, currentLayer);
  console.log(`  currentLayer time: ${currentLayer?.timestamp?.toISOString() || 'undefined'}`);
  console.log(`  currentLayer data length: ${currentLayer?.data?.length || 0}`);
  console.log(`  currentLayerIndex: ${currentLayerIndex}`);
  console.log(`  smokeLayers count: ${smokeLayers.length}`);;

  const handleLocationSelect = (coordinates: [number, number], locationName: string, smokeData?: any) => {
    setSelectedLocation({ coordinates, name: locationName, smokeData });
    setSearchedCity({ coordinates: { lat: coordinates[1], lng: coordinates[0] }, name: locationName });
  };

  const handleCitySearch = (coordinates: { lat: number; lng: number }, cityName: string) => {
    const smokeProperties = getSmokeDataForLocation({ lat: coordinates.lat, lng: coordinates.lng }, smokeData, currentLayerIndex);
    setSearchedCity({ coordinates, name: cityName });
    setSelectedLocation({ coordinates: [coordinates.lng, coordinates.lat], name: cityName, smokeData: smokeProperties });
  };

  console.log('🚀 INDEX: Component rendering...');

  // Only render SmokeMap when selectedTime and currentLayer are both set
  const isDataReady = !isLoading && smokeLayers.length > 0 && currentLayer !== undefined && currentLayer.timestamp !== undefined;

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
            
            <div className="hidden md:block w-full md:w-auto mt-2 md:mt-0 min-h-[80px]">
              {searchedCity && isDataReady ? (
                <CityForecast 
                  cityCoordinates={searchedCity?.coordinates}
                  cityName={searchedCity?.name}
                  selectedTime={currentLayer?.timestamp}
                />
              ) : (
                <ForecastSkeleton />
              )}
            </div>
          </div>

          <div className="block md:hidden mt-2 space-y-2 min-h-[120px]">
            {searchedCity && isDataReady ? (
              <CityForecast 
                cityCoordinates={searchedCity?.coordinates}
                cityName={searchedCity?.name}
                selectedTime={currentLayer?.timestamp}
                compact
              />
            ) : (
              <ForecastSkeleton compact />
            )}
            <TimeControls 
              currentIndex={currentLayerIndex}
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
          <div className="md:col-span-3 relative min-h-[400px]">
            {isDataReady ? (
              <SmokeMap 
                onLocationSelect={handleLocationSelect}
                onCitySearch={handleCitySearch}
                selectedTime={currentLayer.timestamp}
                currentLayer={currentLayer}
              />
            ) : (
              <MapSkeleton />
            )}
          </div>

          <div className="hidden md:block md:col-span-1 space-y-4 overflow-y-auto">
            <TimeControls 
              currentIndex={currentLayerIndex}
              onTimeChange={handleTimeChange}
              autoPlay={false}
              availableTimes={smokeLayers.map(layer => layer.timestamp)}
              timeZone={cityTimeZone}
            />

            <LocationInfo 
              coordinates={selectedLocation?.coordinates}
              locationName={selectedLocation?.name}
              selectedTime={currentLayer?.timestamp}
              smokeData={selectedLocation?.smokeData}
            />

            <SmokeLegend />
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