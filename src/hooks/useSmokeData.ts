
import { useState, useEffect, useCallback } from 'react';
import { smokeDataService } from '@/services/smokeDataService';

interface SmokeDataPoint {
  lat: number;
  lng: number;
  intensity: number;
  timestamp: Date;
}

interface SmokeLayer {
  timestamp: Date;
  data: SmokeDataPoint[];
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
      console.log('Fetching smoke data...');
      const data = await smokeDataService.fetchSmokeData();
      setSmokeLayers(data);
      console.log(`Loaded ${data.length} smoke layers`);
    } catch (err) {
      console.error('Failed to fetch smoke data:', err);
      setError('Failed to load smoke data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Update current layer based on selected time
  useEffect(() => {
    if (!selectedTime || smokeLayers.length === 0) return;
    
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
    }, 200); // 200ms per frame for smooth animation
    
    return () => clearInterval(interval);
  }, [isPlaying, smokeLayers.length]);

  // Initial data fetch
  useEffect(() => {
    fetchData();
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
    refetch: fetchData
  };
};
