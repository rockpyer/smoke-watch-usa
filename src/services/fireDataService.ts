interface WildfireIncident {
  latitude: number;
  longitude: number;
  IncidentName?: string;
  FireDiscoveryDateTime?: string;
  ForestTypeGroup?: string;
  PercentContained?: string; // Changed to string to support "Not Available"
  DailyAcres?: string; // Changed to string to support "Not Available"
}

interface WildfirePerimeter {
  geometry: any; // Polygon geometry
  IRWINID: string;
  sum_p0010001?: number;
  WHPClass?: string;
  PctForest?: number;
  PctShrub?: number;
  PctGrass?: number;
}

interface ArcGISFeature {
  attributes: Record<string, any>;
  geometry: any;
}

interface ArcGISResponse {
  features: ArcGISFeature[];
}

interface FireData {
  incidents: WildfireIncident[];
  perimeters: WildfirePerimeter[];
  timestamp: string;
}

export class FireDataService {
  private static instance: FireDataService;
  private cache = new Map<string, FireData>();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  
  // ArcGIS Wildfire service endpoints
  private readonly WILDFIRE_BASE_URL = 'https://services9.arcgis.com/RHVPKKiFTONKtxq3/ArcGIS/rest/services/Wildfire_aggregated_v1/FeatureServer';
  private readonly INCIDENTS_LAYER = 1; // Wildfire Perimeters layer (contains incident data)
  private readonly PERIMETERS_LAYER = 0; // Wildfire Perimeters layer

  static getInstance(): FireDataService {
    if (!FireDataService.instance) {
      FireDataService.instance = new FireDataService();
    }
    return FireDataService.instance;
  }

  async fetchFireData(bounds?: { north: number; south: number; east: number; west: number }): Promise<FireData> {
    const cacheKey = `fire-data-${JSON.stringify(bounds)}`;
    
    if (this.isCacheValid(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    try {
      // Convert WGS84 bounds to Web Mercator for ArcGIS query
      const webMercatorBounds = bounds ? this.wgs84ToWebMercator(bounds) : null;

      // Fetch both incident points and perimeter polygons
      const [incidents, perimeters] = await Promise.all([
        this.fetchArcGISData(this.INCIDENTS_LAYER, webMercatorBounds),
        this.fetchArcGISData(this.PERIMETERS_LAYER, webMercatorBounds)
      ]);

      const fireData: FireData = {
        incidents: this.processIncidents(incidents),
        perimeters: this.processPerimeters(perimeters),
        timestamp: new Date().toISOString()
      };

      this.cache.set(cacheKey, fireData);
      return fireData;
    } catch (error) {
      console.error('Error fetching fire data:', error);
      return this.getFallbackFireData();
    }
  }

  private async fetchArcGISData(layerId: number, bounds?: any): Promise<ArcGISResponse> {
    const baseUrl = `${this.WILDFIRE_BASE_URL}/${layerId}/query`;
    
    // Build query parameters
    const params = new URLSearchParams({
      f: 'json',
      where: '1=1', // Get all features
      outFields: '*',
      returnGeometry: 'true',
      spatialRel: 'esriSpatialRelIntersects'
    });

    // Add spatial filter if bounds provided
    if (bounds) {
      params.append('geometry', `${bounds.xmin},${bounds.ymin},${bounds.xmax},${bounds.ymax}`);
      params.append('geometryType', 'esriGeometryEnvelope');
      params.append('inSR', '3857'); // Web Mercator
    }

    const url = `${baseUrl}?${params.toString()}`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`ArcGIS API error: ${response.status} ${response.statusText}`);
    }
    
    return await response.json();
  }

  private processIncidents(response: ArcGISResponse): WildfireIncident[] {
    return response.features.map(feature => {
      const { attributes, geometry } = feature;
      
      // For polygon geometry, get the centroid
      let latitude: number, longitude: number;
      
      if (geometry.rings) {
        // This is a polygon, calculate centroid
        const ring = geometry.rings[0]; // Use first ring
        let sumX = 0, sumY = 0;
        for (const point of ring) {
          sumX += point[0];
          sumY += point[1];
        }
        const centroidX = sumX / ring.length;
        const centroidY = sumY / ring.length;
        [longitude, latitude] = this.webMercatorToWGS84(centroidX, centroidY);
      } else {
        // This is a point
        [longitude, latitude] = this.webMercatorToWGS84(geometry.x, geometry.y);
      }
      
      return {
        latitude,
        longitude,
        IncidentName: attributes.IncidentName || "Not Available",
        FireDiscoveryDateTime: attributes.DateCurrent ? new Date(attributes.DateCurrent).toLocaleDateString() : "Not Available",
        ForestTypeGroup: attributes.ForestTypeGroup || "Not Available", 
        PercentContained: "Not Available", // Not available in this API
        DailyAcres: attributes.GISAcres ? Math.round(attributes.GISAcres).toString() : "Not Available"
      };
    });
  }

  private processPerimeters(response: ArcGISResponse): WildfirePerimeter[] {
    return response.features.map(feature => {
      const { attributes, geometry } = feature;
      
      return {
        geometry,
        IRWINID: attributes.IRWINID || 'Unknown',
        sum_p0010001: attributes.sum_p0010001,
        WHPClass: attributes.WHPClass,
        PctForest: attributes.PctForest,
        PctShrub: attributes.PctShrub,
        PctGrass: attributes.PctGrass
      };
    });
  }

  private wgs84ToWebMercator(bounds: { north: number; south: number; east: number; west: number }) {
    const toWebMercator = (lon: number, lat: number) => {
      const x = lon * 20037508.34 / 180;
      let y = Math.log(Math.tan((90 + lat) * Math.PI / 360)) / (Math.PI / 180);
      y = y * 20037508.34 / 180;
      return { x, y };
    };

    const sw = toWebMercator(bounds.west, bounds.south);
    const ne = toWebMercator(bounds.east, bounds.north);

    return {
      xmin: sw.x,
      ymin: sw.y,
      xmax: ne.x,
      ymax: ne.y
    };
  }

  private webMercatorToWGS84(x: number, y: number): [number, number] {
    const lon = (x / 20037508.34) * 180;
    let lat = (y / 20037508.34) * 180;
    lat = 180 / Math.PI * (2 * Math.atan(Math.exp(lat * Math.PI / 180)) - Math.PI / 2);
    return [lon, lat];
  }

  private getFallbackFireData(): FireData {
    return {
      incidents: [],
      perimeters: [],
      timestamp: new Date().toISOString()
    };
  }

  private isCacheValid(key: string): boolean {
    const data = this.cache.get(key);
    if (!data) return false;
    
    const cacheTime = new Date(data.timestamp).getTime();
    return Date.now() - cacheTime < this.CACHE_DURATION;
  }

  // Get color based on Wildfire Hazard Potential
  getWHPColor(whpClass: string): string {
    switch (whpClass?.toLowerCase()) {
      case 'very low': return 'rgb(0, 255, 0)';      // Green
      case 'low': return 'rgb(255, 255, 0)';         // Yellow
      case 'moderate': return 'rgb(255, 165, 0)';    // Orange
      case 'high': return 'rgb(255, 69, 0)';         // Red-Orange
      case 'very high': return 'rgb(255, 0, 0)';     // Red
      default: return 'rgb(139, 0, 0)';              // Dark Red - Unknown/Extreme
    }
  }

  // Get size based on population at risk (smaller sizes to not obscure smoke)
  getIncidentSize(population?: number): number {
    if (!population) return 2;
    if (population < 100) return 2;
    if (population < 1000) return 3;
    if (population < 5000) return 4;
    if (population < 10000) return 5;
    return 6; // Maximum size reduced from 15 to 6
  }
}

export const fireDataService = FireDataService.getInstance();