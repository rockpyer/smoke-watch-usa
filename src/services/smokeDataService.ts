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
    rings: number[][][];
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
  exceededTransferLimit?: boolean;
  error?: {
    code: number;
    message: string;
  };
}

interface CacheEntry {
  data: SmokeLayer[];
  timestamp: number;
}

export class SmokeDataService {
  private static instance: SmokeDataService;
  private cache = new Map<string, CacheEntry>();
  private readonly CACHE_DURATION = 15 * 60 * 1000; // 15 minutes for better performance
  private readonly ARCGIS_ENDPOINT = 'https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/NDGD_SmokeForecast_v1/FeatureServer/0';

  static getInstance(): SmokeDataService {
    if (!SmokeDataService.instance) {
      SmokeDataService.instance = new SmokeDataService();
    }
    return SmokeDataService.instance;
  }

  async fetchSmokeData(): Promise<SmokeLayer[]> {
    const cacheKey = 'noaa_smoke_forecast';
    
    // Check enhanced cache first (memory + localStorage)
    const cachedData = this.getCachedData(cacheKey);
    if (cachedData) {
      console.log('Returning cached NOAA smoke data');
      return cachedData;
    }

    try {
      console.log('Fetching NOAA smoke forecast data...');

      const pageSize = 2000;
      const fetchPage = async (offset: number): Promise<ArcGISResponse> => {
        const params = new URLSearchParams({
          f: 'json',
          where: '1=1',
          outFields: 'todate,referencedate,smoke_classdesc',
          returnGeometry: 'true',
          orderByFields: 'todate',
          resultRecordCount: String(pageSize),
          resultOffset: String(offset)
        });
        const url = `${this.ARCGIS_ENDPOINT}/query?${params}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`ArcGIS API error: ${res.status}`);
        return res.json();
      };

      // Fetch the first page to learn whether more pages exist.
      const first = await fetchPage(0);
      const allFeatures: ArcGISFeature[] = [...(first.features || [])];
      console.log(`Page 0: ${first.features?.length || 0} features, exceededTransferLimit=${first.exceededTransferLimit}`);

      // If the server says there is more, fetch up to N additional pages in parallel.
      // NOAA NDGD typically returns < 10k polygons total — capping at 9 extra pages
      // (≈ 20k records) is a safe bound that avoids runaway requests.
      if (first.exceededTransferLimit && (first.features?.length || 0) > 0) {
        const MAX_EXTRA_PAGES = 9;
        const offsets = Array.from({ length: MAX_EXTRA_PAGES }, (_, i) => (i + 1) * pageSize);
        const results = await Promise.all(offsets.map(o => fetchPage(o).catch(err => {
          console.warn('Smoke page fetch failed at offset', o, err);
          return { features: [] } as ArcGISResponse;
        })));
        for (const r of results) {
          if (r.features && r.features.length) allFeatures.push(...r.features);
          // Stop appending once we hit a page that did NOT exceed the limit;
          // anything past that point would just be empty.
          if (!r.exceededTransferLimit) break;
        }
        console.log(`Total features after parallel pagination: ${allFeatures.length}`);
      }

      const smokeData = this.processArcGISData({ features: allFeatures });
      this.setCachedData(cacheKey, smokeData);
      return smokeData;

    } catch (error) {
      console.error('Error fetching NOAA smoke data:', error);
      // Do not fabricate data; return empty set on failure
      return [];
    }
  }

  private processArcGISData(data: ArcGISResponse): SmokeLayer[] {
    console.log(`Processing ${data.features.length} features from ArcGIS`);
    
    if (data.features.length === 0) {
      console.warn('No features received from ArcGIS API');
      return [];
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
    
    // Convert to time-ordered layers using actual todate timestamps - NO ARTIFICIAL EXTENSION
    const layers: SmokeLayer[] = [];
    
    Array.from(layerMap.entries())
      .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime()) // Sort by actual timestamp
      .forEach(([todateStr, polygons]) => {
        const timestamp = new Date(todateStr);
        console.log(`Layer for ${timestamp.toISOString()}: ${polygons.length} polygons`);
        layers.push({ timestamp, data: polygons });
      });

    console.log(`Final result: ${layers.length} layers with actual NOAA timestamps`);
    return layers;
  }

  // Convert Web Mercator (EPSG:3857) to WGS84 (EPSG:4326)
  private webMercatorToWGS84(x: number, y: number): [number, number] {
    const lng = (x / 20037508.34) * 180;
    let lat = (y / 20037508.34) * 180;
    lat = 180 / Math.PI * (2 * Math.atan(Math.exp(lat * Math.PI / 180)) - Math.PI / 2);
    return [lng, lat];
  }

  private isCacheValid(key: string): boolean {
    const cached = this.cache.get(key);
    if (!cached) return false;
    
    // 15-minute cache duration for smoke data
    const cacheAge = Date.now() - cached.timestamp;
    return cacheAge < 15 * 60 * 1000; // 15 minutes
  }

  // Enhanced caching with localStorage backup
  private getCachedData(key: string): any {
    // Check memory cache first
    const memoryCache = this.cache.get(key);
    if (memoryCache && this.isCacheValid(key)) {
      return memoryCache.data;
    }

    // Check localStorage cache
    try {
      const stored = localStorage.getItem(`smoke_cache_${key}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        const age = Date.now() - parsed.timestamp;
        
        // Use localStorage cache for up to 1 hour if memory cache is empty
        if (age < 60 * 60 * 1000) {
          // Restore to memory cache
          this.cache.set(key, parsed);
          return parsed.data;
        }
      }
    } catch (error) {
      console.warn('Error reading smoke data from localStorage:', error);
    }

    return null;
  }

  private setCachedData(key: string, data: any): void {
    const cacheEntry = { data, timestamp: Date.now() };
    
    // Set memory cache
    this.cache.set(key, cacheEntry);
    
    // Set localStorage cache
    try {
      localStorage.setItem(`smoke_cache_${key}`, JSON.stringify(cacheEntry));
    } catch (error) {
      console.warn('Error storing smoke data to localStorage:', error);
    }
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
