
interface Config {
  mapboxToken: string | null;
}

const getConfig = (): Config => {
  // Try to get from environment variable first
  const envToken = import.meta.env.VITE_MAPBOX_TOKEN;
  
  if (envToken) {
    return { mapboxToken: envToken };
  }

  // Fallback: get from localStorage (user can input it)
  const storedToken = localStorage.getItem('mapbox_token');
  
  return {
    mapboxToken: storedToken
  };
};

export const config = getConfig();

export const setMapboxToken = (token: string) => {
  localStorage.setItem('mapbox_token', token);
  // Update config object
  (config as any).mapboxToken = token;
};

export const hasValidMapboxToken = (): boolean => {
  return !!config.mapboxToken && config.mapboxToken.length > 0;
};
