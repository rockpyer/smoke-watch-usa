import React, { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, MapPin, AlertCircle, RefreshCw } from 'lucide-react';
import { fireDataService } from '../services/fireDataService';
import { config, hasValidMapboxToken } from '@/utils/config';
import { sanitizeSearchInput, validateSearchInput, debounce } from '@/utils/inputValidation';
import MapboxTokenInput from './MapboxTokenInput';

// test test test for debugging //
interface SmokeLayer {
  timestamp: Date;
  data: any[];
}

interface SmokeMapProps {
  onLocationSelect?: (coordinates: [number, number], locationName: string, smokeData?: any) => void;
  onCitySearch?: (coordinates: { lat: number; lng: number }, cityName: string) => void;
  selectedTime?: Date;
  currentLayer?: SmokeLayer | null;
}

const SmokeMap: React.FC<SmokeMapProps> = ({ 
{
  console.log('SmokeMap component mounted/rendered');
  onLocationSelect,
  onCitySearch, 
  selectedTime, 
  currentLayer 
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const marker = useRef<mapboxgl.Marker | null>(null);
  const [searchValue, setSearchValue] = useState('');
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string>('');
  const [isInitializing, setIsInitializing] = useState(false);
  const [fireDataLoaded, setFireDataLoaded] = useState(false);
  const [lastLayerTimestamp, setLastLayerTimestamp] = useState<string>('');
    // ...existing code...
    console.log('🔥 [SmokeMap.tsx] File loaded at top-level');
    // Add the polygon layer
    mapRef.current.addLayer({
      id: 'smoke-polygons',
      type: 'fill',
      source: 'smoke-forecast-data',
      layout: {},
      paint: {
        'fill-color': [
          'match',
          ['get', 'smoke_classdesc'],
          'Light', '#fbb03b',
          'Moderate', '#e55e5e',
          'Heavy', '#223b53',
          /* other */ '#ccc'
        ],
        'fill-opacity': 0.5
      }
    });
    // ...existing code...
    // Add the outline layer
    mapRef.current.addLayer({
      id: 'smoke-outlines',
      type: 'line',
      source: 'smoke-forecast-data',
      layout: {},
      paint: {
        'line-color': '#000',
        'line-width': 1
      }
    });
    // ...existing code...
    // Fit map to polygons if initial load
    if (isInitialLoad && polygons.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      polygons.forEach((poly) => {
        // Defensive: handle MultiPolygon and Polygon
        if (poly.geometry.type === 'Polygon') {
          poly.geometry.coordinates[0].forEach(([lng, lat]) => {
            bounds.extend([lng, lat]);
          });
        } else if (poly.geometry.type === 'MultiPolygon') {
          poly.geometry.coordinates.forEach((polygon) => {
            polygon[0].forEach(([lng, lat]) => {
              bounds.extend([lng, lat]);
            });
          });
        }
      });
      if (bounds.isEmpty()) {
        console.log('🟡 No bounds to fit, skipping fitBounds');
      } else {
        console.log('🟢 Fitting map to initial polygon bounds:', bounds);
        mapRef.current.fitBounds(bounds, { padding: 40, duration: 0 });
      }
      // Force a repaint to ensure polygons are visible
      if (typeof mapRef.current.triggerRepaint === 'function') {
        mapRef.current.triggerRepaint();
        console.log('🔄 Forced map repaint after initial polygon layer add');
      }
    }
    // ...existing code...
      setTimeout(() => initializeMap(), 100);
      return;
    }

    try {
      setIsInitializing(true);
      setMapError('');
      console.log('Setting Mapbox token and initializing map...');
      
      mapboxgl.accessToken = config.mapboxToken!;
      console.log('Mapbox token set successfully');
      
      if (map.current) {
        console.log('Removing existing map');
        map.current.remove();
        map.current = null;
      }

      if (initTimeoutRef.current) {
        clearTimeout(initTimeoutRef.current);
      }

      setIsMapLoaded(false);
      setSmokeLayerReady(false);
      
      console.log('Creating new map instance...');
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [-98.5795, 39.8283],
        zoom: 4,
        attributionControl: false,
        preserveDrawingBuffer: true
      });

      console.log('Map instance created, adding controls...');
      map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

      let loadEventFired = false;
      let loadTimeout: NodeJS.Timeout;

      // Set a timeout to prevent infinite loading
      loadTimeout = setTimeout(() => {
        console.log('Load timeout reached - forcing map ready state');
        if (!loadEventFired) {
          loadEventFired = true;
          setIsMapLoaded(true);
          setIsInitializing(false);
          setSmokeLayerReady(true);
        }
      }, 3000);

      map.current.on('load', () => {
        console.log('Map load event fired - map is ready for layers');
        if (!loadEventFired) {
          loadEventFired = true;
          clearTimeout(loadTimeout);
          setIsMapLoaded(true);
          setIsInitializing(false);
          setSmokeLayerReady(true);
        }
      });

      map.current.on('style.load', () => {
        console.log('Map style loaded - style is ready');
        // Debug: Log isStyleLoaded after style.load
        if (map.current) {
          console.log('DEBUG: map.current.isStyleLoaded() after style.load:', map.current.isStyleLoaded());
        }
        // Force polygon rendering after style load if currentLayer is available
        if (map.current && currentLayer) {
          console.log('DEBUG: Forcing addSmokeLayer after style.load for', currentLayer.timestamp?.toISOString());
          addSmokeLayer();
        }
        if (!loadEventFired) {
          loadEventFired = true;
          clearTimeout(loadTimeout);
          setIsMapLoaded(true);
          setIsInitializing(false);
          setSmokeLayerReady(true);
        }
      });

      map.current.on('error', (e) => {
        console.error('Map error event:', e.error);
        clearTimeout(loadTimeout);
        setIsInitializing(false);
        
        if (e.error?.message?.includes('Unauthorized') || e.error?.message?.includes('401')) {
          setMapError('Invalid Mapbox token. Please check your token and try again.');
          setNeedsToken(true);
        } else if (e.error?.message?.includes('Network')) {
          setMapError('Network error. Please check your connection and try again.');
        } else {
          setMapError(`Map error: ${e.error?.message || 'Unknown error'}`);
        }
      });

      map.current.on('click', (e) => {
        if (!isMapLoaded || !map.current) return;
        
        const { lng, lat } = e.lngLat;
        
        if (marker.current) {
          marker.current.remove();
        }
        
        marker.current = new mapboxgl.Marker({
          color: '#2563eb'
        })
          .setLngLat([lng, lat])
          .addTo(map.current);

        reverseGeocode(lng, lat);
        
        if (onLocationSelect) {
          onLocationSelect([lng, lat], `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        }
      });

    } catch (error) {
      console.error('Failed to initialize map:', error);
      setIsInitializing(false);
      
      if (error instanceof Error) {
        if (error.message.includes('Unauthorized') || error.message.includes('401')) {
          setMapError('Invalid Mapbox token. Please verify your token is correct.');
          setNeedsToken(true);
        } else if (error.message.includes('container')) {
          setMapError('Map container error. Please try refreshing the page.');
        } else {
          setMapError(`Initialization failed: ${error.message}`);
        }
      } else {
        setMapError('Failed to initialize map. Please check your connection and try again.');
      }
    }
  }, [checkContainerDimensions]);
  // Effect to initialize map on mount - IMPROVED
  useEffect(() => {
    console.log('Mount effect running, needsToken:', needsToken);
    if (!needsToken) {
      const timer = setTimeout(() => {
        initializeMap();
      }, 100);
      
      return () => {
        clearTimeout(timer);
      };
    }

    return () => {
      if (initTimeoutRef.current) {
        clearTimeout(initTimeoutRef.current);
      }
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [initializeMap, needsToken]);

  const addSmokeLayer = useCallback(() => {
    if (!map.current || !currentLayer || !smokeLayerReady || isUpdatingLayers) {
      console.log('addSmokeLayer skipped - guards failed');
      return;
    }

    setIsUpdatingLayers(true);

    try {
      const currentTimestamp = currentLayer.timestamp.toISOString();
      console.log(`🗺️ MAP UPDATE: Adding NOAA smoke polygons for ${currentTimestamp} with ${currentLayer.data.length} forecast areas`);
      console.log(`🔄 Last timestamp: ${lastLayerTimestamp} → Current: ${currentTimestamp}`);
      
      // Force remove existing layers every time to ensure clean update
      try {
        if (map.current.getLayer('smoke-polygons')) {
          map.current.removeLayer('smoke-polygons');
          console.log('🗑️ Removed existing smoke-polygons layer');
        }
        if (map.current.getLayer('smoke-outlines')) {
          map.current.removeLayer('smoke-outlines');
          console.log('🗑️ Removed existing smoke-outlines layer');
        }
        if (map.current.getSource('smoke-forecast-data')) {
          map.current.removeSource('smoke-forecast-data');
          console.log('🗑️ Removed existing smoke-forecast-data source');
        }
      } catch (e) {
        console.log('Layer cleanup completed (some layers may not have existed)');
      }

      // Filter out polygons with 0 concentration and convert to GeoJSON features
      const validPolygons = currentLayer.data.filter(polygon => 
        polygon.properties.concentration_ugm3 > 0
      );
      
      console.log(`📊 Filtered ${currentLayer.data.length} down to ${validPolygons.length} valid polygons (removing 0 concentration)`);

      const features = validPolygons.map(polygon => ({
        type: 'Feature' as const,
        properties: { 
          smoke_class: polygon.properties.smoke_class,
          smoke_classdesc: polygon.properties.smoke_classdesc,
          concentration: polygon.properties.concentration_ugm3,
          forecast_hour: polygon.properties.forecast_hour || 0
        },
        geometry: polygon.geometry
      }));

      // Add source with NOAA smoke forecast polygons
      map.current.addSource('smoke-forecast-data', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features
        }
      });

      // Fit map to polygons on initial load
      if (features.length > 0 && lastLayerTimestamp === '') {
        try {
          // Use turf.bbox to get bounds
          // If turf is not imported, you may need to add: import bbox from '@turf/bbox';
          // For now, use a simple bounding box calculation
          const allCoords = features.flatMap(f => f.geometry.coordinates.flat(2));
          let minLng = 180, minLat = 90, maxLng = -180, maxLat = -90;
          allCoords.forEach(([lng, lat]) => {
            if (lng < minLng) minLng = lng;
            if (lng > maxLng) maxLng = lng;
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
          });
          if (minLng < maxLng && minLat < maxLat) {
            map.current.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 40, maxZoom: 8 });
            console.log('🗺️ Fit map to initial polygons:', [[minLng, minLat], [maxLng, maxLat]]);
          }
        } catch (e) {
          console.log('Could not fit map to polygons:', e);
        }
      }

      // Add fill layer for smoke polygons with EPA AQI health-based coloring
      map.current.addLayer({
        id: 'smoke-polygons',
        type: 'fill',
        source: 'smoke-forecast-data',
        paint: {
          'fill-color': [
            'case',
            ['<=', ['get', 'concentration'], 2],   'rgb(255, 255, 255)',    // 1-2 μg/m³ - White
            ['<=', ['get', 'concentration'], 4],   'rgb(224, 247, 255)',    // 2-4 μg/m³ - Very Light Blue
            ['<=', ['get', 'concentration'], 6],   'rgb(176, 229, 255)',    // 4-6 μg/m³ - Light Blue
            ['<=', ['get', 'concentration'], 8],   'rgb(128, 210, 255)',    // 6-8 μg/m³ - Medium Blue
            ['<=', ['get', 'concentration'], 12],  'rgb(102, 204, 255)',    // 8-12 μg/m³ - Blue
            ['<=', ['get', 'concentration'], 16],  'rgb(0, 204, 102)',      // 12-16 μg/m³ - Green
            ['<=', ['get', 'concentration'], 20],  'rgb(102, 204, 0)',      // 16-20 μg/m³ - Yellow-Green
            ['<=', ['get', 'concentration'], 25],  'rgb(204, 204, 0)',      // 20-25 μg/m³ - Yellow
            ['<=', ['get', 'concentration'], 30],  'rgb(255, 204, 0)',      // 25-30 μg/m³ - Orange
            ['<=', ['get', 'concentration'], 40],  'rgb(255, 153, 0)',      // 30-40 μg/m³ - Dark Orange
            ['<=', ['get', 'concentration'], 60],  'rgb(255, 102, 0)',      // 40-60 μg/m³ - Red-Orange
            ['<=', ['get', 'concentration'], 100], 'rgb(255, 51, 0)',       // 60-100 μg/m³ - Red
            ['<=', ['get', 'concentration'], 200], 'rgb(204, 0, 51)',       // 100-200 μg/m³ - Purple
            'rgb(153, 0, 153)'                                              // 200+ μg/m³ - Dark Purple
          ],
          'fill-opacity': [
            'interpolate',
            ['linear'],
            ['get', 'concentration'],
            0, 0.4,
            250, 0.8
          ]
        }
      });

      // Add outline layer for better polygon definition with matching colors
      map.current.addLayer({
        id: 'smoke-outlines',
        type: 'line',
        source: 'smoke-forecast-data',
        paint: {
          'line-color': [
            'case',
            ['<=', ['get', 'concentration'], 2],   'rgb(255, 255, 255)',    // 1-2 μg/m³ - White
            ['<=', ['get', 'concentration'], 4],   'rgb(224, 247, 255)',    // 2-4 μg/m³ - Very Light Blue
            ['<=', ['get', 'concentration'], 6],   'rgb(176, 229, 255)',    // 4-6 μg/m³ - Light Blue
            ['<=', ['get', 'concentration'], 8],   'rgb(128, 210, 255)',    // 6-8 μg/m³ - Medium Blue
            ['<=', ['get', 'concentration'], 12],  'rgb(102, 204, 255)',    // 8-12 μg/m³ - Blue
            ['<=', ['get', 'concentration'], 16],  'rgb(0, 204, 102)',      // 12-16 μg/m³ - Green
            ['<=', ['get', 'concentration'], 20],  'rgb(102, 204, 0)',      // 16-20 μg/m³ - Yellow-Green
            ['<=', ['get', 'concentration'], 25],  'rgb(204, 204, 0)',      // 20-25 μg/m³ - Yellow
            ['<=', ['get', 'concentration'], 30],  'rgb(255, 204, 0)',      // 25-30 μg/m³ - Orange
            ['<=', ['get', 'concentration'], 40],  'rgb(255, 153, 0)',      // 30-40 μg/m³ - Dark Orange
            ['<=', ['get', 'concentration'], 60],  'rgb(255, 102, 0)',      // 40-60 μg/m³ - Red-Orange
            ['<=', ['get', 'concentration'], 100], 'rgb(255, 51, 0)',       // 60-100 μg/m³ - Red
            ['<=', ['get', 'concentration'], 200], 'rgb(204, 0, 51)',       // 100-200 μg/m³ - Purple
            'rgb(153, 0, 153)'                                              // 200+ μg/m³ - Dark Purple
          ],
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            5, 1,
            10, 2
          ],
          'line-opacity': 0.8
        }
      });

      // Add click handler for polygon information
      map.current.on('click', 'smoke-polygons', (e) => {
        if (e.features && e.features[0]) {
          const feature = e.features[0];
          const props = feature.properties;
          
          // Determine AQI category based on concentration
          let aqiCategory = 'Good';
          let healthAdvice = 'Air quality is good. Enjoy outdoor activities!';
          
          const concentration = props?.concentration || 0;
          if (concentration > 250) {
            aqiCategory = 'Hazardous';
            healthAdvice = 'Health emergency. Avoid all outdoor activities.';
          } else if (concentration > 150) {
            aqiCategory = 'Very Unhealthy';
            healthAdvice = 'Health alert. Avoid outdoor activities.';
          } else if (concentration > 55) {
            aqiCategory = 'Unhealthy';
            healthAdvice = 'Everyone should limit outdoor activities.';
          } else if (concentration > 35) {
            aqiCategory = 'Unhealthy for Sensitive Groups';
            healthAdvice = 'Sensitive individuals should limit outdoor activities.';
          } else if (concentration > 12) {
            aqiCategory = 'Moderate';
            healthAdvice = 'Moderate air quality. Most people can continue normal activities.';
          }

          // Call onLocationSelect with the smoke data when clicking on polygon
          if (onLocationSelect) {
            reverseGeocode(e.lngLat.lng, e.lngLat.lat).then((locationName) => {
              onLocationSelect(
                [e.lngLat.lng, e.lngLat.lat], 
                locationName,
                {
                  concentration: concentration,
                  forecast_hour: props?.forecast_hour || '0',
                  smoke_class: props?.smoke_class || 1,
                  smoke_classdesc: props?.smoke_classdesc || '',
                  valid_time: props?.valid_time || new Date().toISOString()
                }
              );
            });
          }
          
          new mapboxgl.Popup()
            .setLngLat(e.lngLat)
            .setHTML(`
              <div class="p-3">
                <h4 class="font-semibold text-lg">NOAA Smoke Forecast</h4>
                <div class="mt-2 space-y-1">
                  <p class="text-sm"><strong>Air Quality:</strong> ${aqiCategory}</p>
                  <p class="text-sm"><strong>Concentration:</strong> ${concentration} μg/m³</p>
                  <p class="text-sm"><strong>Forecast Hour:</strong> +${props?.forecast_hour || 0}h</p>
                </div>
                <div class="mt-3 p-2 bg-gray-50 rounded">
                  <p class="text-xs text-gray-600">${healthAdvice}</p>
                </div>
              </div>
            `)
            .addTo(map.current!);
        }
      });

      // Change cursor on hover
      map.current.on('mouseenter', 'smoke-polygons', () => {
        map.current!.getCanvas().style.cursor = 'pointer';
      });

      map.current.on('mouseleave', 'smoke-polygons', () => {
        map.current!.getCanvas().style.cursor = '';
      });

      setLastLayerTimestamp(currentTimestamp);
      console.log('✅ NOAA smoke polygon layers added successfully');
    } catch (error) {
      console.error('❌ Error adding NOAA smoke layers:', error);
    } finally {
      setIsUpdatingLayers(false);
    }
  }, [currentLayer, onLocationSelect, lastLayerTimestamp, smokeLayerReady, isUpdatingLayers]);

  // Add fire hotspots to the map
  const addFireLayer = useCallback(async () => {
    if (!map.current || !isMapLoaded) {
      console.log('addFireLayer skipped - map not ready');
      return;
    }

    try {
      console.log('🔥 Adding fire radiative power data...');
      
      // Remove existing fire layers if they exist
      if (map.current.getLayer('fire-incidents')) {
        map.current.removeLayer('fire-incidents');
      }
      if (map.current.getSource('fire-data')) {
        map.current.removeSource('fire-data');
      }

      // Get current map bounds for targeted fire data
      const bounds = map.current.getBounds();
      const fireData = await fireDataService.fetchFireData({
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest()
      });

      const fireFeatures = fireData.incidents.map(incident => ({
        type: 'Feature' as const,
        properties: {
          IncidentName: incident.IncidentName,
          FireDiscoveryDateTime: incident.FireDiscoveryDateTime,
          ForestTypeGroup: incident.ForestTypeGroup,
          PercentContained: incident.PercentContained,
          DailyAcres: incident.DailyAcres
        },
        geometry: {
          type: 'Point' as const,
          coordinates: [incident.longitude, incident.latitude]
        }
      }));

      // Add fire data source
      map.current.addSource('fire-data', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: fireFeatures
        }
      });

      // Add fire incidents layer (smaller sizes)
      map.current.addLayer({
        id: 'fire-incidents',
        type: 'circle',
        source: 'fire-data',
        paint: {
          'circle-radius': 3,
          'circle-color': '#ff0000',
          'circle-opacity': 0.9,
          'circle-stroke-width': 0.5,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-opacity': 0.9
        }
      });

      // Add click handler for fire incidents
      map.current.on('click', 'fire-incidents', (e) => {
        if (e.features && e.features[0]) {
          const feature = e.features[0];
          const props = feature.properties;

          new mapboxgl.Popup()
            .setLngLat(e.lngLat)
            .setHTML(`
              <div class="p-3">
                <h4 class="font-semibold text-lg flex items-center">
                  🔥 Wildfire Incident
                </h4>
                <div class="mt-2 space-y-1">
                  <p class="text-sm"><strong>Incident Name:</strong> ${props?.IncidentName || 'Not Available'}</p>
                  <p class="text-sm"><strong>Start Date:</strong> ${props?.FireDiscoveryDateTime || 'Not Available'}</p>
                  <p class="text-sm"><strong>Forest Type:</strong> ${props?.ForestTypeGroup || 'Not Available'}</p>
                  <p class="text-sm"><strong>Percent Contained:</strong> ${props?.PercentContained !== undefined ? props.PercentContained + '%' : 'Not Available'}</p>
                  <p class="text-sm"><strong>Acres:</strong> ${props?.DailyAcres !== undefined ? props.DailyAcres.toLocaleString() : 'Not Available'}</p>
                </div>
              </div>
            `)
            .addTo(map.current!);
        }
      });

      // Change cursor on hover
      map.current.on('mouseenter', 'fire-incidents', () => {
        map.current!.getCanvas().style.cursor = 'pointer';
      });

      map.current.on('mouseleave', 'fire-incidents', () => {
        map.current!.getCanvas().style.cursor = '';
      });

      setFireDataLoaded(true);
      console.log('✅ Fire radiative power data added successfully to map');
    } catch (error) {
      console.error('❌ Error adding fire data:', error);
    }
  }, [isMapLoaded]);

  // Add fire data when map is loaded
  useEffect(() => {
    if (isMapLoaded && !fireDataLoaded) {
      addFireLayer();
    }
  }, [isMapLoaded, fireDataLoaded, addFireLayer]);


  // Unified effect: Render polygons as soon as map, smoke data, and currentLayer are ready
  useEffect(() => {
    console.log('🟢 [SmokeMap.tsx] Unified effect running');
    const currentTimestamp = currentLayer?.timestamp?.toISOString() || '';
    const selectedTimestamp = selectedTime?.toISOString() || '';
    console.log('🔄 MAP EFFECT (UNIFIED):');
    console.log(`   Checking the updates... HELLO...`);
    console.log(`  map ready:`, !!map.current);
    console.log(`  currentLayer exists:`, !!currentLayer);
    console.log(`  currentLayer time:`, currentTimestamp);
    console.log(`  selectedTime:`, selectedTimestamp);
    console.log(`  currentLayer data length:`, currentLayer?.data?.length || 0);
    console.log(`  smokeLayerReady:`, smokeLayerReady);
    console.log(`  isUpdatingLayers:`, isUpdatingLayers);
    console.log(`  lastLayerTimestamp:`, lastLayerTimestamp);

    // Only render polygons if map is ready, smoke data is ready, and currentLayer exists
    if (
      map.current &&
      currentLayer &&
      smokeLayerReady &&
      !isUpdatingLayers &&
      map.current.isStyleLoaded()
    ) {
      // Only update if timestamp changed or it's the initial load
      if (lastLayerTimestamp !== currentTimestamp) {
        console.log('✅ MAP EFFECT: Rendering polygons for timestamp:', currentTimestamp);
        addSmokeLayer();
        setLastLayerTimestamp(currentTimestamp);
      } else {
        console.log('🔄 MAP EFFECT: Timestamp unchanged, skipping update');
      }
    } else {
      console.log('� MAP EFFECT: Guards failed, skipping update');
    }
  }, [currentLayer, smokeLayerReady, isUpdatingLayers, lastLayerTimestamp, addSmokeLayer, selectedTime, isMapLoaded]);

  const reverseGeocode = async (lng: number, lat: number): Promise<string> => {
    try {
      if (!hasValidMapboxToken()) {
        return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      }

      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${config.mapboxToken}`
      );
      
      if (!response.ok) {
        throw new Error('Geocoding request failed');
      }
      
      const data = await response.json();
      
      if (data.features && data.features.length > 0) {
        return data.features[0].place_name;
      }
      return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    } catch (error) {
      console.error('Reverse geocoding failed:', error);
      return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
  };

  const debouncedSearch = useCallback(
    debounce(async (searchTerm: string) => {
      if (!searchTerm.trim() || !hasValidMapboxToken()) return;

      const sanitizedInput = sanitizeSearchInput(searchTerm);
      
      if (!validateSearchInput(sanitizedInput)) {
        console.warn('Invalid search input detected');
        return;
      }

      try {
        const response = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(sanitizedInput)}.json?country=us&access_token=${config.mapboxToken}`
        );
        
        if (!response.ok) {
          throw new Error('Search request failed');
        }
        
        const data = await response.json();
        
        if (data.features && data.features.length > 0) {
          const [lng, lat] = data.features[0].center;
          const placeName = data.features[0].place_name;
          
          if (marker.current) {
            marker.current.remove();
          }
          
          if (map.current) {
            marker.current = new mapboxgl.Marker({
              color: '#2563eb'
            })
              .setLngLat([lng, lat])
              .addTo(map.current);

            map.current.flyTo({
              center: [lng, lat],
              zoom: 6,
              duration: 2000
            });

            if (onLocationSelect) {
              onLocationSelect([lng, lat], placeName);
            }
            
            if (onCitySearch) {
              onCitySearch({ lat, lng }, placeName);
            }
          }
        }
      } catch (error) {
        console.error('Geocoding failed:', error);
      }
    }, 500),
    [onLocationSelect, onCitySearch]
  );

  const handleSearch = () => {
    const sanitizedInput = sanitizeSearchInput(searchValue);
    if (validateSearchInput(sanitizedInput)) {
      debouncedSearch(sanitizedInput);
    }
  };

  const handleSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Don't sanitize spaces from the input, just set the raw value
    const value = e.target.value;
    setSearchValue(value);
  };

  const handleRetry = () => {
    setMapError('');
    setIsMapLoaded(false);
    setIsInitializing(false);
    setNeedsToken(false);
    initializeMap();
  };

  const handleTokenSet = () => {
    console.log('Token set successfully, reinitializing map...');
    setNeedsToken(false);
    setMapError('');
    setIsInitializing(false);
    setIsMapLoaded(false);
    // Small delay to ensure state is updated
    setTimeout(() => {
      initializeMap();
    }, 100);
  };

  // Show token input if needed
  if (needsToken) {
    return <MapboxTokenInput onTokenSet={handleTokenSet} />;
  }

  if (mapError && !isInitializing) {
    return (
      <div className="relative w-full h-full bg-sky-gradient flex items-center justify-center">
        <Card className="p-6 max-w-md mx-4 border-destructive">
          <div className="space-y-4 text-center">
            <div className="flex items-center justify-center space-x-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <h3 className="text-lg font-semibold">Map Error</h3>
            </div>
            <p className="text-sm text-muted-foreground">{mapError}</p>
            <Button onClick={handleRetry} variant="default" className="flex items-center space-x-2">
              <RefreshCw className="h-4 w-4" />
              <span>Retry</span>
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      {/* Loading Indicator */}
      {(isInitializing || !isMapLoaded || isSmokeLoading || !smokeLayerReady) && (
        <div className="absolute inset-0 bg-sky-gradient flex items-center justify-center z-20">
          <Card className="p-4">
            <div className="text-center">
              <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-2"></div>
              <p className="text-sm text-muted-foreground">
                {isInitializing ? 'Initializing map...' : 
                 !smokeLayerReady ? 'Preparing map layers...' :
                 isSmokeLoading ? 'Loading NOAA smoke forecast...' : 'Loading map...'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Fetching real government data</p>
            </div>
          </Card>
        </div>
      )}

      {/* Search Controls */}
      <div className="absolute top-4 left-4 z-10 bg-background/95 backdrop-blur-sm rounded-lg shadow-lg border">
        <div className="flex items-center p-2">
          <div className="flex items-center flex-1 min-w-0">
            <Search className="h-4 w-4 text-muted-foreground mr-2" />
            <Input
              placeholder="Search city, ZIP code..."
              value={searchValue}
              onChange={handleSearchInputChange}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
              disabled={!isMapLoaded}
              maxLength={100}
            />
          </div>
          <Button 
            size="sm" 
            onClick={handleSearch} 
            className="ml-2"
            disabled={!isMapLoaded || !searchValue.trim()}
          >
            <MapPin className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Map Container */}
      <div 
        ref={mapContainer} 
        className="absolute inset-0 rounded-lg" 
        style={{ 
          width: '100%', 
          height: '100%',
          minHeight: '400px'
        }} 
      />
      
      {/* Map Instructions */}
      <div className="absolute bottom-16 left-4 bg-background/95 backdrop-blur-sm rounded-lg shadow-lg border p-3 text-sm text-muted-foreground max-w-xs">
        {isMapLoaded ? (
          <div className="space-y-1">
            {currentLayer ? 
              <div>Showing NOAA smoke forecast for {currentLayer.timestamp.toLocaleString()} with {currentLayer.data.length} polygon areas</div> :
              <div>No smoke forecast data available for selected time</div>
            }
            {fireDataLoaded && (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                <span>Active fire sources displayed</span>
              </div>
            )}
          </div>
        ) : (
          "Loading NOAA smoke forecast data..."
        )}
      </div>
    </div>
  );
export default SmokeMap;
