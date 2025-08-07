interface FireHotspot {
  latitude: number;
  longitude: number;
  brightness: number;
  scan: number;
  track: number;
  acq_date: string;
  acq_time: string;
  satellite: string;
  instrument: string;
  confidence: number;
  version: string;
  bright_t31: number;
  frp: number; // Fire Radiative Power in MW
  daynight: string;
}

interface FireData {
  hotspots: FireHotspot[];
  timestamp: string;
}

export class FireDataService {
  private static instance: FireDataService;
  private cache = new Map<string, FireData>();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  
  // NASA FIRMS API endpoints
  private readonly FIRMS_MODIS_ENDPOINT = 'https://firms.modaps.eosdis.nasa.gov/mapserver/api/area/csv';
  private readonly FIRMS_VIIRS_ENDPOINT = 'https://firms.modaps.eosdis.nasa.gov/mapserver/api/area/csv';
  
  // Default map key for public access (users should get their own for production)
  private readonly DEFAULT_MAP_KEY = 'YOUR_FIRMS_MAP_KEY';

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
      // Use CONUS bounds if none provided
      const area = bounds || {
        north: 50,
        south: 25,
        east: -65,
        west: -125
      };

      // Fetch both MODIS and VIIRS data for last 24 hours
      const [modisData, viirsData] = await Promise.all([
        this.fetchFIRMSData('MODIS_NRT', area, 1),
        this.fetchFIRMSData('VIIRS_SNPP_NRT', area, 1)
      ]);

      const combinedHotspots = [...modisData, ...viirsData];
      
      const fireData: FireData = {
        hotspots: combinedHotspots,
        timestamp: new Date().toISOString()
      };

      this.cache.set(cacheKey, fireData);
      return fireData;
    } catch (error) {
      console.error('Error fetching fire data:', error);
      return this.getFallbackFireData();
    }
  }

  private async fetchFIRMSData(source: string, area: any, dayRange: number): Promise<FireHotspot[]> {
    // For demo purposes, we'll simulate the API call since we need a real API key
    // In production, use: 
    // const url = `${this.FIRMS_MODIS_ENDPOINT}/${this.DEFAULT_MAP_KEY}/${source}/${area.west},${area.south},${area.east},${area.north}/${dayRange}`;
    
    // Return simulated fire data for demonstration
    return this.generateSimulatedFireData(area);
  }

  private generateSimulatedFireData(area: any): FireHotspot[] {
    const hotspots: FireHotspot[] = [];
    const fireCount = Math.floor(Math.random() * 15) + 5; // 5-20 fires

    for (let i = 0; i < fireCount; i++) {
      const lat = area.south + Math.random() * (area.north - area.south);
      const lng = area.west + Math.random() * (area.east - area.west);
      
      // Focus some fires in known fire-prone areas (e.g., California, Colorado)
      const isInColorado = lat >= 37 && lat <= 41 && lng >= -109 && lng <= -102;
      const isInCalifornia = lat >= 32 && lat <= 42 && lng >= -124 && lng <= -114;
      
      let frp = Math.random() * 50; // Base FRP 0-50 MW
      if (isInColorado || isInCalifornia) {
        frp = Math.random() * 200 + 20; // Higher FRP for active fire regions
      }

      hotspots.push({
        latitude: lat,
        longitude: lng,
        brightness: 300 + Math.random() * 100,
        scan: 1.0,
        track: 1.0,
        acq_date: new Date().toISOString().split('T')[0],
        acq_time: new Date().toTimeString().split(' ')[0],
        satellite: Math.random() > 0.5 ? 'Terra' : 'Aqua',
        instrument: Math.random() > 0.5 ? 'MODIS' : 'VIIRS',
        confidence: Math.floor(Math.random() * 40) + 60, // 60-100%
        version: '6.1NRT',
        bright_t31: 280 + Math.random() * 50,
        frp: Math.round(frp * 10) / 10,
        daynight: 'D'
      });
    }

    return hotspots;
  }

  private getFallbackFireData(): FireData {
    return {
      hotspots: this.generateSimulatedFireData({
        north: 50,
        south: 25,
        east: -65,
        west: -125
      }),
      timestamp: new Date().toISOString()
    };
  }

  private isCacheValid(key: string): boolean {
    const data = this.cache.get(key);
    if (!data) return false;
    
    const cacheTime = new Date(data.timestamp).getTime();
    return Date.now() - cacheTime < this.CACHE_DURATION;
  }

  // Get color based on Fire Radiative Power
  getFRPColor(frp: number): string {
    if (frp < 10) return 'rgb(255, 255, 0)';     // Yellow - Low intensity
    if (frp < 25) return 'rgb(255, 165, 0)';     // Orange - Moderate intensity  
    if (frp < 50) return 'rgb(255, 69, 0)';      // Red-Orange - High intensity
    if (frp < 100) return 'rgb(255, 0, 0)';      // Red - Very high intensity
    return 'rgb(139, 0, 0)';                     // Dark Red - Extreme intensity
  }

  // Get size based on Fire Radiative Power
  getFRPSize(frp: number): number {
    if (frp < 10) return 6;
    if (frp < 25) return 8;
    if (frp < 50) return 10;
    if (frp < 100) return 12;
    return 15;
  }
}

export const fireDataService = FireDataService.getInstance();