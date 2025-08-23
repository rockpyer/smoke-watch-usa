
interface Config {
  mapboxToken: string | null;
}

const getConfig = (): Config => {
  // Try to get from environment variable first
  const envToken = import.meta.env.VITE_MAPBOX_TOKEN;
  
  if (envToken && envToken !== 'pk.your_mapbox_public_token_here') {
    console.log('Using environment variable token');
    return { mapboxToken: envToken };
  }

  // Fallback: get from localStorage (user can input it)
  const storedToken = localStorage.getItem('mapbox_token');
  
  if (storedToken) {
    console.log('Using stored token from localStorage');
    return { mapboxToken: storedToken };
  }

  console.log('No valid token found');
  return { mapboxToken: null };
};

export const config = getConfig();

export const setMapboxToken = (token: string) => {
  localStorage.setItem('mapbox_token', token);
  // Update config object
  (config as any).mapboxToken = token;
  console.log('Token updated in config');
};

export const hasValidMapboxToken = (): boolean => {
  const hasToken = !!config.mapboxToken && config.mapboxToken.length > 0 && config.mapboxToken.startsWith('pk.');
  console.log('Token validation:', { 
    hasToken: !!config.mapboxToken, 
    validLength: config.mapboxToken && config.mapboxToken.length > 0,
    validFormat: config.mapboxToken && config.mapboxToken.startsWith('pk.'),
    result: hasToken 
  });
  return hasToken;
};
