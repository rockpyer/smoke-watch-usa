import React, { useState, useEffect, useMemo, startTransition } from 'react';
import SmokeMapLazy from '@/components/SmokeMapLazy';
import TimeControls from '@/components/TimeControls';
import SmokeLegend from '@/components/SmokeLegend';
import LocationInfo from '@/components/LocationInfo';
import { CityForecast } from '@/components/CityForecast';
import { ForecastSkeleton, MapSkeleton } from '@/components/LoadingSkeleton';
import { useSmokeData } from '@/hooks/useSmokeDataOptimized';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useIsMobile } from '@/hooks/use-mobile';
import { getSmokeDataForLocation } from '@/utils/aqi';
import { Cloud, Info, ChevronRight, ChevronLeft } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
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
  const isMobile = useIsMobile();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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
    document.title = 'Will smoke affect my outdoor plans? – Real-time Forecast';
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

  // Enhanced data ready check: ensure we have smoke data AND either current layer or at least one layer
  const isDataReady = !isLoading && smokeLayers.length > 0 && (currentLayer !== undefined || smokeLayers.length > 0) && (currentLayer?.timestamp !== undefined || smokeLayers[0]?.timestamp !== undefined);

  const availableTimes = useMemo(() => smokeLayers.map(l => l.timestamp), [smokeLayers]);
  const selectedCityShort = (searchedCity?.name || '').split(',')[0];

  return (
    <div className="fixed inset-0 bg-background overflow-hidden">
      {/* Base map fills the entire viewport */}
      <div className="absolute inset-0">
        {isDataReady ? (
          <SmokeMapLazy
            onLocationSelect={handleLocationSelect}
            onCitySearch={handleCitySearch}
            selectedTime={currentLayer.timestamp}
            currentLayer={currentLayer}
            smokeLayers={smokeLayers}
          />
        ) : (
          <MapSkeleton />
        )}
      </div>

      {/* Overlay layer — pointer-events pass through except on chips */}
      <div className="absolute inset-0 pointer-events-none z-10">
        {/* Top-left wordmark chip */}
        <div className="absolute top-3 left-3 pointer-events-auto flex items-center gap-2 px-2 py-1 rounded-full bg-background/70 backdrop-blur-md drop-shadow-[0_2px_8px_rgba(0,0,0,0.25)]">
          <Cloud className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground leading-none">TrailSmoke</span>
          <span className="hidden md:inline text-xs text-muted-foreground leading-none">· 48h smoke forecast</span>
        </div>

        {/* Top-center CityForecast strip */}
        <div className="absolute top-14 md:top-3 left-1/2 -translate-x-1/2 w-[calc(100%-1.5rem)] md:w-auto md:max-w-[640px] pointer-events-auto">
          {searchedCity && isDataReady ? (
            <CityForecast
              cityCoordinates={searchedCity?.coordinates}
              cityName={searchedCity?.name}
              selectedTime={currentLayer?.timestamp}
              compact
              edgeless
              onTimeSelect={handleTimeChange}
            />
          ) : (
            <ForecastSkeleton compact />
          )}
        </div>

        {/* Bottom-center floating TimeControls pill */}
        {smokeLayers.length > 0 && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-[calc(100%-1.5rem)] md:w-auto md:max-w-[640px] pointer-events-auto">
            <TimeControls
              currentIndex={currentLayerIndex}
              onTimeChange={handleTimeChange}
              autoPlay={false}
              availableTimes={availableTimes}
              timeZone={cityTimeZone}
              compact
              floating
            />
          </div>
        )}

        {/* Desktop right-side floating details panel */}
        {!isMobile && (
          sidebarCollapsed ? (
            <button
              onClick={() => setSidebarCollapsed(false)}
              className="absolute top-1/2 -translate-y-1/2 right-3 pointer-events-auto h-10 w-8 rounded-l-lg rounded-r-none bg-background/70 backdrop-blur-md flex items-center justify-center hover:bg-background/90 transition"
              aria-label="Show details panel"
            >
              <ChevronLeft className="h-4 w-4 text-foreground" />
            </button>
          ) : (
            <aside className="absolute top-16 right-3 bottom-20 w-[320px] pointer-events-auto rounded-2xl bg-background/75 backdrop-blur-md shadow-[0_4px_24px_rgba(0,0,0,0.2)] flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Details</span>
                <button
                  onClick={() => setSidebarCollapsed(true)}
                  className="h-6 w-6 rounded hover:bg-muted/50 flex items-center justify-center"
                  aria-label="Collapse details panel"
                >
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-1 pb-3 space-y-2">
                <LocationInfo
                  coordinates={selectedLocation?.coordinates}
                  locationName={selectedLocation?.name}
                  selectedTime={currentLayer?.timestamp}
                  smokeData={selectedLocation?.smokeData}
                  edgeless
                />
                <div className="border-t border-border/30 mx-3" />
                <SmokeLegend edgeless />
              </div>
            </aside>
          )
        )}

        {/* Mobile details chip + sheet */}
        {isMobile && (
          <div className="absolute bottom-20 right-3 pointer-events-auto">
            <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
              <SheetTrigger asChild>
                <Button
                  size="sm"
                  variant="secondary"
                  className="rounded-full bg-background/80 backdrop-blur-md shadow-[0_2px_12px_rgba(0,0,0,0.2)] border-0 h-9 px-3 gap-1.5"
                >
                  <Info className="h-4 w-4 text-primary" />
                  <span className="text-xs font-medium max-w-[120px] truncate">
                    {selectedCityShort || 'Details'}
                  </span>
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-2xl">
                <SheetHeader>
                  <SheetTitle>Details & Legend</SheetTitle>
                </SheetHeader>
                <div className="mt-3 space-y-3">
                  <LocationInfo
                    coordinates={selectedLocation?.coordinates}
                    locationName={selectedLocation?.name}
                    selectedTime={currentLayer?.timestamp}
                    smokeData={selectedLocation?.smokeData}
                    edgeless
                  />
                  <div className="border-t border-border/30" />
                  <SmokeLegend edgeless />
                  <p className="text-[10px] text-muted-foreground text-center pt-2">
                    Data: NOAA HRRR-Smoke · Real-time
                  </p>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        )}
      </div>
    </div>
  );
};
export default Index;