
import React, { useState, useCallback } from 'react';
import SmokeMap from '@/components/SmokeMap';
import TimeControls from '@/components/TimeControls';
import { useSmokeData } from '@/hooks/useSmokeDataOptimized';
import { CityForecast } from '@/components/CityForecast';
import SmokeLegend from '@/components/SmokeLegend';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { MapPin, Clock, Wind } from 'lucide-react';
import LocationInfo from '@/components/LocationInfo';
import { format } from 'date-fns';
import * as tz from 'tz-lookup';

const Index = () => {
  const [selectedTime, setSelectedTime] = useState<Date | undefined>();
  const [selectedLocation, setSelectedLocation] = useState<{
    coordinates: [number, number];
    name: string;
    smokeData?: any;
  } | null>(null);

  // Use the optimized smoke data hook
  const { 
    smokeLayers, 
    currentLayer, 
    isLoading, 
    error,
    isSyncing 
  } = useSmokeData(selectedTime);

  const handleTimeChange = useCallback((time: Date, index: number) => {
    console.log(`🕐 INDEX: Time changed to ${time.toISOString()} (index ${index})`);
    setSelectedTime(time);
  }, []);

  const handleLocationSelect = useCallback((
    coordinates: [number, number], 
    locationName: string, 
    smokeData?: any
  ) => {
    console.log('📍 INDEX: Location selected:', { coordinates, locationName, smokeData });
    setSelectedLocation({ 
      coordinates, 
      name: locationName, 
      smokeData 
    });
  }, []);

  const handleCitySearch = useCallback((coordinates: { lat: number; lng: number }, cityName: string) => {
    console.log('🔍 INDEX: City searched:', { coordinates, cityName });
    setSelectedLocation({
      coordinates: [coordinates.lng, coordinates.lat],
      name: cityName
    });
  }, []);

  // Prepare available times from smoke layers
  const availableTimes = smokeLayers.map(layer => layer.timestamp);

  // Determine city timezone if location is selected
  let cityTimeZone = 'America/Denver'; // Default timezone
  if (selectedLocation) {
    try {
      const [lng, lat] = selectedLocation.coordinates;
      cityTimeZone = tz.default(lat, lng) || 'America/Denver';
    } catch (error) {
      console.warn('Failed to determine timezone:', error);
      cityTimeZone = 'America/Denver';
    }
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="p-6 max-w-md text-center border-destructive">
          <div className="space-y-4">
            <div className="text-destructive">
              <Wind className="h-12 w-12 mx-auto mb-2" />
              <h2 className="text-xl font-semibold">Unable to Load Data</h2>
            </div>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 to-blue-100 p-2 md:p-4">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl md:text-4xl font-bold text-slate-800 flex items-center justify-center gap-2">
            <Wind className="h-6 w-6 md:h-8 md:w-8" />
            NOAA Smoke Forecast
          </h1>
          <p className="text-sm md:text-base text-slate-600">
            Real-time smoke forecasting powered by government data
          </p>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 h-[calc(100vh-200px)]">
          {/* Map Section - Takes up most space */}
          <div className="xl:col-span-3 relative">
            <Card className="h-full overflow-hidden">
              <SmokeMap
                selectedTime={selectedTime}
                currentLayer={currentLayer}
                isSyncing={isSyncing}
                onLocationSelect={handleLocationSelect}
                onCitySearch={handleCitySearch}
              />
            </Card>
          </div>

          {/* Side Panel */}
          <div className="xl:col-span-1 space-y-4 flex flex-col">
            {/* Time Controls */}
            <TimeControls
              onTimeChange={handleTimeChange}
              availableTimes={availableTimes}
              timeZone={cityTimeZone}
              compact={true}
            />

            {/* Location Info */}
            {selectedLocation && (
              <LocationInfo
                coordinates={selectedLocation.coordinates}
                locationName={selectedLocation.name}
                selectedTime={selectedTime}
                smokeData={selectedLocation.smokeData}
              />
            )}

            {/* City Forecast */}
            {selectedLocation && (
              <div className="flex-1 min-h-0">
                <CityForecast
                  location={selectedLocation.coordinates}
                  cityName={selectedLocation.name}
                  selectedTime={selectedTime}
                  availableTimes={availableTimes}
                  timeZone={cityTimeZone}
                  compact={true}
                />
              </div>
            )}

            {/* Smoke Legend */}
            <SmokeLegend />
          </div>
        </div>

        {/* Bottom Status */}
        <div className="text-center text-xs text-slate-500 space-y-1">
          <div className="flex items-center justify-center gap-4 flex-wrap">
            {isLoading && (
              <span className="flex items-center gap-1">
                <div className="animate-spin h-3 w-3 border border-slate-400 border-t-transparent rounded-full"></div>
                Loading forecast data...
              </span>
            )}
            {currentLayer && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Forecast: {format(currentLayer.timestamp, 'MMM d, h:mm a')}
              </span>
            )}
            {selectedLocation && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {selectedLocation.name}
              </span>
            )}
          </div>
          <div>
            Data provided by NOAA National Digital Forecast Database • Updated every hour
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
