import React, { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, MapPin, AlertCircle, RefreshCw } from 'lucide-react';

interface SmokeLayer {
  timestamp: Date;
  data: any[];
}

interface SmokeMapProps {
  onLocationSelect?: (coordinates: [number, number], locationName: string, smokeData?: any) => void;
  selectedTime?: Date;
  currentLayer?: SmokeLayer | null;
}

const SmokeMap: React.FC<SmokeMapProps> = ({ onLocationSelect, selectedTime, currentLayer }) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const marker = useRef<mapboxgl.Marker | null>(null);
  const [searchValue, setSearchValue] = useState('');
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string>('');
  const [isInitializing, setIsInitializing] = useState(false);
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
        console.log('Map load event fired - setting loaded state');
        loadEventFired = true;
        setIsMapLoaded(true);
        setIsInitializing(false);
        // addSmokeLayer will be called by useEffect when isMapLoaded becomes true
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
  }, [checkContainerDimensions]);

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
      console.log('addSmokeLayer skipped - map loaded:', !!map.current, 'currentLayer:', !!currentLayer);
      return;
    }

    try {
      console.log(`🗺️ MAP UPDATE: Adding NOAA smoke polygons for ${currentLayer.timestamp.toISOString()} with ${currentLayer.data.length} forecast areas`);
      
      // Remove existing smoke layers if they exist
      if (map.current.getLayer('smoke-polygons')) {
        map.current.removeLayer('smoke-polygons');
      }
      if (map.current.getLayer('smoke-outlines')) {
        map.current.removeLayer('smoke-outlines');
      }
      if (map.current.getSource('smoke-forecast-data')) {
        map.current.removeSource('smoke-forecast-data');
      }

      // Filter out polygons with 0 concentration and convert to GeoJSON features
      const validPolygons = currentLayer.data.filter(polygon => 
        polygon.properties.concentration_ugm3 > 0
      );
      
      console.log(`Filtered ${currentLayer.data.length} down to ${validPolygons.length} valid polygons (removing 0 concentration)`);

      const features = validPolygons.map(polygon => ({
        type: 'Feature' as const,
        properties: { 
          smoke_class: polygon.properties.smoke_class,
          smoke_classdesc: polygon.properties.smoke_classdesc,
          concentration: polygon.properties.concentration_ugm3,
          forecast_hour: polygon.properties.forecast_hour
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
            ['<=', ['get', 'concentration'], 12],  'rgb(0, 228, 0)',        // 0-12 μg/m³ Good - Green
            ['<=', ['get', 'concentration'], 35],  'rgb(255, 255, 0)',      // 12-35 μg/m³ Moderate - Yellow
            ['<=', ['get', 'concentration'], 55],  'rgb(255, 126, 0)',      // 35-55 μg/m³ Unhealthy for Sensitive - Orange
            ['<=', ['get', 'concentration'], 150], 'rgb(255, 0, 0)',        // 55-150 μg/m³ Unhealthy - Red
            ['<=', ['get', 'concentration'], 250], 'rgb(143, 63, 151)',     // 150-250 μg/m³ Very Unhealthy - Purple
            'rgb(126, 0, 35)'                                               // 250+ μg/m³ Hazardous - Maroon
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
            ['<=', ['get', 'concentration'], 12], 'rgb(0, 228, 0)',        // Good - Green
            ['<=', ['get', 'concentration'], 35], 'rgb(255, 255, 0)',      // Moderate - Yellow
            ['<=', ['get', 'concentration'], 55], 'rgb(255, 126, 0)',      // Unhealthy for Sensitive - Orange
            ['<=', ['get', 'concentration'], 150], 'rgb(255, 0, 0)',       // Unhealthy - Red
            ['<=', ['get', 'concentration'], 250], 'rgb(143, 63, 151)',    // Very Unhealthy - Purple
            'rgb(126, 0, 35)'                                              // Hazardous - Maroon
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

      console.log('✅ NOAA smoke polygon layers added successfully');
    } catch (error) {
      console.error('❌ Error adding NOAA smoke layers:', error);
    }
  }, [currentLayer, onLocationSelect]);

  // Update smoke layer when data changes
  useEffect(() => {
    console.log('🔄 MAP EFFECT: isMapLoaded:', isMapLoaded, 'currentLayer time:', currentLayer?.timestamp.toISOString());
    if (isMapLoaded && currentLayer) {
      console.log('📍 Triggering addSmokeLayer for time:', currentLayer.timestamp.toISOString());
      addSmokeLayer();
    }
  }, [isMapLoaded, currentLayer, addSmokeLayer]);

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
            zoom: 10,
            duration: 2000
          });

          if (onLocationSelect) {
            onLocationSelect([lng, lat], placeName);
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
      
      {/* Map Instructions */}
      <div className="absolute bottom-4 left-4 bg-background/95 backdrop-blur-sm rounded-lg shadow-lg border p-3 text-sm text-muted-foreground max-w-xs">
        {isMapLoaded ? (
          currentLayer ? 
            `Showing NOAA smoke forecast for ${currentLayer.timestamp.toLocaleString()} with ${currentLayer.data.length} polygon areas` :
            "No smoke forecast data available for selected time"
        ) : (
          "Loading NOAA smoke forecast data..."
        )}
      </div>
    </div>
  );
};

export default SmokeMap;
