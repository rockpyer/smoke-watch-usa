
import { useState, useEffect, useCallback, useRef } from 'react';
import { smokeDataService } from '@/services/smokeDataService';
import { AsyncProcessor } from '@/utils/asyncProcessor';

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
  const abortControllerRef = useRef<AbortController | null>(null);

  // Optimized fetch with aggressive chunking
  const fetchData = useCallback(async () => {
    // Cancel any existing fetch
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    abortControllerRef.current = new AbortController();
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('Fetching NOAA smoke polygon data...');
      const data = await smokeDataService.fetchSmokeData();
      
      // Check if request was aborted
      if (abortControllerRef.current.signal.aborted) {
        return;
      }
      
      // Process data in very small chunks to minimize blocking
      const processedLayers: SmokeLayer[] = [];
      
      await AsyncProcessor.processInChunks(
        data,
        async (layer) => {
          processedLayers.push(layer);
        },
        { 
          chunkSize: 15, 
          timeSlice: 3,
          priority: 'background'
        }
      );
      
      // Final check before setting state
      if (!abortControllerRef.current.signal.aborted) {
        setSmokeLayers(processedLayers);
        console.log(`Loaded ${processedLayers.length} smoke forecast layers`);
      }
    } catch (err) {
      if (!abortControllerRef.current.signal.aborted) {
        console.error('Failed to fetch NOAA smoke data:', err);
        setError('Failed to load NOAA smoke forecast data');
      }
    } finally {
      if (!abortControllerRef.current.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, []);

  // Optimized layer sync with micro-batching
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
    
    lastSelectedTimeRef.current = selectedTime;
    
    // Use scheduler API for non-urgent calculations with minimal work
    const processSync = async () => {
      // Yield immediately to prevent blocking
      await AsyncProcessor.defer(0);
      
      // Find matching layer with early exit optimization
      let targetIndex = 0;
      let minDiff = Infinity;
      
      // Process in small batches
      const batchSize = 20;
      for (let i = 0; i < smokeLayers.length; i += batchSize) {
        const endIndex = Math.min(i + batchSize, smokeLayers.length);
        
        for (let j = i; j < endIndex; j++) {
          const diff = Math.abs(smokeLayers[j].timestamp.getTime() - selectedTime.getTime());
          if (diff === 0) {
            // Exact match found, exit immediately
            targetIndex = j;
            minDiff = 0;
            break;
          }
          if (diff < minDiff) {
            minDiff = diff;
            targetIndex = j;
          }
        }
        
        // Break if exact match found
        if (minDiff === 0) break;
        
        // Yield control between batches
        if (i + batchSize < smokeLayers.length) {
          await AsyncProcessor.defer(1);
        }
      }
      
      // Only update if index actually changed
      if (targetIndex !== lastSyncedIndexRef.current) {
        console.log(`📊 SMOKE DATA: Syncing to index ${targetIndex} for time: ${selectedTime.toISOString()}`);
        setCurrentLayerIndex(targetIndex);
        lastSyncedIndexRef.current = targetIndex;
      }
    };
    
    // Schedule with background priority
    if ('scheduler' in window && 'postTask' in (window as any).scheduler) {
      (window as any).scheduler.postTask(processSync, { priority: 'background' });
    } else {
      AsyncProcessor.defer(0).then(processSync);
    }
  }, [selectedTime, smokeLayers]);

  // Initial data fetch
  useEffect(() => {
    fetchData();
    
    // Cleanup on unmount
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
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
