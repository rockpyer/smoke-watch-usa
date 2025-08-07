
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
      console.log(`Loaded ${data.length} smoke forecast layers with polygons`);
    } catch (err) {
      console.error('Failed to fetch NOAA smoke data:', err);
      setError('Failed to load NOAA smoke forecast data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Update current layer based on selected time
  useEffect(() => {
    if (!selectedTime || smokeLayers.length === 0) {
      console.log('Time sync skipped - selectedTime:', selectedTime?.toISOString(), 'layers:', smokeLayers.length);
      return;
    }
    
    console.log('Finding closest layer for selectedTime:', selectedTime.toISOString());
    console.log('Available layer timestamps:', smokeLayers.map((layer, i) => `${i}: ${layer.timestamp.toISOString()}`));
    
    // Find the closest layer to the selected time
    let closestIndex = 0;
    let minDiff = Math.abs(smokeLayers[0].timestamp.getTime() - selectedTime.getTime());
    
    for (let i = 1; i < smokeLayers.length; i++) {
      const diff = Math.abs(smokeLayers[i].timestamp.getTime() - selectedTime.getTime());
      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = i;
      }
    }
    
    console.log(`Selected layer ${closestIndex} (${smokeLayers[closestIndex].timestamp.toISOString()}) for time ${selectedTime.toISOString()}`);
    console.log(`Time difference: ${minDiff / 1000 / 60} minutes`);
    
    setCurrentLayerIndex(closestIndex);
  }, [selectedTime, smokeLayers]);

  // Auto-play animation
  useEffect(() => {
    if (!isPlaying || smokeLayers.length === 0) return;
    
    const interval = setInterval(() => {
      setCurrentLayerIndex(prev => {
        const next = prev + 1;
        if (next >= smokeLayers.length) {
          setIsPlaying(false);
          return 0;
        }
        return next;
      });
    }, 1000); // 1 second per frame for forecast animation
    
    return () => clearInterval(interval);
  }, [isPlaying, smokeLayers.length]);

  // Initial data fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const getCurrentLayer = (): SmokeLayer | null => {
    const layer = smokeLayers[currentLayerIndex] || null;
    if (layer) {
      console.log(`getCurrentLayer: Returning layer ${currentLayerIndex} with ${layer.data.length} polygons for time ${layer.timestamp.toISOString()}`);
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
