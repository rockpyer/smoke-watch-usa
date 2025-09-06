import { useState, useEffect } from 'react';
import { weatherDataService } from '@/services/weatherDataService';

export interface WeatherData {
  hourly: {
    time: string[];
    temperature_2m: number[];
    relative_humidity_2m: number[];
    precipitation_probability: number[];
    weather_code: number[];
    wind_speed_10m: number[];
    wind_direction_10m: number[];
  };
}

export const useWeatherData = (latitude: number, longitude: number) => {
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const data = await weatherDataService.fetchWeatherData(
          latitude,
          longitude
        );
        setWeatherData(data);
      } catch (err) {
        setError('Failed to fetch weather data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [latitude, longitude]);

  return { weatherData, loading, error };
};
