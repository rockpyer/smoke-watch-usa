import React, { lazy, Suspense, memo } from 'react';
import { MapSkeleton } from './LoadingSkeleton';

const SmokeMap = lazy(() => import('./SmokeMap'));

interface SmokeMapLazyProps {
  onLocationSelect?: (coordinates: [number, number], locationName: string, smokeData?: any) => void;
  onCitySearch?: (coordinates: { lat: number; lng: number }, cityName: string) => void;
  selectedTime?: Date;
  currentLayer?: any;
  smokeLayers?: any[];
  focusLocation?: { lat: number; lng: number } | null;
}

const SmokeMapLazy: React.FC<SmokeMapLazyProps> = memo((props) => {
  return (
    <Suspense fallback={<MapSkeleton />}>
      <SmokeMap {...props} />
    </Suspense>
  );
});

SmokeMapLazy.displayName = 'SmokeMapLazy';

export default SmokeMapLazy;