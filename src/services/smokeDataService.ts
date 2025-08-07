interface SmokePolygon {
  geometry: {
    type: 'Polygon';
    coordinates: number[][][];
  };
  properties: {
    smoke_class: number;
    smoke_classdesc: string;
    concentration_ugm3: number;
    forecast_hour: string;
    valid_time: string;
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
    forecast_hour: string;
    valid_time: string;
  };
}

interface ArcGISResponse {
  features: ArcGISFeature[];
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
      
      // Query ArcGIS FeatureServer for next 48 hours of smoke forecasts
      const queryParams = new URLSearchParams({
        'f': 'json',
        'where': '1=1',
        'outFields': '*',
        'returnGeometry': 'true',
        'spatialRel': 'esriSpatialRelIntersects',
        'geometryType': 'esriGeometryEnvelope',
        'inSR': '4326',
        'outSR': '4326'
      });

      const response = await fetch(`${this.ARCGIS_ENDPOINT}/query?${queryParams}`);
      
      if (!response.ok) {
        throw new Error(`ArcGIS API error: ${response.status}`);
      }

      const data: ArcGISResponse = await response.json();
      console.log(`Received ${data.features.length} smoke forecast polygons`);
      
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
    const layerMap = new Map<string, SmokePolygon[]>();
    
    // Group features by forecast hour only (not valid_time since they're all the same)
    data.features.forEach(feature => {
      const forecastHour = feature.attributes.forecast_hour || '0';
      const key = forecastHour;
      
      if (!layerMap.has(key)) {
        layerMap.set(key, []);
      }

      // Convert ArcGIS ring geometry to GeoJSON polygon - fix the coordinate structure
      const rings = feature.geometry.rings;
      const coordinates: number[][][] = rings.map(ring => 
        ring.map(coord => [coord[0], coord[1]]) // Ensure each coordinate is [lng, lat]
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
          forecast_hour: feature.attributes.forecast_hour || '0',
          valid_time: feature.attributes.valid_time || new Date().toISOString()
        }
      };

      layerMap.get(key)!.push(polygon);
    });

    // Convert to time-ordered layers based on forecast hours
    const layers: SmokeLayer[] = [];
    const baseTime = new Date();
    
    Array.from(layerMap.entries())
      .sort((a, b) => parseInt(a[0]) - parseInt(b[0])) // Sort by forecast hour numerically
      .forEach(([forecastHour, polygons]) => {
        const hoursFromNow = parseInt(forecastHour);
        const timestamp = new Date(baseTime.getTime() + hoursFromNow * 60 * 60 * 1000);
        layers.push({ timestamp, data: polygons });
      });

    return layers;
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
            forecast_hour: hour.toString(),
            valid_time: timestamp.toISOString()
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

  // Convert concentration to color for visualization
  getConcentrationColor(concentration: number): string {
    if (concentration <= 12) return 'rgba(0, 228, 0, 0.6)';        // Good - Green
    if (concentration <= 35) return 'rgba(255, 255, 0, 0.6)';      // Moderate - Yellow  
    if (concentration <= 55) return 'rgba(255, 126, 0, 0.6)';      // Unhealthy for Sensitive - Orange
    if (concentration <= 150) return 'rgba(255, 0, 0, 0.6)';       // Unhealthy - Red
    if (concentration <= 250) return 'rgba(143, 63, 151, 0.6)';    // Very Unhealthy - Purple
    return 'rgba(126, 0, 35, 0.8)';                                // Hazardous - Maroon
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
