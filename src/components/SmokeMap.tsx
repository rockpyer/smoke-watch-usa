import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, MapPin } from 'lucide-react';

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

  useEffect(() => {
    if (!mapContainer.current || !mapboxToken) return;

    try {
      mapboxgl.accessToken = mapboxToken;
      
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/satellite-streets-v12',
        center: [-98.5795, 39.8283], // Center of USA
        zoom: 4,
        pitch: 0,
      });

    // Add navigation controls
    map.current.addControl(
      new mapboxgl.NavigationControl({
        visualizePitch: false,
      }),
      'top-right'
    );

      // Add geolocate control
      map.current.addControl(
        new mapboxgl.GeolocateControl({
          positionOptions: {
            enableHighAccuracy: true
          },
          trackUserLocation: true,
          showUserHeading: true
        }),
        'top-right'
      );

      // Map load event
      map.current.on('load', () => {
        console.log('Map loaded successfully');
        setIsMapLoaded(true);
        addSmokeLayer();
      });

      // Map error event
      map.current.on('error', (e) => {
        console.error('Map error:', e);
        setMapError('Failed to load map. Please check your Mapbox token.');
      });

      // Add click handler for location selection
      map.current.on('click', (e) => {
        if (!isMapLoaded) return;
        
        const { lng, lat } = e.lngLat;
        
        // Remove existing marker
        if (marker.current) {
          marker.current.remove();
        }
        
        // Add new marker
        marker.current = new mapboxgl.Marker({
          color: '#2563eb'
        })
          .setLngLat([lng, lat])
          .addTo(map.current!);

        // Reverse geocode to get location name
        reverseGeocode(lng, lat);
        
        if (onLocationSelect) {
          onLocationSelect([lng, lat], `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        }
      });

      // Add smoke overlay when map loads
      map.current.on('load', () => {
        addSmokeLayer();
      });

    } catch (error) {
      console.error('Failed to initialize map:', error);
      setMapError('Failed to initialize map. Please check your Mapbox token and try again.');
    }

    return () => {
      if (map.current) {
        map.current.remove();
      }
    };
  }, [mapboxToken]);

  const addSmokeLayer = () => {
    if (!map.current) return;

    // Add a sample smoke data layer (in a real app, this would come from NOAA/weather APIs)
    map.current.addSource('smoke-data', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: generateSampleSmokeData()
      }
    });

    map.current.addLayer({
      id: 'smoke-layer',
      type: 'fill',
      source: 'smoke-data',
      paint: {
        'fill-color': [
          'case',
          ['==', ['get', 'level'], 'good'], 'rgba(34, 197, 94, 0.3)',
          ['==', ['get', 'level'], 'moderate'], 'rgba(234, 179, 8, 0.4)',
          ['==', ['get', 'level'], 'unhealthy-sensitive'], 'rgba(249, 115, 22, 0.5)',
          ['==', ['get', 'level'], 'unhealthy'], 'rgba(239, 68, 68, 0.6)',
          ['==', ['get', 'level'], 'very-unhealthy'], 'rgba(190, 18, 60, 0.7)',
          'rgba(127, 29, 29, 0.8)' // hazardous
        ],
        'fill-opacity': 0.7
      }
    });

    map.current.addLayer({
      id: 'smoke-outline',
      type: 'line',
      source: 'smoke-data',
      paint: {
        'line-color': '#ffffff',
        'line-width': 1,
        'line-opacity': 0.5
      }
    });
  };

  const generateSampleSmokeData = () => {
    // Sample smoke data for demonstration
    return [
      {
        type: 'Feature' as const,
        properties: { level: 'moderate' },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [[
            [-120, 35], [-118, 35], [-118, 37], [-120, 37], [-120, 35]
          ]]
        }
      },
      {
        type: 'Feature' as const,
        properties: { level: 'unhealthy-sensitive' },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [[
            [-122, 38], [-120, 38], [-120, 40], [-122, 40], [-122, 38]
          ]]
        }
      },
      {
        type: 'Feature' as const,
        properties: { level: 'unhealthy' },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [[
            [-115, 39], [-113, 39], [-113, 41], [-115, 41], [-115, 39]
          ]]
        }
      }
    ];
  };

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
    if (!searchValue.trim() || !mapboxToken || !isMapLoaded) {
      console.log('Search conditions not met:', { searchValue: !!searchValue.trim(), mapboxToken: !!mapboxToken, isMapLoaded });
      return;
    }

    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(searchValue)}.json?country=us&access_token=${mapboxToken}`
      );
      const data = await response.json();
      
      if (data.features && data.features.length > 0) {
        const [lng, lat] = data.features[0].center;
        const placeName = data.features[0].place_name;
        
        // Remove existing marker
        if (marker.current) {
          marker.current.remove();
        }
        
        // Only add marker if map is loaded and available
        if (map.current && isMapLoaded) {
          // Add new marker
          marker.current = new mapboxgl.Marker({
            color: '#2563eb'
          })
            .setLngLat([lng, lat])
            .addTo(map.current);

          // Fly to location
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
    if (mapboxToken.trim()) {
      setShowTokenInput(false);
      setMapError('');
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
                Get yours at <a href="https://mapbox.com/" target="_blank" className="text-primary hover:underline">mapbox.com</a>
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
              <Button onClick={handleTokenSubmit} className="w-full">
                Load Map
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  if (mapError) {
    return (
      <div className="relative w-full h-full bg-sky-gradient flex items-center justify-center">
        <Card className="p-6 max-w-md mx-4 border-destructive">
          <div className="space-y-4 text-center">
            <h3 className="text-lg font-semibold text-destructive">Map Error</h3>
            <p className="text-sm text-muted-foreground">{mapError}</p>
            <Button 
              onClick={() => {
                setMapError('');
                setShowTokenInput(true);
              }} 
              variant="outline"
            >
              Try Again
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (showTokenInput) {
    return (
      <div className="relative w-full h-full bg-sky-gradient flex items-center justify-center">
        <Card className="p-6 max-w-md mx-4">
          <div className="space-y-4">
            <div className="text-center">
              <h3 className="text-lg font-semibold mb-2">Enter Mapbox Token</h3>
              <p className="text-sm text-muted-foreground">
                Please enter your Mapbox public token to load the interactive map. 
                Get yours at <a href="https://mapbox.com/" target="_blank" className="text-primary hover:underline">mapbox.com</a>
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
              <Button onClick={handleTokenSubmit} className="w-full">
                Load Map
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
      {!isMapLoaded && (
        <div className="absolute inset-0 bg-sky-gradient flex items-center justify-center z-20">
          <Card className="p-4">
            <div className="text-center">
              <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-2"></div>
              <p className="text-sm text-muted-foreground">Loading map...</p>
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
            disabled={!isMapLoaded}
          >
            <MapPin className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Map Container */}
      <div ref={mapContainer} className="absolute inset-0 rounded-lg" />
      
      {/* Map Instructions */}
      <div className="absolute bottom-4 left-4 bg-background/95 backdrop-blur-sm rounded-lg shadow-lg border p-3 text-sm text-muted-foreground max-w-xs">
        {isMapLoaded ? (
          "Click anywhere on the map or search for a location to view smoke forecasts"
        ) : (
          "Loading map..."
        )}
      </div>
    </div>
  );
};

export default SmokeMap;