import React, { useState, useEffect, useMemo } from 'react';
import SmokeMap from '@/components/SmokeMap';
import TimeControls from '@/components/TimeControls';
import SmokeLegend from '@/components/SmokeLegend';
import LocationInfo from '@/components/LocationInfo';
import { CityForecast } from '@/components/CityForecastOptimized';
import { ForecastSkeleton, MapSkeleton } from '@/components/LoadingSkeleton';
import { useSmokeData } from '@/hooks/useSmokeDataOptimized';
import { Cloud } from 'lucide-react';
import tzLookup from 'tz-lookup';

const Index = () => {
  const [selectedLocation, setSelectedLocation] = useState<{
    coordinates: [number, number];
    name: string;
    smokeData?: any;
  } | null>(null);

  const [searchedCity, setSearchedCity] = useState<{
    coordinates: { lat: number; lng: number };
    name: string;
  } | null>(null);

  // UI selected time
  const [selectedTime, setSelectedTime] = useState<Date | undefined>(undefined);

  // Hook loads smokeLayers and supplies initialSelectedTime
  const { smokeLayers, currentLayer, currentLayerIndex, isLoading, initialSelectedTime } = useSmokeData(selectedTime);

  // When hook decides the initialSelectedTime, set selectedTime once
  useEffect(() => {
    if (initialSelectedTime && selectedTime === undefined) {
      console.log('🚀 INDEX: Setting selectedTime from hook initialSelectedTime:', initialSelectedTime.toISOString());
      setSelectedTime(initialSelectedTime);
    }
  }, [initialSelectedTime, selectedTime]);

  const handleTimeChange = (time: Date, index: number) => {
    console.log(`🕐 INDEX: Time changed to ${time.toISOString()} (index ${index})`);
    setSelectedTime(time);
  };

  // Geolocation once
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

  // SEO meta
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

  console.log(`🏠 INDEX: currentLayer time: ${currentLayer?.timestamp?.toISOString() || 'undefined'}`);
  console.log(`🏠 INDEX: currentLayerIndex: ${currentLayerIndex}`);
  console.log(`🏠 INDEX: smokeLayers count: ${smokeLayers.length}`);
  console.log(`🏠 INDEX: selectedTime: ${selectedTime?.toISOString() || 'undefined'}`);
  console.log(`🏠 INDEX: initialSelectedTime: ${initialSelectedTime?.toISOString() || 'undefined'}`);

  const handleLocationSelect = (coordinates: [number, number], locationName: string, smokeData?: any) => {
    setSelectedLocation({ coordinates, name: locationName, smokeData });
    setSearchedCity({ coordinates: { lat: coordinates[1], lng: coordinates[0] }, name: locationName });
  };

  const handleCitySearch = (coordinates: { lat: number; lng: number }, cityName: string) => {
    setSearchedCity({ coordinates, name: cityName });
  };

  console.log('🚀 INDEX: Component rendering...');

  // Derive the layer we want to show. Priority:
  // 1) If selectedTime exists find exact or closest layer
  // 2) Otherwise fall back to the hook provided currentLayer
  const selectedLayer = useMemo(() => {
    if (selectedTime && smokeLayers.length > 0) {
      // exact
      const exact = smokeLayers.find(l => l.timestamp.getTime() === selectedTime.getTime());
      if (exact) return exact;

      // closest
      let bestIndex = 0;
      let bestDiff = Math.abs(smokeLayers[0].timestamp.getTime() - selectedTime.getTime());
      for (let i = 1; i < smokeLayers.length; i++) {
        const diff = Math.abs(smokeLayers[i].timestamp.getTime() - selectedTime.getTime());
        if (diff < bestDiff) {
          bestDiff = diff;
          bestIndex = i;
        }
      }
      return smokeLayers[bestIndex];
    }

    return currentLayer || null;
  }, [smokeLayers, selectedTime, currentLayer]);

  // Keep showing forecast and controls only when full data is ready
  const isDataReady = !isLoading && smokeLayers.length > 0 && selectedLayer !== null;

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
                  selectedTime={selectedLayer?.timestamp ?? selectedTime}
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
                selectedTime={selectedLayer?.timestamp ?? selectedTime}
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
          {/* Always mount the map so Mapbox can initialize its instance and tiles */}
          <div className="md:col-span-3 relative min-h-[400px]">
            <SmokeMap
              onLocationSelect={handleLocationSelect}
              onCitySearch={handleCitySearch}
              // selectedTime passed for context; currentLayer is the explicit layer to render
              selectedTime={selectedLayer?.timestamp ?? selectedTime}
              currentLayer={selectedLayer}
            />
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
              selectedTime={selectedLayer?.timestamp ?? selectedTime}
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