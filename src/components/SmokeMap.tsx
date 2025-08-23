import React, { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, MapPin, AlertCircle, RefreshCw } from 'lucide-react';
import { fireDataService } from '../services/fireDataService';

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
  const [fireDataError, setFireDataError] = useState<string>('');
  const initTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Hardcoded Mapbox token
  const mapboxToken = 'pk.eyJ1IjoicnlndXltYXBzIiwiYSI6ImNtZTA3aHIxdTAxeDAybXBueDkxNXpyeG4ifQ.dso9vFYkY2QScoQ_4H86SQ';
  
  // Add loading state for when we don't have a current layer
  const isSmokeLoading = !currentLayer;

  // Check if container has proper dimensions
  const checkContainerDimensions = useCallback((): boolean => {
    if (!mapContainer.current) return false;
    const rect = mapContainer.current.getBoundingClientRect();
    const hasValidDimensions = rect.width > 0 && rect.height > 0;
    console.log('Container dimensions:', { width: rect.width, height: rect.height, valid: hasValidDimensions });
    return hasValidDimensions;
  }, []);

  // Initialize map with proper error handling
  const initializeMap = useCallback(async () => {
    if (!mapContainer.current) {
      console.log('Map initialization skipped - container missing');
      return;
    }

    if (!checkContainerDimensions()) {
      console.log('Container not ready, retrying in 100ms...');
      setTimeout(() => initializeMap(), 100);
      return;
    }

    try {
      setIsInitializing(true);
      setMapError('');
      console.log('Setting Mapbox token and initializing map...');
      
      mapboxgl.accessToken = mapboxToken;
      
      if (map.current) {
        console.log('Removing existing map');
        map.current.remove();
        map.current = null;
      }

      if (initTimeoutRef.current) {
        clearTimeout(initTimeoutRef.current);
      }

      setIsMapLoaded(false);
      
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

      map.current.on('load', () => {
        console.log('🗺️ Map load event fired - setting loaded state');
        loadEventFired = true;
        setIsMapLoaded(true);
        setIsInitializing(false);
        
        // Immediately try to add smoke layer if we have data
        if (currentLayer) {
          console.log('🔥 Map loaded with existing currentLayer - adding smoke immediately');
          setTimeout(() => addSmokeLayer(), 100);
        }
        
        // Load fire data
        setTimeout(() => addFireLayer(), 200);
      });

      map.current.on('style.load', () => {
        console.log('Map style loaded');
      });

      map.current.on('error', (e) => {
        console.error('Map error event:', e.error);
        setIsInitializing(false);
        
        if (e.error?.message?.includes('Unauthorized')) {
          setMapError('Invalid Mapbox token. Please check your token and try again.');
        } else if (e.error?.message?.includes('Network')) {
          setMapError('Network error. Please check your connection and try again.');
        } else {
          setMapError(`Map error: ${e.error?.message || 'Unknown error'}`);
        }
      });

      initTimeoutRef.current = setTimeout(() => {
        console.log('Timeout reached - checking map state...');
        if (map.current && !loadEventFired) {
          console.log('Force loading map due to timeout');
          setIsMapLoaded(true);
          setIsInitializing(false);
        }
      }, 5000);

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
        if (error.message.includes('Unauthorized')) {
          setMapError('Invalid Mapbox token. Please verify your token is correct.');
        } else if (error.message.includes('container')) {
          setMapError('Map container error. Please try refreshing the page.');
        } else {
          setMapError(`Initialization failed: ${error.message}`);
        }
      } else {
        setMapError('Failed to initialize map. Please check your connection and try again.');
      }
    }
  }, [checkContainerDimensions, currentLayer]);

  // Effect to initialize map on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      initializeMap();
    }, 100);
    
    return () => {
      clearTimeout(timer);
      if (initTimeoutRef.current) {
        clearTimeout(initTimeoutRef.current);
      }
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [initializeMap]);

  const addSmokeLayer = useCallback(() => {
    if (!map.current || !currentLayer) {
      console.log('🚫 addSmokeLayer skipped - map loaded:', !!map.current, 'currentLayer:', !!currentLayer);
      return;
    }

    // Check if map style is loaded (more reliable than isMapLoaded on mobile)
    if (!map.current.isStyleLoaded()) {
      console.log('⏳ Map style not loaded yet, retrying in 500ms...');
      setTimeout(() => addSmokeLayer(), 500);
      return;
    }

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
    }
  }, [currentLayer, onLocationSelect, lastLayerTimestamp]);

  // Add fire hotspots to the map - IMPROVED WITH BETTER ERROR HANDLING
  const addFireLayer = useCallback(async () => {
    if (!map.current || !isMapLoaded) {
      console.log('🔥 addFireLayer skipped - map not ready');
      return;
    }

    try {
      console.log('🔥 Starting fire data fetch...');
      setFireDataError('');
      
      // Remove existing fire layers if they exist
      try {
        if (map.current.getLayer('fire-incidents')) {
          map.current.removeLayer('fire-incidents');
          console.log('🗑️ Removed existing fire-incidents layer');
        }
        if (map.current.getSource('fire-data')) {
          map.current.removeSource('fire-data');
          console.log('🗑️ Removed existing fire-data source');
        }
      } catch (e) {
        console.log('Fire layer cleanup completed');
      }

      // Get current map bounds for targeted fire data
      const bounds = map.current.getBounds();
      console.log('🗺️ Map bounds:', {
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest()
      });

      const fireData = await fireDataService.fetchFireData({
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest()
      });

      console.log(`🔥 Received fire data: ${fireData.incidents.length} incidents, ${fireData.perimeters.length} perimeters`);

      if (fireData.incidents.length === 0) {
        console.log('🔥 No fire incidents in current map bounds');
        setFireDataLoaded(true);
        return;
      }

      const fireFeatures = fireData.incidents.map((incident, index) => {
        console.log(`🔥 Processing incident ${index}:`, {
          name: incident.IncidentName,
          lat: incident.latitude,
          lng: incident.longitude,
          acres: incident.DailyAcres
        });
        
        return {
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
        };
      });

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
          'circle-radius': 4,
          'circle-color': '#ff0000',
          'circle-opacity': 1.0,
          'circle-stroke-width': 1,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-opacity': 1.0
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
      console.log('✅ Fire data added successfully');
    } catch (error) {
      console.error('❌ Error adding fire data:', error);
      setFireDataError(`Failed to load fire data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [isMapLoaded]);

  // Add fire data when map is loaded - IMPROVED TIMING
  useEffect(() => {
    if (isMapLoaded && !fireDataLoaded && !fireDataError) {
      console.log('🔥 Map ready, attempting to load fire data...');
      // Add a small delay to ensure map is fully ready
      setTimeout(() => addFireLayer(), 1000);
    }
  }, [isMapLoaded, fireDataLoaded, fireDataError, addFireLayer]);

  // Update smoke layer when data changes - IMPROVED WITH FORCE UPDATE TRACKING
  useEffect(() => {
    const currentTimestamp = currentLayer?.timestamp.toISOString() || '';
    console.log('🔄 MAP EFFECT: currentLayer time:', currentTimestamp);
    console.log('🔄 MAP EFFECT: map exists:', !!map.current, 'layer exists:', !!currentLayer);
    console.log('🔄 MAP EFFECT: isMapLoaded:', isMapLoaded);
    
    if (map.current && currentLayer && isMapLoaded) {
      // Always trigger update
      console.log('📍 Triggering addSmokeLayer for time:', currentTimestamp);
      addSmokeLayer();
    }
  }, [currentLayer, addSmokeLayer, isMapLoaded]);

  const reverseGeocode = async (lng: number, lat: number): Promise<string> => {
    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${mapboxToken}`
      );
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

  const handleSearch = async () => {
    if (!searchValue.trim()) return;

    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(searchValue)}.json?country=us&access_token=${mapboxToken}`
      );
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
            zoom: 7,
            duration: 2000
          });

          if (onLocationSelect) {
            onLocationSelect([lng, lat], placeName);
          }
          
          // Trigger city search callback for forecast
          if (onCitySearch) {
            onCitySearch({ lat, lng }, placeName);
          }
        }
      }
    } catch (error) {
      console.error('Geocoding failed:', error);
    }
  };

  const handleRetry = () => {
    setMapError('');
    setIsMapLoaded(false);
    setIsInitializing(false);
    initializeMap();
  };

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
      {(isInitializing || !isMapLoaded || isSmokeLoading) && (
        <div className="absolute inset-0 bg-sky-gradient flex items-center justify-center z-20">
          <Card className="p-4">
            <div className="text-center">
              <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-2"></div>
              <p className="text-sm text-muted-foreground">
                {isInitializing ? 'Initializing map...' : isSmokeLoading ? 'Loading NOAA smoke forecast...' : 'Loading map...'}
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
              onChange={(e) => setSearchValue(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
              disabled={!isMapLoaded}
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
      
      {/* Map Instructions - IMPROVED WITH FIRE STATUS */}
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
            {fireDataError && (
              <div className="flex items-center gap-2 text-orange-600">
                <AlertCircle className="w-3 h-3" />
                <span className="text-xs">Fire data unavailable</span>
              </div>
            )}
          </div>
        ) : (
          "Loading NOAA smoke forecast data..."
        )}
      </div>
    </div>
  );
};

export default SmokeMap;
