
import { lazy } from 'react';

// Lazy load heavy components that aren't immediately needed
export const SmokeMap = lazy(() => import('./SmokeMap'));
export const LocationInfo = lazy(() => import('./LocationInfo'));
export const SmokeLegend = lazy(() => import('./SmokeLegend'));
export const CityForecast = lazy(() => import('./CityForecastOptimized').then(module => ({ default: module.CityForecast })));
