import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point as turfPoint } from '@turf/helpers';

// Based on src/services/smokeDataService.ts
export interface SmokePolygon {
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

export interface SmokeLayer {
  timestamp: Date;
  data: SmokePolygon[];
}

export interface SmokeData {
  frames: SmokeLayer[];
}

export const getAQIForLocation = (
  location: { lat: number; lng: number },
  smokeData: SmokeData | null,
  frameIndex: number
): number | null => {
  if (!smokeData || !location) {
    return null;
  }

  const frameData = smokeData.frames[frameIndex];
  if (!frameData) {
    return null;
  }

  const point = turfPoint([location.lng, location.lat]);

  for (const feature of frameData.data) {
    if (booleanPointInPolygon(point, feature.geometry)) {
      return feature.properties.concentration_ugm3;
    }
  }

  return null;
};

export const getSmokeDataForLocation = (
  location: { lat: number; lng: number } | null,
  smokeData: SmokeData | null,
  frameIndex: number
): SmokePolygon['properties'] | null => {
  if (!smokeData || !location) {
    return null;
  }

  const frameData = smokeData.frames[frameIndex];
  if (!frameData) {
    return null;
  }

  const point = turfPoint([location.lng, location.lat]);

  for (const feature of frameData.data) {
    if (booleanPointInPolygon(point, feature.geometry)) {
      return feature.properties;
    }
  }

  return null;
};