import { WeatherData } from '@/hooks/useWeatherData';

export const weatherDataService = {
  async fetchWeatherData(
    latitude: number,
    longitude: number
  ): Promise<WeatherData> {
    const params = new URLSearchParams({
      latitude: latitude.toString(),
      longitude: longitude.toString(),
      hourly: 'temperature_2m,relative_humidity_2m,precipitation_probability,weather_code,wind_speed_10m,wind_direction_10m',
      timezone: 'auto',
    });
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?${params}`
    );
    if (!response.ok) {
      throw new Error('Failed to fetch weather data');
    }
    return response.json();
  },
};
