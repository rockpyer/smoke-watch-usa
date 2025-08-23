
import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AlertCircle, Key } from 'lucide-react';
import { setMapboxToken } from '@/utils/config';

interface MapboxTokenInputProps {
  onTokenSet: () => void;
}

const MapboxTokenInput: React.FC<MapboxTokenInputProps> = ({ onTokenSet }) => {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    if (!token.trim()) {
      setError('Please enter a valid Mapbox token');
      return;
    }

    if (!token.startsWith('pk.')) {
      setError('Mapbox public tokens should start with "pk."');
      return;
    }

    setMapboxToken(token.trim());
    setError('');
    onTokenSet();
  };

  return (
    <div className="absolute inset-0 bg-sky-gradient flex items-center justify-center z-30">
      <Card className="p-6 max-w-md mx-4">
        <div className="space-y-4 text-center">
          <div className="flex items-center justify-center space-x-2 text-primary">
            <Key className="h-5 w-5" />
            <h3 className="text-lg font-semibold">Mapbox Token Required</h3>
          </div>
          
          <p className="text-sm text-muted-foreground">
            Please enter your Mapbox public token to display the map.
          </p>
          
          <div className="space-y-2">
            <Input
              type="password"
              placeholder="pk.your_mapbox_token_here"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
            />
            {error && (
              <div className="flex items-center space-x-1 text-destructive text-sm">
                <AlertCircle className="h-4 w-4" />
                <span>{error}</span>
              </div>
            )}
          </div>
          
          <Button onClick={handleSubmit} className="w-full">
            Set Token
          </Button>
          
          <p className="text-xs text-muted-foreground">
            Get your free token at{' '}
            <a 
              href="https://account.mapbox.com/access-tokens/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              mapbox.com
            </a>
          </p>
        </div>
      </Card>
    </div>
  );
};

export default MapboxTokenInput;
