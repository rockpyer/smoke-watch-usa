
import React from 'react';

export const ForecastSkeleton = ({ compact = false }: { compact?: boolean }) => (
  <div className={`${compact ? 'p-2' : 'p-3'} bg-background/95 backdrop-blur-sm shadow-lg max-w-2xl animate-pulse`}>
    <div className="flex items-center justify-between mb-2">
      <div className={`${compact ? 'h-3' : 'h-4'} bg-gray-300 rounded w-48`}></div>
      <div className="h-6 w-6 bg-gray-300 rounded"></div>
    </div>
    <div className="flex justify-between text-[9px] h-3 mb-1">
      <div className="h-2 bg-gray-200 rounded w-12"></div>
      <div className="h-2 bg-gray-200 rounded w-12"></div>
      <div className="h-2 bg-gray-200 rounded w-12"></div>
    </div>
    <div className="flex items-center space-x-0.5 py-1">
      {Array.from({ length: 48 }, (_, i) => (
        <div key={i} className="bg-gray-300 h-3 sm:h-4 w-2 sm:w-2.5 rounded flex-shrink-0"></div>
      ))}
    </div>
    <div className="flex justify-between mt-1">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="h-2 bg-gray-200 rounded w-8"></div>
      ))}
    </div>
  </div>
);

export const MapInfoSkeleton = () => (
  <div className="absolute bottom-16 left-4 bg-background/95 backdrop-blur-sm rounded-lg shadow-lg p-3 min-w-[320px] max-w-[400px] animate-pulse">
    <div className="h-4 bg-gray-300 rounded w-48 mb-2"></div>
    <div className="h-3 bg-gray-200 rounded w-32 mb-1"></div>
    <div className="h-3 bg-gray-200 rounded w-40"></div>
  </div>
);

export const MapSkeleton = () => (
  <div className="absolute inset-0 bg-gray-100 rounded-lg animate-pulse flex items-center justify-center">
    <div className="text-center">
      <div className="h-8 w-8 bg-gray-300 rounded-full mx-auto mb-3"></div>
      <div className="h-4 bg-gray-300 rounded w-32 mb-2"></div>
      <div className="h-3 bg-gray-200 rounded w-24"></div>
    </div>
    {/* Fixed position map info skeleton to prevent layout shift */}
    <MapInfoSkeleton />
  </div>
);
