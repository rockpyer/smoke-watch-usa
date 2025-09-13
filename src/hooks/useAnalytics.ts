import { useCallback } from 'react';
import { analyticsService } from '@/services/analyticsService';

export const useAnalytics = () => {
  const trackPageLoad = useCallback((latitude?: number, longitude?: number) => {
    analyticsService.trackPageLoad(latitude, longitude);
  }, []);

  const trackCitySearch = useCallback((query: string, city?: string, latitude?: number, longitude?: number) => {
    analyticsService.trackCitySearch(query, city, latitude, longitude);
  }, []);

  const trackLocationClick = useCallback((latitude: number, longitude: number, zoomLevel?: number) => {
    analyticsService.trackLocationClick(latitude, longitude, zoomLevel);
  }, []);

  const trackTimeChange = useCallback((previousTime: Date, newTime: Date, interactionType: string) => {
    analyticsService.trackTimeChange(previousTime, newTime, interactionType);
  }, []);

  const trackForecastView = useCallback((city: string, forecastAvailable: boolean, latitude?: number, longitude?: number) => {
    analyticsService.trackForecastView(city, forecastAvailable, latitude, longitude);
  }, []);

  return {
    trackPageLoad,
    trackCitySearch,
    trackLocationClick,
    trackTimeChange,
    trackForecastView
  };
};