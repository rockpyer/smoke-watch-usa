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

interface ArcGISFeature {
  geometry: {
    rings: number[][];
  };
  attributes: {
    smoke_class: number;
    smoke_classdesc: string;
    todate: number; // Unix timestamp in milliseconds
    referencedate: number; // Unix timestamp in milliseconds
  };
}

interface ArcGISResponse {
  features: ArcGISFeature[];
  error?: {
    code: number;
    message: string;
  };
}

export class SmokeDataService {
  private static instance: SmokeDataService;
  private cache = new Map<string, SmokeLayer[]>();
  private readonly CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
  private readonly ARCGIS_ENDPOINT = 'https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/NDGD_SmokeForecast_v1/FeatureServer/0';

  static getInstance(): SmokeDataService {
    if (!SmokeDataService.instance) {
      SmokeDataService.instance = new SmokeDataService();
    }
    return SmokeDataService.instance;
  }

  async fetchSmokeData(): Promise<SmokeLayer[]> {
    const cacheKey = 'noaa_smoke_forecast';
    const cached = this.cache.get(cacheKey);
    
    if (cached && this.isCacheValid(cacheKey)) {
      console.log('Returning cached NOAA smoke data');
      return cached;
    }

    try {
      console.log('Fetching NOAA smoke forecast data...');
      
      // Simplify query to get all available data
      console.log('Fetching all available NOAA smoke forecast data...');
      
      const queryParams = new URLSearchParams({
        'f': 'json',
        'where': '1=1',
        'outFields': '*',
        'returnGeometry': 'true',
        'resultRecordCount': '1000'
      });

      const response = await fetch(`${this.ARCGIS_ENDPOINT}/query?${queryParams}`);
      
      if (!response.ok) {
        throw new Error(`ArcGIS API error: ${response.status}`);
      }

      const data: ArcGISResponse = await response.json();
      
      // Debug logging
      console.log('=== RAW API RESPONSE ===');
      console.log(`Response status: ${response.status}`);
      console.log(`Raw features count: ${data.features?.length || 0}`);
      if (data.error) {
        console.error('API Error:', data.error);
        throw new Error(`API Error: ${data.error.message}`);
      }
      if (data.features && data.features.length > 0) {
        console.log('First feature sample:', JSON.stringify(data.features[0], null, 2));
      }
      console.log('========================');
      
      const smokeData = this.processArcGISData(data);
      this.cache.set(cacheKey, smokeData);
      return smokeData;
      
    } catch (error) {
      console.error('Error fetching NOAA smoke data:', error);
      // Return fallback data if API fails
      return this.generateFallbackSmokeData();
    }
  }

  private processArcGISData(data: ArcGISResponse): SmokeLayer[] {
    console.log(`Processing ${data.features.length} features from ArcGIS`);
    
    if (data.features.length === 0) {
      console.warn('No features received from ArcGIS API');
      return this.generateFallbackSmokeData();
    }

    // Add detailed logging to understand the data
    const todates = data.features.map(f => new Date(f.attributes.todate));
    const referencedates = data.features.map(f => new Date(f.attributes.referencedate));
    
    const minTodate = new Date(Math.min(...todates.map(d => d.getTime())));
    const maxTodate = new Date(Math.max(...todates.map(d => d.getTime())));
    const minRefdate = new Date(Math.min(...referencedates.map(d => d.getTime())));
    const maxRefdate = new Date(Math.max(...referencedates.map(d => d.getTime())));
    
    console.log('=== NOAA Data Analysis ===');
    console.log(`Features: ${data.features.length}`);
    console.log(`Forecast time range: ${minTodate.toISOString()} to ${maxTodate.toISOString()}`);
    console.log(`Reference time range: ${minRefdate.toISOString()} to ${maxRefdate.toISOString()}`);
    
    const forecastHours = (maxTodate.getTime() - minTodate.getTime()) / (1000 * 60 * 60);
    console.log(`Forecast span: ${forecastHours.toFixed(1)} hours`);
    
    const now = new Date();
    const hoursFromNow = (maxTodate.getTime() - now.getTime()) / (1000 * 60 * 60);
    console.log(`Latest forecast: ${hoursFromNow.toFixed(1)} hours from now`);
    console.log('========================');

    const layerMap = new Map<string, SmokePolygon[]>();
    
    // Group features by todate timestamp
    data.features.forEach((feature, index) => {
      const todate = feature.attributes.todate;
      const todateStr = new Date(todate).toISOString();
      
      // Log first few to debug
      if (index < 5) {
        console.log(`Feature ${index}: todate=${todate} (${todateStr}), referencedate=${feature.attributes.referencedate}`);
      }
      
      if (!layerMap.has(todateStr)) {
        layerMap.set(todateStr, []);
      }

      // Convert ArcGIS ring geometry from Web Mercator to WGS84 for Mapbox
      const rings = feature.geometry.rings;
      const coordinates: number[][][] = rings.map(ring => 
        ring.map(coord => this.webMercatorToWGS84(coord[0], coord[1])) // Convert projection
      );

      // Extract concentration from smoke_classdesc (e.g., "63-158" -> 110.5 as midpoint)
      const extractConcentration = (desc: string): number => {
        if (!desc) return 0;
        const match = desc.match(/(\d+)-(\d+)/);
        if (match) {
          const min = parseInt(match[1]);
          const max = parseInt(match[2]);
          return (min + max) / 2; // Use midpoint of range
        }
        const singleMatch = desc.match(/(\d+)/);
        return singleMatch ? parseInt(singleMatch[1]) : 0;
      };

      const concentration = extractConcentration(feature.attributes.smoke_classdesc);

      const polygon: SmokePolygon = {
        geometry: {
          type: 'Polygon',
          coordinates: coordinates
        },
        properties: {
          smoke_class: feature.attributes.smoke_class || 1,
          smoke_classdesc: feature.attributes.smoke_classdesc || 'Light',
          concentration_ugm3: concentration,
          todate: todateStr,
          referencedate: new Date(feature.attributes.referencedate).toISOString()
        }
      };

      layerMap.get(todateStr)!.push(polygon);
    });

    console.log(`Created ${layerMap.size} time-based groups:`, Array.from(layerMap.keys()).sort());
    
    // Convert to time-ordered layers using actual todate timestamps
    const layers: SmokeLayer[] = [];
    
    Array.from(layerMap.entries())
      .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime()) // Sort by actual timestamp
      .forEach(([todateStr, polygons]) => {
        const timestamp = new Date(todateStr);
        console.log(`Layer for ${timestamp.toISOString()}: ${polygons.length} polygons`);
        layers.push({ timestamp, data: polygons });
      });

    // Generate 48-hour forecast from current time if we have gaps
    const extendedLayers = this.ensureFullForecastRange(layers);
    console.log(`Extended to ${extendedLayers.length} layers covering 48 hours`);
    
    return extendedLayers;
  }

  private ensureFullForecastRange(layers: SmokeLayer[]): SmokeLayer[] {
    if (layers.length === 0) {
      return this.generateFallbackSmokeData();
    }

    console.log(`Starting with ${layers.length} actual data layers`);
    
    // If we have actual forecast data, use it as the base and extend around it
    const actualTimestamps = layers.map(l => l.timestamp).sort((a, b) => a.getTime() - b.getTime());
    const earliestForecast = actualTimestamps[0];
    const latestForecast = actualTimestamps[actualTimestamps.length - 1];
    
    console.log(`Actual forecast range: ${earliestForecast.toISOString()} to ${latestForecast.toISOString()}`);
    
    // Create a 48-hour range starting from the earliest forecast time
    const startTime = new Date(earliestForecast);
    const endTime = new Date(startTime.getTime() + (47 * 60 * 60 * 1000)); // 48 hours total
    
    const fullLayers: SmokeLayer[] = [];
    
    // Generate hourly time slots for 48 hours starting from actual forecast data
    for (let time = new Date(startTime); time <= endTime; time = new Date(time.getTime() + (60 * 60 * 1000))) {
      // Look for existing layer within 6 hours (much more flexible matching)
      const existingLayer = layers.find(layer => 
        Math.abs(layer.timestamp.getTime() - time.getTime()) < (6 * 60 * 60 * 1000) // Within 6 hours
      );
      
      if (existingLayer) {
        fullLayers.push({
          timestamp: new Date(time), // Use the generated time slot
          data: existingLayer.data   // But use the actual polygon data
        });
        console.log(`✓ Matched slot ${time.toISOString()} with data from ${existingLayer.timestamp.toISOString()}`);
      } else {
        // If we only have one timestamp, extend that data to nearby time slots (within 12 hours)
        if (layers.length === 1 && Math.abs(layers[0].timestamp.getTime() - time.getTime()) < (12 * 60 * 60 * 1000)) {
          fullLayers.push({
            timestamp: new Date(time),
            data: layers[0].data // Reuse the single forecast data
          });
          console.log(`✓ Extended single forecast to slot ${time.toISOString()}`);
        } else {
          // Create empty layer for missing time slot
          fullLayers.push({
            timestamp: new Date(time),
            data: []
          });
          console.log(`○ Empty slot ${time.toISOString()}`);
        }
      }
    }
    
    const layersWithData = fullLayers.filter(l => l.data.length > 0);
    console.log(`Final result: ${fullLayers.length} total layers, ${layersWithData.length} with polygon data`);
    
    return fullLayers;
  }

  // Convert Web Mercator (EPSG:3857) to WGS84 (EPSG:4326)
  private webMercatorToWGS84(x: number, y: number): [number, number] {
    const lng = (x / 20037508.34) * 180;
    let lat = (y / 20037508.34) * 180;
    lat = 180 / Math.PI * (2 * Math.atan(Math.exp(lat * Math.PI / 180)) - Math.PI / 2);
    return [lng, lat];
  }

  private smokeClassToConcentration(smokeClass: number): number {
    // Convert smoke class to approximate μg/m³ concentration
    switch (smokeClass) {
      case 1: return 12;   // Light smoke
      case 2: return 35;   // Moderate smoke
      case 3: return 55;   // Heavy smoke
      case 4: return 150;  // Very heavy smoke
      case 5: return 250;  // Extreme smoke
      default: return 0;
    }
  }

  private generateFallbackSmokeData(): SmokeLayer[] {
    // Generate fallback polygon data for when API is unavailable
    const layers: SmokeLayer[] = [];
    const baseTime = new Date();
    
    for (let hour = 0; hour < 24; hour++) {
      const timestamp = new Date(baseTime.getTime() + hour * 60 * 60 * 1000);
      const data: SmokePolygon[] = [
        {
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [-122.5, 37.7],
              [-122.3, 37.7],
              [-122.3, 37.9],
              [-122.5, 37.9],
              [-122.5, 37.7]
            ]]
          },
          properties: {
            smoke_class: 2,
            smoke_classdesc: 'Moderate',
            concentration_ugm3: 35,
            todate: timestamp.toISOString(),
            referencedate: baseTime.toISOString()
          }
        }
      ];
      layers.push({ timestamp, data });
    }
    
    return layers;
  }

  private isCacheValid(key: string): boolean {
    // For now, always fetch fresh data to get latest forecasts
    return false;
  }

  // Convert concentration to color for visualization - NOAA standard colors
  getConcentrationColor(concentration: number): string {
    if (concentration <= 2) return 'rgb(255, 255, 255)';     // 1-2 μg/m³ - White
    if (concentration <= 4) return 'rgb(224, 247, 255)';     // 2-4 μg/m³ - Very Light Blue
    if (concentration <= 6) return 'rgb(176, 229, 255)';     // 4-6 μg/m³ - Light Blue
    if (concentration <= 8) return 'rgb(128, 210, 255)';     // 6-8 μg/m³ - Medium Blue
    if (concentration <= 12) return 'rgb(102, 204, 255)';    // 8-12 μg/m³ - Blue
    if (concentration <= 16) return 'rgb(0, 204, 102)';      // 12-16 μg/m³ - Green
    if (concentration <= 20) return 'rgb(102, 204, 0)';      // 16-20 μg/m³ - Yellow-Green
    if (concentration <= 25) return 'rgb(204, 204, 0)';      // 20-25 μg/m³ - Yellow
    if (concentration <= 30) return 'rgb(255, 204, 0)';      // 25-30 μg/m³ - Orange
    if (concentration <= 40) return 'rgb(255, 153, 0)';      // 30-40 μg/m³ - Dark Orange
    if (concentration <= 60) return 'rgb(255, 102, 0)';      // 40-60 μg/m³ - Red-Orange
    if (concentration <= 100) return 'rgb(255, 51, 0)';      // 60-100 μg/m³ - Red
    if (concentration <= 200) return 'rgb(204, 0, 51)';      // 100-200 μg/m³ - Purple
    return 'rgb(153, 0, 153)';                               // 200+ μg/m³ - Dark Purple
  }

  // Convert smoke class description to AQI category
  getAQICategory(smokeClassDesc: string): string {
    switch (smokeClassDesc.toLowerCase()) {
      case 'light': return 'Good';
      case 'moderate': return 'Moderate';
      case 'heavy': return 'Unhealthy for Sensitive Groups';
      case 'very heavy': return 'Unhealthy';
      case 'extreme': return 'Very Unhealthy';
      default: return 'Unknown';
    }
  }
}

export const smokeDataService = SmokeDataService.getInstance();
