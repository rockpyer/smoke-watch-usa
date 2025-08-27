import { AsyncProcessor } from './asyncProcessor';

// Web Worker for heavy geometry calculations
const geometryWorkerCode = `
self.onmessage = function(e) {
  const { type, data } = e.data;
  
  if (type === 'pointInPolygon') {
    const { point, polygons } = data;
    const results = [];
    
    for (let i = 0; i < polygons.length; i++) {
      const polygon = polygons[i];
      const result = isPointInPolygon(point, polygon.coordinates);
      if (result) {
        results.push({
          index: i,
          properties: polygon.properties
        });
      }
    }
    
    self.postMessage({ type: 'pointInPolygonResult', results });
  }
};

function isPointInPolygon(point, polygon) {
  const x = point.lng;
  const y = point.lat;
  let inside = false;

  if (!polygon || polygon.length < 4) return false;
  
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];

    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }

  return inside;
}
`;

export class GeometryWorker {
  private worker: Worker | null = null;
  private isSupported = typeof Worker !== 'undefined';

  constructor() {
    if (this.isSupported) {
      try {
        const blob = new Blob([geometryWorkerCode], { type: 'application/javascript' });
        this.worker = new Worker(URL.createObjectURL(blob));
      } catch (error) {
        console.warn('Web Worker not supported, falling back to main thread');
        this.isSupported = false;
      }
    }
  }

  async pointInPolygon(
    point: { lat: number; lng: number }, 
    polygons: Array<{ coordinates: number[][], properties: any }>
  ): Promise<Array<{ index: number; properties: any }>> {
    if (!this.isSupported || !this.worker) {
      // Fallback to main thread with async processing
      return this.pointInPolygonMainThread(point, polygons);
    }

    return new Promise((resolve) => {
      const handleMessage = (e: MessageEvent) => {
        if (e.data.type === 'pointInPolygonResult') {
          this.worker!.removeEventListener('message', handleMessage);
          resolve(e.data.results);
        }
      };

      this.worker.addEventListener('message', handleMessage);
      this.worker.postMessage({
        type: 'pointInPolygon',
        data: { point, polygons }
      });
    });
  }

  private async pointInPolygonMainThread(
    point: { lat: number; lng: number }, 
    polygons: Array<{ coordinates: number[][], properties: any }>
  ): Promise<Array<{ index: number; properties: any }>> {
    const results: Array<{ index: number; properties: any }> = [];
    
    // Process in smaller chunks to prevent blocking
    await AsyncProcessor.processInChunks(
      polygons,
      async (polygon, index) => {
        if (this.isPointInPolygonSync(point, polygon.coordinates)) {
          results.push({ index, properties: polygon.properties });
        }
      },
      { chunkSize: 10, timeSlice: 3 }
    );
    
    return results;
  }

  private isPointInPolygonSync(point: { lat: number; lng: number }, polygon: number[][]): boolean {
    const x = point.lng;
    const y = point.lat;
    let inside = false;

    if (!polygon || polygon.length < 4) return false;
    
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0];
      const yi = polygon[i][1];
      const xj = polygon[j][0];
      const yj = polygon[j][1];

      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }

    return inside;
  }

  destroy() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}
