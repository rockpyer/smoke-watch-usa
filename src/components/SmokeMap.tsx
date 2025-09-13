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
import { useAnalytics } from '@/hooks/useAnalytics';
import MapboxTokenInput from './MapboxTokenInput';
/// test test after gemini///
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
  const { trackLocationClick, trackCitySearch } = useAnalytics();
  // All state and ref declarations must be here, inside the function body but top level
  const [needsToken, setNeedsToken] = useState(false);
  const [smokeLayerReady, setSmokeLayerReady] = useState(false);
  const [isUpdatingLayers, setIsUpdatingLayers] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string>('');
  const [isInitializing, setIsInitializing] = useState(false);
  const [fireDataLoaded, setFireDataLoaded] = useState(false);

  // Refs
  const initTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const marker = useRef<mapboxgl.Marker | null>(null);
  const lastProcessedTimestamp = useRef<string | null>(null);

  // Dummy checkContainerDimensions for now (should be replaced with actual logic if needed)
  const checkContainerDimensions = () => {};

  // Add fire hotspots
  const addFireLayer = useCallback(async () => {
    if (!map.current || !isMapLoaded || fireDataLoaded) return;
    try {
      if (map.current.getLayer('fire-incidents')) {
        map.current.removeLayer('fire-incidents');
      }
      if (map.current.getSource('fire-data')) {
        map.current.removeSource('fire-data');
      }

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

      map.current.addSource('fire-data', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: fireFeatures
        }
      });

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

      map.current.on('mouseenter', 'fire-incidents', () => {
        map.current!.getCanvas().style.cursor = 'pointer';
      });
      map.current.on('mouseleave', 'fire-incidents', () => {
        map.current!.getCanvas().style.cursor = '';
      });

      setFireDataLoaded(true);
    } catch (error) {
      console.error('Error adding fire data:', error);
    }
  }, [isMapLoaded, fireDataLoaded]);

  // Map initialization logic, now after all dependencies and using no hooks inside
  // Stable addSmokeLayer: only depends on map.current
  const addSmokeLayer = useCallback(() => {
    if (!map.current || !currentLayer || !isMapLoaded || isUpdatingLayers) {
      console.log('addSmokeLayer skipped - guards failed');
      return;
    }

    setIsUpdatingLayers(true);

    try {
      console.log(`🗺️ MAP UPDATE: Adding NOAA smoke polygons for ${currentLayer.timestamp.toISOString()} with ${currentLayer.data.length} forecast areas`);

      // Remove existing layers/sources
      try {
        if (map.current.getLayer('smoke-polygons')) {
          map.current.removeLayer('smoke-polygons');
        }
        if (map.current.getLayer('smoke-outlines')) {
          map.current.removeLayer('smoke-outlines');
        }
        if (map.current.getSource('smoke-forecast-data')) {
          map.current.removeSource('smoke-forecast-data');
        }
      } catch (e) {
        console.log('Layer cleanup completed (some layers may not have existed)');
      }

      // Filter polygons & create GeoJSON features
      const validPolygons = currentLayer.data.filter(
        polygon => polygon.properties.concentration_ugm3 > 0
      );

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
      if (features.length > 0 && lastProcessedTimestamp.current === null) {
        try {
            // Robust bounding box calculation for Polygon/MultiPolygon
            function extractCoords(geometry) {
              if (!geometry) return [];
              if (geometry.type === 'Point') return [geometry.coordinates];
              if (geometry.type === 'Polygon') {
                // geometry.coordinates: [ [ [lng, lat], ... ] ]
                return geometry.coordinates.flat();
              }
              if (geometry.type === 'MultiPolygon') {
                // geometry.coordinates: [ [ [ [lng, lat], ... ] ], ... ]
                return geometry.coordinates.flat(2);
              }
              return [];
            }
            const allCoords = features.flatMap(f => extractCoords(f.geometry));
            console.log('Bounding box coordinate count:', allCoords.length);
            let minLng = 180, minLat = 90, maxLng = -180, maxLat = -90;
            allCoords.forEach(coord => {
              if (!Array.isArray(coord) || coord.length < 2) return;
              const [lng, lat] = coord;
              if (typeof lng !== 'number' || typeof lat !== 'number') return;
              if (lng < minLng) minLng = lng;
              if (lng > maxLng) maxLng = lng;
              if (lat < minLat) minLat = lat;
              if (lat > maxLat) maxLat = lat;
            });
            if (minLng < maxLng && minLat < maxLat && allCoords.length > 0) {
              map.current.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 40, maxZoom: 8 });
              console.log('🗺️ Fit map to smoke polygon bounds:', [[minLng, minLat], [maxLng, maxLat]]);
            } else {
              // Fallback to US bounding box if no valid coordinates
              const usBounds: [mapboxgl.LngLatLike, mapboxgl.LngLatLike] = [[-125, 24], [-66.9, 49]];
              map.current.fitBounds(usBounds, { padding: 20, maxZoom: 4 });
              console.log('🗺️ Fallback: Fit map to US bounds', usBounds);
            }
        } catch (e) {
          console.error('Could not fit map to polygons:', e);
        }
      }

      // Fill layer
      map.current.addLayer({
        id: 'smoke-polygons',
        type: 'fill',
        source: 'smoke-forecast-data',
        paint: {
          'fill-color': [
            'case',
            ['<=', ['get', 'concentration'], 2], 'rgb(255, 255, 255)',
            ['<=', ['get', 'concentration'], 4], 'rgb(224, 247, 255)',
            ['<=', ['get', 'concentration'], 6], 'rgb(176, 229, 255)',
            ['<=', ['get', 'concentration'], 8], 'rgb(128, 210, 255)',
            ['<=', ['get', 'concentration'], 12],'rgb(102, 204, 255)',
            ['<=', ['get', 'concentration'], 16],'rgb(0, 204, 102)',
            ['<=', ['get', 'concentration'], 20],'rgb(102, 204, 0)',
            ['<=', ['get', 'concentration'], 25],'rgb(204, 204, 0)',
            ['<=', ['get', 'concentration'], 30],'rgb(255, 204, 0)',
            ['<=', ['get', 'concentration'], 40],'rgb(255, 153, 0)',
            ['<=', ['get', 'concentration'], 60],'rgb(255, 102, 0)',
            ['<=', ['get', 'concentration'], 100],'rgb(255, 51, 0)',
            ['<=', ['get', 'concentration'], 200],'rgb(204, 0, 51)',
            'rgb(153, 0, 153)'
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

      // Outline layer
      map.current.addLayer({
        id: 'smoke-outlines',
        type: 'line',
        source: 'smoke-forecast-data',
        paint: {
          'line-color': [
            'case',
            ['<=', ['get', 'concentration'], 2], 'rgb(255, 255, 255)',
            ['<=', ['get', 'concentration'], 4], 'rgb(224, 247, 255)',
            ['<=', ['get', 'concentration'], 6], 'rgb(176, 229, 255)',
            ['<=', ['get', 'concentration'], 8], 'rgb(128, 210, 255)',
            ['<=', ['get', 'concentration'], 12],'rgb(102, 204, 255)',
            ['<=', ['get', 'concentration'], 16],'rgb(0, 204, 102)',
            ['<=', ['get', 'concentration'], 20],'rgb(102, 204, 0)',
            ['<=', ['get', 'concentration'], 25],'rgb(204, 204, 0)',
            ['<=', ['get', 'concentration'], 30],'rgb(255, 204, 0)',
            ['<=', ['get', 'concentration'], 40],'rgb(255, 153, 0)',
            ['<=', ['get', 'concentration'], 60],'rgb(255, 102, 0)',
            ['<=', ['get', 'concentration'], 100],'rgb(255, 51, 0)',
            ['<=', ['get', 'concentration'], 200],'rgb(204, 0, 51)',
            'rgb(153, 0, 153)'
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

      // Click handler for polygons
      map.current.on('click', 'smoke-polygons', (e) => {
        if (e.features && e.features[0]) {
          const feature = e.features[0];
          const props = feature.properties;
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
          if (onLocationSelect) {
            reverseGeocode(e.lngLat.lng, e.lngLat.lat).then((locationName) => {
              onLocationSelect(
                [e.lngLat.lng, e.lngLat.lat],
                locationName,
                {
                  concentration_ugm3: concentration,
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

      map.current.on('mouseenter', 'smoke-polygons', () => {
        map.current!.getCanvas().style.cursor = 'pointer';
      });

      map.current.on('mouseleave', 'smoke-polygons', () => {
        map.current!.getCanvas().style.cursor = '';
      });

    } catch (error) {
      console.error('Error adding NOAA smoke layers:', error);
    } finally {
      setIsUpdatingLayers(false);
    }
  }, [isMapLoaded, isUpdatingLayers, currentLayer, onLocationSelect]);

  // Map initialization
  // Stable initializeMap: only runs on mount or token change
  const initializeMap = useCallback(() => {
    try {
      setIsInitializing(true);
      setMapError('');
      mapboxgl.accessToken = config.mapboxToken!;
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
      if (initTimeoutRef.current) {
        clearTimeout(initTimeoutRef.current);
      }
      setIsMapLoaded(false);
      map.current = new mapboxgl.Map({
        container: mapContainer.current!,
        style: 'mapbox://styles/mapbox/outdoors-v12',
        center: [-98.5795, 39.8283],
        zoom: 4,
        attributionControl: false,
        preserveDrawingBuffer: true
      });
      map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
      let loadEventFired = false;
      let loadTimeout: NodeJS.Timeout;
      loadTimeout = setTimeout(() => {
        if (!loadEventFired) {
          loadEventFired = true;
          setIsMapLoaded(true);
          setIsInitializing(false);
        }
      }, 3000);
      map.current.on('load', () => {
        if (!loadEventFired) {
          loadEventFired = true;
          clearTimeout(loadTimeout);
          setIsMapLoaded(true);
          setIsInitializing(false);
        }
      });
      map.current.on('error', (e) => {
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
        marker.current = new mapboxgl.Marker({ color: '#2563eb' })
          .setLngLat([lng, lat])
          .addTo(map.current);
        reverseGeocode(lng, lat);
        
        // Track location click event
        trackLocationClick(lat, lng, map.current.getZoom());
        
        if (onLocationSelect) {
          onLocationSelect([lng, lat], `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        }
      });
    } catch (error: any) {
      setIsInitializing(false);
      setMapError(`Initialization failed: ${error?.message || 'An error occurred.'}`);
    }
  }, [onLocationSelect, onCitySearch, addFireLayer]);

  // Effect to initialize map on mount
  // Only run map initialization on mount or token change
  useEffect(() => {
    if (!needsToken) {
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
  }, [needsToken]);

  // Add fire data when map is loaded
  useEffect(() => {
    if (isMapLoaded && !fireDataLoaded) {
      addFireLayer();
    }
  }, [isMapLoaded, fireDataLoaded, addFireLayer]);

  // Unified effect: Render polygons as soon as map, smoke data, and currentLayer are ready
  useEffect(() => {
    if (
      map.current &&
      currentLayer &&
      isMapLoaded &&
      !isUpdatingLayers &&
      map.current.isStyleLoaded()
    ) {
      const currentTimestamp = currentLayer.timestamp.toISOString();
      if (lastProcessedTimestamp.current !== currentTimestamp) {
        addSmokeLayer();
        lastProcessedTimestamp.current = currentTimestamp;
      }
    }
  }, [currentLayer, isMapLoaded, isUpdatingLayers, addSmokeLayer]);

  const reverseGeocode = async (lng: number, lat: number): Promise<string> => {
    try {
      if (!hasValidMapboxToken()) {
        return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      }
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${config.mapboxToken}`
      );
      if (!response.ok) throw new Error('Geocoding request failed');
      const data = await response.json();
      if (data.features && data.features.length > 0) {
        return data.features[0].place_name;
      }
      return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    } catch (error) {
      return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
  };

  const debouncedSearch = useCallback(
    debounce(async (searchTerm: string) => {
      if (!searchTerm.trim() || !hasValidMapboxToken()) return;
      const sanitizedInput = sanitizeSearchInput(searchTerm);
      if (!validateSearchInput(sanitizedInput)) return;
      try {
        const response = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(sanitizedInput)}.json?country=us&access_token=${config.mapboxToken}`
        );
        if (!response.ok) throw new Error('Search request failed');
        const data = await response.json();
        if (data.features && data.features.length > 0) {
          const [lng, lat] = data.features[0].center;
          const placeName = data.features[0].place_name;
          if (marker.current) marker.current.remove();
          if (map.current) {
            marker.current = new mapboxgl.Marker({ color: '#2563eb' })
              .setLngLat([lng, lat])
              .addTo(map.current);
            map.current.flyTo({
              center: [lng, lat],
              zoom: 6,
              duration: 2000
            });
            // Track city search event
            trackCitySearch(searchValue || placeName, placeName, lat, lng);
            
            if (onLocationSelect) onLocationSelect([lng, lat], placeName);
            if (onCitySearch) onCitySearch({ lat, lng }, placeName);
          }
        }
      } catch (error) {
        // Geocoding failed
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
    setSearchValue(e.target.value);
  };

  const handleRetry = () => {
    setMapError('');
    setIsMapLoaded(false);
    setIsInitializing(false);
    setNeedsToken(false);
    initializeMap();
  };

  const handleTokenSet = () => {
    setNeedsToken(false);
    setMapError('');
    setIsInitializing(false);
    setIsMapLoaded(false);
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
      {(isInitializing || !isMapLoaded) && (
        <div className="absolute inset-0 bg-sky-gradient flex items-center justify-center z-20">
          <Card className="p-4">
            <div className="text-center">
              <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-2"></div>
              <p className="text-sm text-muted-foreground">
                {isInitializing ? 'Initializing map...' :
                 'Loading map...'}
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
};

export default SmokeMap;