
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

  // Update current layer based on selected time - IMPROVED LOGIC
  useEffect(() => {
    if (!selectedTime || smokeLayers.length === 0) {
      console.log('Time sync skipped - selectedTime:', selectedTime?.toISOString(), 'layers:', smokeLayers.length);
      return;
    }
    
    console.log('🎯 FINDING LAYER for selectedTime:', selectedTime.toISOString());
    
    // Instead of finding closest, use a more predictable round-robin approach
    // This ensures we cycle through all available layers as time advances
    const totalHours = 48; // 48 hour forecast
    const baseTime = new Date();
    baseTime.setMinutes(0, 0, 0); // Round to hour
    
    // Calculate which hour offset we're at (0-47)
    const hourOffset = Math.floor((selectedTime.getTime() - baseTime.getTime()) / (60 * 60 * 1000));
    const clampedOffset = Math.max(0, Math.min(47, hourOffset)); // Clamp to 0-47
    
    // Map hour offset to layer index - distribute evenly across available layers
    const newIndex = Math.floor((clampedOffset / 47) * (smokeLayers.length - 1));
    
    console.log(`📊 Hour offset: ${hourOffset} → Layer index: ${newIndex} (of ${smokeLayers.length} layers)`);
    console.log(`🔄 Selected layer timestamp: ${smokeLayers[newIndex]?.timestamp.toISOString()}`);
    console.log(`🔄 Layer has ${smokeLayers[newIndex]?.data.length || 0} polygons`);
    
    if (newIndex !== currentLayerIndex) {
      console.log(`🎬 LAYER CHANGE: ${currentLayerIndex} → ${newIndex}`);
      setCurrentLayerIndex(newIndex);
    } else {
      console.log(`⚡ Same layer index ${newIndex}, but forcing update for mobile`);
      // Force a tiny state change to trigger re-render on mobile
      setCurrentLayerIndex(prev => prev === newIndex ? newIndex : newIndex);
    }
  }, [selectedTime, smokeLayers, currentLayerIndex]);

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
