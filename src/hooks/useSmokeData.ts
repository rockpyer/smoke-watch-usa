
import { useState, useEffect, useCallback, useRef } from 'react';
import { smokeDataService } from '@/services/smokeDataService';

interface SmokePolygon {
  geometry: {
    type: 'Polygon';
    coordinates: number[][][];
  };
  properties: {
    smoke_class: number;
    smoke_classdesc: string;
    concentration_ugm3: number;
    todate: string;
    referencedate: string;
  };
}

interface SmokeLayer {
  timestamp: Date;
  data: SmokePolygon[];
}

export const useSmokeData = (selectedTime?: Date) => {
  const [smokeLayers, setSmokeLayers] = useState<SmokeLayer[]>([]);
  const [currentLayerIndex, setCurrentLayerIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Use refs to prevent unnecessary re-renders
  const lastSelectedTimeRef = useRef<Date | null>(null);
  const lastSyncedIndexRef = useRef<number>(-1);

  // Fetch smoke data
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('Fetching NOAA smoke polygon data...');
      const data = await smokeDataService.fetchSmokeData();
      setSmokeLayers(data);
      console.log(`Loaded ${data.length} smoke forecast layers`);
    } catch (err) {
      console.error('Failed to fetch NOAA smoke data:', err);
      setError('Failed to load NOAA smoke forecast data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Update current layer based on selected time - OPTIMIZED with refs
  useEffect(() => {
    if (!selectedTime || smokeLayers.length === 0) {
      return;
    }
    
    // Only sync if the time actually changed
    const timeChanged = !lastSelectedTimeRef.current || 
      lastSelectedTimeRef.current.getTime() !== selectedTime.getTime();
    
    if (!timeChanged) {
      return; // Skip if time hasn't actually changed
    }
    
    lastSelectedTimeRef.current = selectedTime;
    
    // Find the exact matching layer by timestamp
    const matchingIndex = smokeLayers.findIndex(layer => 
      layer.timestamp.getTime() === selectedTime.getTime()
    );
    
    let targetIndex = matchingIndex;
    
    if (matchingIndex === -1) {
      // If no exact match, find the closest one
      let closestIndex = 0;
      let minDiff = Math.abs(smokeLayers[0].timestamp.getTime() - selectedTime.getTime());
      
      for (let i = 1; i < smokeLayers.length; i++) {
        const diff = Math.abs(smokeLayers[i].timestamp.getTime() - selectedTime.getTime());
        if (diff < minDiff) {
          minDiff = diff;
          closestIndex = i;
        }
      }
      targetIndex = closestIndex;
    }
    
    // Only update if index actually changed
    if (targetIndex !== lastSyncedIndexRef.current) {
      console.log(`📊 SMOKE DATA: Syncing to index ${targetIndex} for time: ${selectedTime.toISOString()}`);
      setCurrentLayerIndex(targetIndex);
      lastSyncedIndexRef.current = targetIndex;
    }
  }, [selectedTime, smokeLayers]);

  // Initial data fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const getCurrentLayer = (): SmokeLayer | null => {
    const layer = smokeLayers[currentLayerIndex] || null;
    return layer;
  };

  const playAnimation = () => {
    setIsPlaying(true);
    setCurrentLayerIndex(0);
  };

  const pauseAnimation = () => {
    setIsPlaying(false);
  };

  const resetAnimation = () => {
    setIsPlaying(false);
    setCurrentLayerIndex(0);
  };

  return {
    smokeLayers,
    currentLayer: getCurrentLayer(),
    currentLayerIndex,
    isLoading,
    error,
    isPlaying,
    totalLayers: smokeLayers.length,
    playAnimation,
    pauseAnimation,
    resetAnimation,
    refetch: fetchData
  };
};
