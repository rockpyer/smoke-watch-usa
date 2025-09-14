import { useState, useEffect, useCallback, useRef, startTransition } from 'react';
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
  chunkSize: number = 10 // Further reduced for better TTI
): Promise<void> => {
  return new Promise((resolve) => {
    let index = 0;
    
    const processChunk = () => {
      const startTime = performance.now();
      const endIndex = Math.min(index + chunkSize, items.length);
      
      // Process chunk but yield more frequently (2ms instead of 5ms)
      while (index < endIndex && (performance.now() - startTime) < 2) {
        processor(items[index], index);
        index++;
      }
      
      if (index < items.length) {
        // Always use scheduler.postTask with background priority if available
        if ('scheduler' in window && 'postTask' in (window as any).scheduler) {
          (window as any).scheduler.postTask(processChunk, { priority: 'background' });
        } else {
          // Use longer timeout to give more time for user interactions
          setTimeout(processChunk, 16); // Next frame
        }
      } else {
        resolve();
      }
    };
    
    // Start processing on next frame to not block initial render
    if ('scheduler' in window && 'postTask' in (window as any).scheduler) {
      (window as any).scheduler.postTask(processChunk, { priority: 'background' });
    } else {
      setTimeout(processChunk, 16);
    }
  });
};

export const useSmokeData = () => {
  const [smokeLayers, setSmokeLayers] = useState<SmokeLayer[]>([]);
  const [currentLayerIndex, setCurrentLayerIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedTime, setSelectedTime] = useState<Date | undefined>(undefined);

  // Use refs to prevent unnecessary re-renders
  const lastSelectedTimeRef = useRef<Date | null>(null);
  const lastSyncedIndexRef = useRef<number>(-1);
  const initializedRef = useRef<boolean>(false);

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

  // Initialize currentLayerIndex and set initial selected time when smokeLayers first loads
  const initializeTime = useCallback(() => {
    if (smokeLayers.length > 0 && !initializedRef.current) {
      // Find the closest time to now for initial layer selection
      const now = new Date();
      let closestIndex = 0;
      let minDiff = Math.abs(smokeLayers[0].timestamp.getTime() - now.getTime());
      
      for (let i = 1; i < smokeLayers.length; i++) {
        const diff = Math.abs(smokeLayers[i].timestamp.getTime() - now.getTime());
        if (diff < minDiff) {
          minDiff = diff;
          closestIndex = i;
        }
      }
      
      const initialTime = smokeLayers[closestIndex].timestamp;
      console.log(`🚀 SMOKE DATA: Initializing time. Index: ${closestIndex}, Time: ${initialTime.toISOString()}`);
      setCurrentLayerIndex(closestIndex);
      setSelectedTime(initialTime);
      lastSyncedIndexRef.current = closestIndex;
      initializedRef.current = true;
    }
  }, [smokeLayers]);

  useEffect(() => {
    initializeTime();
  }, [smokeLayers]);

  // FIXED: Synchronous layer sync to prevent double rendering
  useEffect(() => {
    if (!selectedTime || smokeLayers.length === 0) {
      if (smokeLayers.length > 0 && !initializedRef.current) initializeTime();
      return;
    }
    
    // Only sync if the time actually changed
    const timeChanged = !lastSelectedTimeRef.current || 
      lastSelectedTimeRef.current.getTime() !== selectedTime.getTime();
    
    if (!timeChanged) {
      return;
    }
    
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
  }, [selectedTime, smokeLayers]);

  // Initial data fetch - defer to avoid blocking TTI
  useEffect(() => {
    // Defer initial fetch to allow page to become interactive first
    const timer = setTimeout(() => {
      startTransition(() => {
        fetchData();
      });
    }, 100);
    
    return () => clearTimeout(timer);
  }, [fetchData]);

  const getCurrentLayer = (): SmokeLayer | null => {
    return smokeLayers[currentLayerIndex] || null;
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
    refetch: fetchData,
    setTime: setSelectedTime, // Expose a function to set the time
  };
};
