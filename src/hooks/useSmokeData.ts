
import { useState, useEffect, useCallback } from 'react';
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

  // Fetch smoke data
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('Fetching NOAA smoke polygon data...');
      const data = await smokeDataService.fetchSmokeData();
      setSmokeLayers(data);
      console.log(`Loaded ${data.length} smoke forecast layers`);
      console.log('Available timestamps:', data.map((layer, i) => `${i}: ${layer.timestamp.toISOString()}`));
    } catch (err) {
      console.error('Failed to fetch NOAA smoke data:', err);
      setError('Failed to load NOAA smoke forecast data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Update current layer based on selected time - FIXED SYNCHRONIZATION
  useEffect(() => {
    if (!selectedTime || smokeLayers.length === 0) {
      return;
    }
    
    console.log('🎯 SMOKE DATA: Syncing to selectedTime:', selectedTime.toISOString());
    
    // Find the exact matching layer by timestamp
    const matchingIndex = smokeLayers.findIndex(layer => 
      layer.timestamp.getTime() === selectedTime.getTime()
    );
    
    if (matchingIndex !== -1) {
      console.log(`📊 SMOKE DATA: Found exact match at index: ${matchingIndex}`);
      if (currentLayerIndex !== matchingIndex) {
        console.log(`📊 SMOKE DATA: Updating currentLayerIndex from ${currentLayerIndex} to ${matchingIndex}`);
        setCurrentLayerIndex(matchingIndex);
      }
    } else {
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
      
      console.log(`📊 SMOKE DATA: No exact match, using closest at index: ${closestIndex}`);
      if (currentLayerIndex !== closestIndex) {
        console.log(`📊 SMOKE DATA: Updating currentLayerIndex from ${currentLayerIndex} to ${closestIndex}`);
        setCurrentLayerIndex(closestIndex);
      }
    }
  }, [selectedTime, smokeLayers, currentLayerIndex]);

  // Initial data fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const getCurrentLayer = (): SmokeLayer | null => {
    const layer = smokeLayers[currentLayerIndex] || null;
    if (layer) {
      console.log(`📍 getCurrentLayer: Returning layer ${currentLayerIndex} with ${layer.data.length} polygons for time ${layer.timestamp.toISOString()}`);
    } else {
      console.log(`❌ getCurrentLayer: No layer at index ${currentLayerIndex}`);
    }
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
