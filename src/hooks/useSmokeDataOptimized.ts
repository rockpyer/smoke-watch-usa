
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

// Optimize heavy operations with time-slicing to prevent blocking
const timeSlicedProcess = <T>(
  items: T[],
  processor: (item: T, index: number) => void,
  chunkSize: number = 50
): Promise<void> => {
  return new Promise((resolve) => {
    let index = 0;
    
    const processChunk = () => {
      const endIndex = Math.min(index + chunkSize, items.length);
      
      for (let i = index; i < endIndex; i++) {
        processor(items[i], i);
      }
      
      index = endIndex;
      
      if (index < items.length) {
        // Use scheduler.postTask if available, fallback to setTimeout
        if ('scheduler' in window && 'postTask' in (window as any).scheduler) {
          (window as any).scheduler.postTask(processChunk, { priority: 'background' });
        } else {
          setTimeout(processChunk, 0);
        }
      } else {
        resolve();
      }
    };
    
    processChunk();
  });
};

export const useSmokeData = (selectedTime?: Date) => {
  const [smokeLayers, setSmokeLayers] = useState<SmokeLayer[]>([]);
  const [currentLayerIndex, setCurrentLayerIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Use refs to prevent unnecessary re-renders
  const lastSelectedTimeRef = useRef<Date | null>(null);
  const lastSyncedIndexRef = useRef<number>(-1);

  // Optimized fetch with time-sliced processing
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('Fetching NOAA smoke polygon data...');
      const data = await smokeDataService.fetchSmokeData();
      
      // Process data in time-sliced chunks to prevent blocking
      const processedLayers: SmokeLayer[] = [];
      await timeSlicedProcess(data, (layer) => {
        processedLayers.push(layer);
      });
      
      setSmokeLayers(processedLayers);
      console.log(`Loaded ${processedLayers.length} smoke forecast layers`);
    } catch (err) {
      console.error('Failed to fetch NOAA smoke data:', err);
      setError('Failed to load NOAA smoke forecast data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // FIXED: Synchronous layer sync to prevent double rendering
  useEffect(() => {
    if (!selectedTime || smokeLayers.length === 0) {
      return;
    }
    
    // Only sync if the time actually changed
    const timeChanged = !lastSelectedTimeRef.current || 
      lastSelectedTimeRef.current.getTime() !== selectedTime.getTime();
    
    if (!timeChanged) {
      return;
    }
    
    setIsSyncing(true);
    lastSelectedTimeRef.current = selectedTime;
    
    // SYNCHRONOUS layer finding - no async deferrals
    const matchingIndex = smokeLayers.findIndex(layer => 
      layer.timestamp.getTime() === selectedTime.getTime()
    );
    
    let targetIndex = matchingIndex;
    
    if (matchingIndex === -1) {
      // Binary search for closest time - O(log n) performance
      let left = 0;
      let right = smokeLayers.length - 1;
      let closestIndex = 0;
      let minDiff = Math.abs(smokeLayers[0].timestamp.getTime() - selectedTime.getTime());
      
      while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        const diff = Math.abs(smokeLayers[mid].timestamp.getTime() - selectedTime.getTime());
        
        if (diff < minDiff) {
          minDiff = diff;
          closestIndex = mid;
        }
        
        if (smokeLayers[mid].timestamp.getTime() < selectedTime.getTime()) {
          left = mid + 1;
        } else {
          right = mid - 1;
        }
      }
      
      targetIndex = closestIndex;
    }
    
    // Only update if index actually changed
    if (targetIndex !== lastSyncedIndexRef.current) {
      console.log(`📊 SMOKE DATA: Syncing SYNCHRONOUSLY to index ${targetIndex} for time: ${selectedTime.toISOString()}`);
      setCurrentLayerIndex(targetIndex);
      lastSyncedIndexRef.current = targetIndex;
    }
    
    setIsSyncing(false);
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
    isSyncing,
    totalLayers: smokeLayers.length,
    playAnimation,
    pauseAnimation,
    resetAnimation,
    refetch: fetchData
  };
};
