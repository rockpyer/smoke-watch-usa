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
import { useIsMobile } from '@/hooks/use-mobile';
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
  smokeLayers?: SmokeLayer[];
  focusLocation?: { lat: number; lng: number } | null;
}

const SmokeMap: React.FC<SmokeMapProps> = ({
  onLocationSelect,
  onCitySearch,
  selectedTime,
  currentLayer,
  smokeLayers = [],
  focusLocation
}) => {
  const { trackLocationClick, trackCitySearch } = useAnalytics();
  const isMobile = useIsMobile();
  // All state and ref declarations must be here, inside the function body but top level
  const [needsToken, setNeedsToken] = useState(false);
  const [smokeLayerReady, setSmokeLayerReady] = useState(false);
  const [isUpdatingLayers, setIsUpdatingLayers] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string>('');
  const [isInitializing, setIsInitializing] = useState(false);
  const [fireDataLoaded, setFireDataLoaded] = useState(false);
  // Bumped whenever the Mapbox style becomes ready (load/styledata/idle).
  // The polygon-render effect depends on this so it re-runs as soon as the
  // style is actually queryable — fixes the mobile "no polygons until I
  // pan" race where currentLayer arrived before isStyleLoaded() was true.
  const [styleReadyTick, setStyleReadyTick] = useState(0);

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

      // Fetch ALL wildfire data (no bounds filtering for comprehensive US coverage)
      const fireData = await fireDataService.fetchFireData();

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
                <div class="p-3 bg-background text-foreground">
                  <h4 class="font-semibold text-lg flex items-center text-foreground">
                    🔥 Wildfire Incident
                  </h4>
                  <div class="mt-2 space-y-1">
                    <p class="text-sm text-foreground"><strong>Incident Name:</strong> ${props?.IncidentName || 'Not Available'}</p>
                    <p class="text-sm text-foreground"><strong>Start Date:</strong> ${props?.FireDiscoveryDateTime || 'Not Available'}</p>
                    <p class="text-sm text-foreground"><strong>Forest Type:</strong> ${props?.ForestTypeGroup || 'Not Available'}</p>
                    <p class="text-sm text-foreground"><strong>Percent Contained:</strong> ${props?.PercentContained !== undefined ? props.PercentContained + '%' : 'Not Available'}</p>
                    <p class="text-sm text-foreground"><strong>Acres:</strong> ${props?.DailyAcres !== undefined ? props.DailyAcres.toLocaleString() : 'Not Available'}</p>
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

  // Fly to a focus location (e.g. default Boulder or geolocated user position),
  // centered slightly WEST so the typical west-to-east smoke plume is visible
  // downwind of the location.
  const lastFocusRef = useRef<string | null>(null);
  useEffect(() => {
    if (!map.current || !isMapLoaded || !focusLocation) return;
    const key = `${focusLocation.lat.toFixed(4)},${focusLocation.lng.toFixed(4)}`;
    if (lastFocusRef.current === key) return;
    lastFocusRef.current = key;
    map.current.flyTo({
      center: [focusLocation.lng - 1, focusLocation.lat],
      zoom: 5,
      duration: 1500
    });
  }, [focusLocation, isMapLoaded]);

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

      // Filter and process polygons with time-slicing for better performance
      const validPolygons = currentLayer.data.filter(
        polygon => polygon.properties.concentration_ugm3 > 0
      );

      // Process features in smaller chunks to avoid blocking
      const features: any[] = [];
      
      // Non-blocking feature processing
      const processFeatures = () => {
        return new Promise<void>((resolve) => {
          let index = 0;
          const processChunk = () => {
            const startTime = performance.now();
            while (index < validPolygons.length && (performance.now() - startTime) < 5) {
              const polygon = validPolygons[index];
              features.push({
                type: 'Feature' as const,
                properties: {
                  smoke_class: polygon.properties.smoke_class,
                  smoke_classdesc: polygon.properties.smoke_classdesc,
                  concentration: polygon.properties.concentration_ugm3,
                  forecast_hour: polygon.properties.forecast_hour || 0
                },
                geometry: polygon.geometry
              });
              index++;
            }
            
            if (index < validPolygons.length) {
              setTimeout(processChunk, 0);
            } else {
              resolve();
            }
          };
          processChunk();
        });
      };

      // Process features and then add to map
      processFeatures().then(() => {
        if (!map.current) return;

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
            let aqiCategory = 'Hazy';
            let healthAdvice = 'Hazy — light smoke possible. Real air quality may be worse from other sources.';
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
              aqiCategory = 'Moderate Smoke';
              healthAdvice = 'Sensitive groups may feel effects. Most people are fine outside.';
            }
            // Local time for the clicked location based on the layer's valid_time
            let localTimeLabel = '';
            try {
              const tz = tzLookup(e.lngLat.lat, e.lngLat.lng);
              const validMs = props?.valid_time
                ? Number(props.valid_time)
                : (selectedTime ? selectedTime.getTime() : Date.now());
              const d = new Date(validMs);
              localTimeLabel = d.toLocaleString('en-US', {
                timeZone: tz,
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
                timeZoneName: 'short',
              });
            } catch {
              localTimeLabel = new Date().toLocaleString();
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
                <div class="p-3 bg-background text-foreground">
                  <h4 class="font-semibold text-lg text-foreground">Smoke PM2.5 (forecast)</h4>
                  <div class="mt-2 space-y-1">
                    <p class="text-sm text-foreground"><strong>Category:</strong> ${aqiCategory}</p>
                    <p class="text-sm text-foreground"><strong>Concentration:</strong> ${concentration} μg/m³</p>
                    <p class="text-sm text-foreground"><strong>Forecast time:</strong> ${localTimeLabel}</p>
                  </div>
                  <div class="mt-3 p-2 bg-muted rounded">
                    <p class="text-xs text-foreground">${healthAdvice}</p>
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

        setIsUpdatingLayers(false);
      }).catch((error) => {
        console.error('Error processing smoke data:', error);
        setIsUpdatingLayers(false);
      });

    } catch (error) {
      console.error('Error adding NOAA smoke layers:', error);
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
        setStyleReadyTick(t => t + 1);
      });
      map.current.on('styledata', () => {
        if (map.current?.isStyleLoaded()) {
          setStyleReadyTick(t => t + 1);
        }
      });
      map.current.once('idle', () => {
        setStyleReadyTick(t => t + 1);
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
      initializeMap();
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
      isMapLoaded
    ) {
      // Fallback layer selection: use currentLayer if available, otherwise use the first layer
      const layerToRender = currentLayer || (smokeLayers && smokeLayers.length > 0 ? smokeLayers[0] : null);

      if (!layerToRender) return;
      const currentTimestamp = layerToRender.timestamp.toISOString();
      if (lastProcessedTimestamp.current === currentTimestamp) return;

      // If the style isn't actually queryable yet, retry on the next idle
      // instead of silently bailing. This is the key mobile fix.
      if (!map.current.isStyleLoaded()) {
        console.log('🗺️ SmokeMap: style not ready, retrying on idle');
        map.current.once('idle', () => setStyleReadyTick(t => t + 1));
        return;
      }

      console.log('🗺️ SmokeMap: Rendering layer for timestamp:', currentTimestamp);
      lastProcessedTimestamp.current = currentTimestamp;
      addSmokeLayer();
    }
  }, [currentLayer, isMapLoaded, smokeLayers, styleReadyTick, addSmokeLayer]);

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
              center: [lng - 3, lat],
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
              <p className="text-xs text-muted-foreground mt-1">Fetching NOAA HRRR data</p>
            </div>
          </Card>
        </div>
      )}

      {/* Search Controls — offset right to clear the floating wordmark chip (incl. desktop subtitle) */}
      <div className="absolute top-3 left-36 md:left-[19rem] right-3 md:right-auto md:w-[300px] z-10 bg-background/70 backdrop-blur-md rounded-full shadow-[0_2px_12px_rgba(0,0,0,0.2)]">
        <div className="flex items-center pl-3 pr-1 py-1">
          <div className="flex items-center flex-1 min-w-0">
            <Search className="h-4 w-4 text-muted-foreground mr-2 flex-shrink-0" />
            <Input
              placeholder="Search city..."
              value={searchValue}
              onChange={handleSearchInputChange}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 h-7 px-0 text-sm"
              disabled={!isMapLoaded}
              maxLength={100}
            />
          </div>
          <Button
            size="sm"
            onClick={handleSearch}
            className="ml-1 h-7 w-7 p-0 rounded-full"
            disabled={!isMapLoaded || !searchValue.trim()}
          >
            <MapPin className="h-3.5 w-3.5" />
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

      {/* Fire-sources chip — bottom-left, small. Hidden on mobile (the floating time pill owns the bottom) */}
      {!isMobile && fireDataLoaded && (
        <div className="absolute bottom-4 left-4 z-10 bg-background/70 backdrop-blur-md rounded-full px-3 py-1.5 shadow-[0_2px_12px_rgba(0,0,0,0.18)] text-[11px] text-muted-foreground flex items-center gap-2">
          <div className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0" />
          <span>Active fire sources</span>
        </div>
      )}
      {/* Loading hint while map data isn't ready (replaces the verbose info chip) */}
      {!isMapLoaded && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-10 bg-background/80 backdrop-blur-md rounded-full px-3 py-1.5 text-[11px] text-muted-foreground shadow">
          Loading NOAA smoke forecast…
        </div>
      )}
      {/* Hidden legacy block kept for parity (intentionally empty) */}
      <div className="hidden">
        {isMapLoaded ? (
          <div className="space-y-1">
            {currentLayer ? 
              <div className={isMobile ? 'text-xs' : ''}>
                NOAA forecast {isMobile ? currentLayer.timestamp.toLocaleDateString() : currentLayer.timestamp.toLocaleString()} 
                {isMobile ? ` (${currentLayer.data.length} areas)` : ` with ${currentLayer.data.length} polygon areas`}
              </div> :
              <div>No smoke forecast data available</div>
            }
            {fireDataLoaded && (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0"></div>
                <span className={isMobile ? 'text-xs' : ''}>Active fire sources</span>
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