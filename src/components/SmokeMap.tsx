import React, { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, MapPin, AlertCircle, RefreshCw } from 'lucide-react';
import { useSmokeData } from '@/hooks/useSmokeData';

interface SmokeMapProps {
  onLocationSelect?: (coordinates: [number, number], locationName: string) => void;
  selectedTime?: Date;
}

const SmokeMap: React.FC<SmokeMapProps> = ({ onLocationSelect, selectedTime }) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const marker = useRef<mapboxgl.Marker | null>(null);
  const [searchValue, setSearchValue] = useState('');
  const [mapboxToken, setMapboxToken] = useState('');
  const [showTokenInput, setShowTokenInput] = useState(true);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string>('');
  const [isInitializing, setIsInitializing] = useState(false);
  const initTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Use the smoke data hook
  const { currentLayer, isLoading: isSmokeLoading } = useSmokeData(selectedTime);

  // Load token from localStorage on mount
  useEffect(() => {
    const savedToken = localStorage.getItem('mapboxToken');
    if (savedToken && validateToken(savedToken)) {
      setMapboxToken(savedToken);
      setShowTokenInput(false);
    }
  }, []);

  // Validate Mapbox token format
  const validateToken = (token: string): boolean => {
    return token.startsWith('pk.') && token.length > 20;
  };

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
    if (!mapContainer.current || !mapboxToken) {
      console.log('Map initialization skipped - container or token missing');
      return;
    }

    if (!validateToken(mapboxToken)) {
      setMapError('Invalid Mapbox token format. Please check your token.');
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
  }, [mapboxToken, checkContainerDimensions]);

  // Effect to initialize map when token changes
  useEffect(() => {
    if (!showTokenInput && mapboxToken) {
      const timer = setTimeout(() => {
        initializeMap();
      }, 100);
      
      return () => clearTimeout(timer);
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
  }, [showTokenInput, mapboxToken, initializeMap]);

  const addSmokeLayer = useCallback(() => {
    if (!map.current || !currentLayer) return;

    try {
      console.log(`Adding NOAA smoke polygons with ${currentLayer.data.length} forecast areas`);
      
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

      // Convert NOAA polygon data to GeoJSON features
      const features = currentLayer.data.map(polygon => ({
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

      // Add fill layer for smoke polygons with concentration-based coloring
      map.current.addLayer({
        id: 'smoke-polygons',
        type: 'fill',
        source: 'smoke-forecast-data',
        paint: {
          'fill-color': [
            'case',
            ['<', ['get', 'concentration'], 12], 'rgba(34, 197, 94, 0.4)',
            ['<', ['get', 'concentration'], 35], 'rgba(234, 179, 8, 0.5)',
            ['<', ['get', 'concentration'], 55], 'rgba(249, 115, 22, 0.6)',
            ['<', ['get', 'concentration'], 150], 'rgba(239, 68, 68, 0.7)',
            'rgba(127, 29, 29, 0.8)'
          ],
          'fill-opacity': [
            'interpolate',
            ['linear'],
            ['get', 'concentration'],
            0, 0.3,
            250, 0.8
          ]
        }
      });

      // Add outline layer for better polygon definition
      map.current.addLayer({
        id: 'smoke-outlines',
        type: 'line',
        source: 'smoke-forecast-data',
        paint: {
          'line-color': [
            'case',
            ['<', ['get', 'concentration'], 12], 'rgba(34, 197, 94, 0.8)',
            ['<', ['get', 'concentration'], 35], 'rgba(234, 179, 8, 0.8)',
            ['<', ['get', 'concentration'], 55], 'rgba(249, 115, 22, 0.8)',
            ['<', ['get', 'concentration'], 150], 'rgba(239, 68, 68, 0.8)',
            'rgba(127, 29, 29, 0.8)'
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
          
          new mapboxgl.Popup()
            .setLngLat(e.lngLat)
            .setHTML(`
              <div class="p-2">
                <h4 class="font-semibold">NOAA Smoke Forecast</h4>
                <p class="text-sm">Level: ${props?.smoke_classdesc || 'Unknown'}</p>
                <p class="text-sm">Concentration: ${props?.concentration || 0} μg/m³</p>
                <p class="text-sm">Forecast Hour: ${props?.forecast_hour || 0}</p>
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

      console.log('NOAA smoke polygon layers added successfully');
    } catch (error) {
      console.error('Error adding NOAA smoke layers:', error);
    }
  }, [currentLayer]);

  // Update smoke layer when data changes
  useEffect(() => {
    if (isMapLoaded && currentLayer) {
      addSmokeLayer();
    }
  }, [isMapLoaded, currentLayer, addSmokeLayer]);

  const reverseGeocode = async (lng: number, lat: number) => {
    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${mapboxToken}`
      );
      const data = await response.json();
      
      if (data.features && data.features.length > 0) {
        const placeName = data.features[0].place_name;
        if (onLocationSelect) {
          onLocationSelect([lng, lat], placeName);
        }
      }
    } catch (error) {
      console.error('Reverse geocoding failed:', error);
    }
  };

  const handleSearch = async () => {
    if (!searchValue.trim() || !mapboxToken) return;

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

  const handleTokenSubmit = () => {
    const trimmedToken = mapboxToken.trim();
    
    if (!validateToken(trimmedToken)) {
      setMapError('Invalid token format. Mapbox tokens should start with "pk." and be longer than 20 characters.');
      return;
    }

    localStorage.setItem('mapboxToken', trimmedToken);
    setMapError('');
    setShowTokenInput(false);
  };

  const handleRetry = () => {
    setMapError('');
    setIsMapLoaded(false);
    setIsInitializing(false);
    if (showTokenInput) {
      setShowTokenInput(false);
    }
    initializeMap();
  };

  const handleUseNewToken = () => {
    localStorage.removeItem('mapboxToken');
    setMapboxToken('');
    setMapError('');
    setShowTokenInput(true);
    setIsMapLoaded(false);
    setIsInitializing(false);
    
    if (map.current) {
      map.current.remove();
      map.current = null;
    }
  };

  if (showTokenInput) {
    return (
      <div className="relative w-full h-full bg-sky-gradient flex items-center justify-center">
        <Card className="p-6 max-w-md mx-4">
          <div className="space-y-4">
            <div className="text-center">
              <h3 className="text-lg font-semibold mb-2">Enter Mapbox Token</h3>
              <p className="text-sm text-muted-foreground">
                Please enter your Mapbox public token to load the interactive map. 
                Get yours at <a href="https://mapbox.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">mapbox.com</a>
              </p>
            </div>
            <div className="space-y-2">
              <Input
                type="password"
                placeholder="pk.eyJ1IjoiZXhhbXBsZSIsImEiOiJ..."
                value={mapboxToken}
                onChange={(e) => setMapboxToken(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleTokenSubmit()}
              />
              {mapError && (
                <div className="flex items-center space-x-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  <span>{mapError}</span>
                </div>
              )}
              <Button onClick={handleTokenSubmit} className="w-full" disabled={!mapboxToken.trim()}>
                Load Map
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
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
            <div className="flex flex-col space-y-2">
              <Button onClick={handleRetry} variant="default" className="flex items-center space-x-2">
                <RefreshCw className="h-4 w-4" />
                <span>Retry</span>
              </Button>
              <Button onClick={handleUseNewToken} variant="outline">
                Use Different Token
              </Button>
            </div>
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
            `Displaying NOAA smoke forecast with ${currentLayer.data.length} polygon areas` :
            "Click anywhere on the map or search for a location to view smoke forecasts"
        ) : (
          "Loading NOAA smoke forecast data..."
        )}
      </div>

      {/* Token management button */}
      {isMapLoaded && (
        <div className="absolute top-4 right-16 z-10">
          <Button 
            size="sm" 
            variant="outline"
            onClick={handleUseNewToken}
            className="bg-background/95 backdrop-blur-sm"
          >
            Change Token
          </Button>
        </div>
      )}
    </div>
  );
};

export default SmokeMap;
