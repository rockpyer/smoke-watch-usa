import React, { useState, useEffect, useMemo, startTransition } from 'react';
import SmokeMapLazy from '@/components/SmokeMapLazy';
import TimeControls from '@/components/TimeControls';
import SmokeLegend from '@/components/SmokeLegend';
import LocationInfo from '@/components/LocationInfo';
import { CityForecast } from '@/components/CityForecast';
import { ForecastSkeleton, MapSkeleton } from '@/components/LoadingSkeleton';
import { useSmokeData } from '@/hooks/useSmokeDataOptimized';
import { useAnalytics } from '@/hooks/useAnalytics';
import { getSmokeDataForLocation } from '@/utils/aqi';
import { Cloud, BarChart3 } from 'lucide-react';
import { Link } from 'react-router-dom';
import tzLookup from 'tz-lookup';
const Index = () => {
  // The useSmokeData hook is now the single source of truth for the current time.
  // We pass a function to it so it can update its internal state.
  const {
    smokeLayers,
    currentLayer,
    currentLayerIndex,
    isLoading,
    setTime
  } = useSmokeData();
  const {
    trackPageLoad,
    trackTimeChange
  } = useAnalytics();
  const smokeData = {
    frames: smokeLayers
  };
  console.log('Index component mounted/rendered');
  const [selectedLocation, setSelectedLocation] = useState<{
    coordinates: [number, number];
    name: string;
    smokeData?: any;
  } | null>(null);
  const [searchedCity, setSearchedCity] = useState<{
    coordinates: {
      lat: number;
      lng: number;
    };
    name: string;
  } | null>(null);

  // ...existing code...
  const handleTimeChange = (time: Date, index: number, interactionType?: string) => {
    console.log(`🕐 INDEX: Time changed to ${time.toISOString()} (index ${index})`);

    // Defer analytics to not block user interaction
    setTimeout(() => {
      if (currentLayer?.timestamp) {
        trackTimeChange(currentLayer.timestamp, time, interactionType || 'unknown');
      }
    }, 100);
    setTime(time); // Tell the hook to change the time
  };
  useEffect(() => {
    if (selectedLocation) {
      const smokeProperties = getSmokeDataForLocation({
        lat: selectedLocation.coordinates[1],
        lng: selectedLocation.coordinates[0]
      }, smokeData, currentLayerIndex);
      setSelectedLocation({
        ...selectedLocation,
        smokeData: smokeProperties
      });
    }
  }, [currentLayerIndex]);
  useEffect(() => {
    if (searchedCity) return;

    // Defer geolocation to not block TTI
    const timer = setTimeout(() => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(position => {
          const {
            latitude,
            longitude
          } = position.coords;
          startTransition(() => {
            setSearchedCity({
              coordinates: {
                lat: latitude,
                lng: longitude
              },
              name: 'Your Location'
            });
          });
          console.log('🌍 Using user location:', latitude, longitude);

          // Defer analytics to not block interactions
          setTimeout(() => trackPageLoad(latitude, longitude), 1000);
        }, error => {
          console.log('🌍 Geolocation failed, using Boulder, CO default:', error);
          startTransition(() => {
            setSearchedCity({
              coordinates: {
                lat: 40.0150,
                lng: -105.2705
              },
              name: 'Boulder, CO'
            });
          });

          // Defer analytics to not block interactions
          setTimeout(() => trackPageLoad(40.0150, -105.2705), 1000);
        }, {
          timeout: 3000,
          enableHighAccuracy: false
        } // Reduced timeout
        );
      } else {
        console.log('🌍 Geolocation not supported, using Boulder, CO default');
        startTransition(() => {
          setSearchedCity({
            coordinates: {
              lat: 40.0150,
              lng: -105.2705
            },
            name: 'Boulder, CO'
          });
        });

        // Defer analytics to not block interactions
        setTimeout(() => trackPageLoad(40.0150, -105.2705), 1000);
      }
    }, 200); // Defer geolocation to allow page to become interactive

    return () => clearTimeout(timer);
  }, [searchedCity]);

  // Memoize timezone calculation to prevent unnecessary recalculations
  const cityTimeZone = useMemo(() => searchedCity ? tzLookup(searchedCity.coordinates.lat, searchedCity.coordinates.lng) : undefined, [searchedCity?.coordinates.lat, searchedCity?.coordinates.lng]);
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
  console.log(`  smokeLayers count: ${smokeLayers.length}`);
  ;

  // Memoize handlers to prevent unnecessary re-renders
  const handleLocationSelect = useMemo(() => (coordinates: [number, number], locationName: string, smokeData?: any) => {
    setSelectedLocation({
      coordinates,
      name: locationName,
      smokeData
    });
    setSearchedCity({
      coordinates: {
        lat: coordinates[1],
        lng: coordinates[0]
      },
      name: locationName
    });
  }, []);
  const handleCitySearch = useMemo(() => (coordinates: {
    lat: number;
    lng: number;
  }, cityName: string) => {
    const smokeProperties = getSmokeDataForLocation({
      lat: coordinates.lat,
      lng: coordinates.lng
    }, smokeData, currentLayerIndex);
    setSearchedCity({
      coordinates,
      name: cityName
    });
    setSelectedLocation({
      coordinates: [coordinates.lng, coordinates.lat],
      name: cityName,
      smokeData: smokeProperties
    });
  }, [smokeData, currentLayerIndex]);
  console.log('🚀 INDEX: Component rendering...');

  // Only render SmokeMap when selectedTime and currentLayer are both set
  const isDataReady = !isLoading && smokeLayers.length > 0 && currentLayer !== undefined && currentLayer.timestamp !== undefined;
  return <div className="min-h-screen bg-sky-gradient">
      <header className="relative z-20 bg-background/95 backdrop-blur-sm border-b border-border shadow-sm">
        <div className="container mx-auto px-4 py-0">
          <div className="flex items-center justify-between gap-4 my-0 py-[20px]">
            <div className="flex items-center space-x-2 flex-shrink-0 max-w-[300px] lg:max-w-[400px]">
              <Cloud className="h-6 w-6 text-primary flex-shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center space-x-2">
                  <h1 className="text-sm lg:text-base font-bold text-foreground truncate">Will smoke affect my plans?</h1>
                  <Link to="/analytics" className="text-xs px-1.5 py-0.5 bg-muted hover:bg-muted/80 rounded transition-colors flex items-center space-x-1 flex-shrink-0">
                    <BarChart3 className="h-3 w-3" />
                    <span className="hidden sm:inline">Analytics</span>
                  </Link>
                </div>
                <p className="text-[10px] lg:text-xs text-muted-foreground truncate">48h wildfire smoke forecasting</p>
              </div>
            </div>
            
            <div className="hidden md:block flex-1 max-w-[600px] h-[120px] overflow-hidden">
              {searchedCity && isDataReady ? <CityForecast cityCoordinates={searchedCity?.coordinates} cityName={searchedCity?.name} selectedTime={currentLayer?.timestamp} compact={true} /> : <ForecastSkeleton />}
            </div>
          </div>

          <div className="block md:hidden mt-2">
            {searchedCity && isDataReady ? <CityForecast cityCoordinates={searchedCity?.coordinates} cityName={searchedCity?.name} selectedTime={currentLayer?.timestamp} compact /> : <ForecastSkeleton compact />}
          </div>
        </div>
      </header>

      {/* Mobile TimeControls Section - Separate from header */}
      <div className="md:hidden bg-background border-b border-border p-2">
        <TimeControls currentIndex={currentLayerIndex} onTimeChange={handleTimeChange} autoPlay={false} availableTimes={smokeLayers.map(layer => layer.timestamp)} timeZone={cityTimeZone} compact />
      </div>

      <div className="relative z-10">
        {/* Mobile: Simple stacked layout */}
        <div className="md:hidden">
          <div className="h-[calc(100vh-280px)] p-2">
            {isDataReady ? <SmokeMapLazy onLocationSelect={handleLocationSelect} onCitySearch={handleCitySearch} selectedTime={currentLayer.timestamp} currentLayer={currentLayer} /> : <div className="w-full h-full flex items-center justify-center bg-muted rounded">
                <MapSkeleton />
              </div>}
          </div>
        </div>
        
        {/* Desktop: Grid layout */}
        <div className="hidden md:grid md:grid-cols-4 md:h-[calc(100vh-88px)] gap-4 p-4">
          <div className="md:col-span-3 relative h-full min-h-[400px]">
            {isDataReady ? <SmokeMapLazy onLocationSelect={handleLocationSelect} onCitySearch={handleCitySearch} selectedTime={currentLayer.timestamp} currentLayer={currentLayer} /> : <div className="absolute inset-0">
                <MapSkeleton />
              </div>}
          </div>

          <div className="hidden md:block md:col-span-1 space-y-4 overflow-y-auto">
            <TimeControls currentIndex={currentLayerIndex} onTimeChange={handleTimeChange} autoPlay={false} availableTimes={smokeLayers.map(layer => layer.timestamp)} timeZone={cityTimeZone} />

            <LocationInfo coordinates={selectedLocation?.coordinates} locationName={selectedLocation?.name} selectedTime={currentLayer?.timestamp} smokeData={selectedLocation?.smokeData} />

            <SmokeLegend />
          </div>
        </div>
      </div>

      {/* Mobile Bottom Section - Only visible on mobile */}
      <div className="md:hidden fixed bottom-16 left-0 right-0 z-20 bg-background/95 backdrop-blur-sm border-t h-20 overflow-y-auto">
        <div className="p-3 space-y-3">
          <LocationInfo coordinates={selectedLocation?.coordinates} locationName={selectedLocation?.name} selectedTime={currentLayer?.timestamp} smokeData={selectedLocation?.smokeData} />
          <SmokeLegend />
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
    </div>;
};
export default Index;