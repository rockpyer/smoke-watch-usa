import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ExternalLink, Trash2, Shield, Eye, Fingerprint, ArrowLeft } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { analyticsService } from '@/services/analyticsService';
import { supabase } from '@/integrations/supabase/client';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';

const PrivacyReality = () => {
  const [userFingerprint, setUserFingerprint] = useState<any>(null);
  const [sessionData, setSessionData] = useState<any>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [deletedCount, setDeletedCount] = useState<number | null>(null);
  const [dataCount, setDataCount] = useState<number | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);

  useEffect(() => {
    // Get current session fingerprint data from analytics service
    const fingerprint = {
      browserSessionId: sessionStorage.getItem('analytics_browser_session_id') || 'Unknown',
      visitorHash: (analyticsService as any).visitorFingerprint?.visitorHash || 'calculating...'
    };
    
    setUserFingerprint(fingerprint);
    setSessionData({
      sessionId: 'session-' + Date.now(),
      sessionStart: new Date().toISOString(),
      userAgent: navigator.userAgent,
      referrer: document.referrer || 'Direct',
      location: window.location.href,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: navigator.language,
      platform: navigator.platform
    });

    // Query existing data count
    queryUserData();
  }, []);

  const queryUserData = async () => {
    try {
      const browserSessionId = sessionStorage.getItem('analytics_browser_session_id');
      const visitorHash = (analyticsService as any).visitorFingerprint?.visitorHash;
      
      if (!browserSessionId && !visitorHash) {
        setDataCount(0);
        return;
      }

      const { count } = await supabase
        .from('smokeusage')
        .select('*', { count: 'exact', head: true })
        .or(`browser_session_id.eq.${browserSessionId},visitor_hash.eq.${visitorHash}`);

      setDataCount(count || 0);
    } catch (error) {
      console.error('Error querying user data:', error);
      setDataCount(0);
    }
  };

  const clearUserData = async () => {
    if (!showConfirmation) {
      setShowConfirmation(true);
      return;
    }

    setIsClearing(true);
    setShowConfirmation(false);
    
    try {
      const browserSessionId = sessionStorage.getItem('analytics_browser_session_id');
      const visitorHash = (analyticsService as any).visitorFingerprint?.visitorHash;
      
      if (!browserSessionId && !visitorHash) {
        toast({
          title: "No Data Found",
          description: "No tracking data found for your session.",
        });
        setIsClearing(false);
        return;
      }

      // Delete records matching the current session identifiers
      const { count } = await supabase
        .from('smokeusage')
        .delete({ count: 'exact' })
        .or(`browser_session_id.eq.${browserSessionId},visitor_hash.eq.${visitorHash}`);
      
      setDeletedCount(count || 0);
      setDataCount(0);
      
      // Track the data clearing event (ironically)
      analyticsService.trackEvent({
        event_type: 'privacy_data_cleared',
        extra_data: { deleted_count: count || 0 }
      });
      
      toast({
        title: "Data Cleared",
        description: `Deleted ${count || 0} records of your activity from our database.`,
      });
    } catch (error) {
      console.error('Error clearing user data:', error);
      toast({
        title: "Error",
        description: "Failed to clear your data. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <Helmet>
        <title>Privacy Reality Check — TrailSmoke</title>
        <meta name="description" content="See exactly what TrailSmoke records about your visit, clear your data, and learn how to improve your browsing privacy." />
        <link rel="canonical" href="https://trailsmoke.lovable.app/privacy-reality" />
        <meta property="og:title" content="Privacy Reality Check — TrailSmoke" />
        <meta property="og:description" content="What TrailSmoke records, how to clear it, and tools to improve your privacy." />
        <meta property="og:url" content="https://trailsmoke.lovable.app/privacy-reality" />
      </Helmet>
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Header with Back Button */}
        <div className="flex items-center justify-between mb-6">
          <Link to="/" className="p-2 hover:bg-muted rounded-lg transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="text-center space-y-4 flex-1">
          <h1 className="text-4xl font-bold text-foreground">
            Your Data Isn't Private
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Here's exactly what gets recorded about you right now. Most websites collect this and more - this site is just being honest about it.
          </p>
          <h2 className="sr-only">Privacy details, recorded data, and tools to improve privacy</h2>
          </div>
          <div className="w-9"></div> {/* Spacer for centering */}
        </div>

        {/* Current Session Data */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Fingerprint className="h-5 w-5" />
              Your Digital Fingerprint
            </CardTitle>
            <CardDescription>
              This is what can identify you, even without cookies
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <h3 className="font-semibold">Browser Session ID</h3>
                <p className="text-sm font-mono bg-muted p-2 rounded">{userFingerprint?.browserSessionId}</p>
              </div>
              
              <div className="space-y-2">
                <h3 className="font-semibold">Visitor Hash</h3>
                <p className="text-sm font-mono bg-muted p-2 rounded">{userFingerprint?.visitorHash}</p>
              </div>
              
              <div className="space-y-2">
                <h3 className="font-semibold">Device Info</h3>
                <p className="text-sm bg-muted p-2 rounded">{sessionData?.platform}</p>
              </div>
              
              <div className="space-y-2">
                <h3 className="font-semibold">Screen Size</h3>
                <p className="text-sm bg-muted p-2 rounded">{sessionData?.viewport}</p>
              </div>
              
              <div className="space-y-2">
                <h3 className="font-semibold">Location</h3>
                <p className="text-sm bg-muted p-2 rounded">{sessionData?.timezone}</p>
              </div>
              
              <div className="space-y-2">
                <h3 className="font-semibold">Language</h3>
                <p className="text-sm bg-muted p-2 rounded">{sessionData?.language}</p>
              </div>
            </div>

          </CardContent>
        </Card>

        {/* What We Track */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              What Gets Recorded
            </CardTitle>
            <CardDescription>
              Every click, search, and interaction gets logged to a Supabase PostgreSQL database
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-3 border rounded-lg">
                <h3 className="font-semibold text-sm">Location Data</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  When you click the map or search for cities
                </p>
              </div>
              
              <div className="p-3 border rounded-lg">
                <h3 className="font-semibold text-sm">Time Interactions</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Every time you change the forecast time
                </p>
              </div>
              
              <div className="p-3 border rounded-lg">
                <h3 className="font-semibold text-sm">Search Queries</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  What cities and places you search for
                </p>
              </div>
              
              <div className="p-3 border rounded-lg">
                <h3 className="font-semibold text-sm">Session Length</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  How long you spend on the site
                </p>
              </div>
              
              <div className="p-3 border rounded-lg">
                <h3 className="font-semibold text-sm">Device Details</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Browser, OS, screen size, timezone
                </p>
              </div>
              
              <div className="p-3 border rounded-lg">
                <h3 className="font-semibold text-sm">Referrer Info</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Where you came from: {sessionData?.referrer}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Clear Your Data */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              Clear Your Data
            </CardTitle>
            <CardDescription>
              Delete your records from the Supabase PostgreSQL database (but this won't help with other sites)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {dataCount !== null && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm">
                  <strong>Current records:</strong> {dataCount} events tracked for your session.
                </p>
              </div>
            )}
            
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
              <p className="text-sm text-muted-foreground">
                <strong>Reality check:</strong> Clearing data here only removes YOUR records from THIS database. 
                Every other website you visit still tracks you. This is just one site being transparent.
              </p>
            </div>
            
            {showConfirmation && (
              <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                <p className="text-sm font-medium mb-2">Are you sure?</p>
                <p className="text-sm text-muted-foreground mb-3">
                  This will permanently delete {dataCount || 0} records of your activity from our database.
                </p>
                <div className="flex gap-2">
                  <Button 
                    onClick={clearUserData} 
                    disabled={isClearing}
                    size="sm"
                    variant="destructive"
                  >
                    {isClearing ? 'Deleting...' : 'Yes, Delete My Data'}
                  </Button>
                  <Button 
                    onClick={() => setShowConfirmation(false)}
                    size="sm"
                    variant="outline"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
            
            {!showConfirmation && (
              <Button 
                onClick={clearUserData} 
                disabled={isClearing || dataCount === 0}
                className="w-full"
                variant="destructive"
              >
                {dataCount === 0 ? 'No Data to Clear' : 'Clear My Data From This Site'}
              </Button>
            )}
            
            {deletedCount !== null && (
              <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                <p className="text-sm">
                  ✅ Deleted {deletedCount} records of your activity from our database.
                  {deletedCount > 0 && " (We logged that you clicked 'Clear Data' though 😉)"}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Real Privacy Help */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Want Real Privacy? Here's How
            </CardTitle>
            <CardDescription>
              Actual tools that protect you across the entire web
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 border rounded-lg">
                <h3 className="font-semibold">Use a VPN</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Hides your real location from all websites
                </p>
                <a 
                  href="https://protonvpn.com" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline text-sm flex items-center gap-1 mt-2"
                >
                  Proton VPN <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              
              <div className="p-4 border rounded-lg">
                <h3 className="font-semibold">Firefox with Privacy Settings</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Enable strict tracking protection
                </p>
                <a 
                  href="https://support.mozilla.org/en-US/kb/enhanced-tracking-protection-firefox-desktop" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline text-sm flex items-center gap-1 mt-2"
                >
                  Privacy Guide <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              
              <div className="p-4 border rounded-lg">
                <h3 className="font-semibold">uBlock Origin</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Blocks trackers and ads on most sites
                </p>
                <a 
                  href="https://ublockorigin.com" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline text-sm flex items-center gap-1 mt-2"
                >
                  Get uBlock Origin <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              
              <div className="p-4 border rounded-lg">
                <h3 className="font-semibold">DuckDuckGo</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Search engine that doesn't track you
                </p>
                <a 
                  href="https://duckduckgo.com" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline text-sm flex items-center gap-1 mt-2"
                >
                  Use DuckDuckGo <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
            
            <Separator />
            
            <div className="p-4 bg-muted/50 rounded-lg">
              <h3 className="font-semibold">The Reality</h3>
              <p className="text-sm text-muted-foreground mt-2">
                This site can't make you private - only YOU can do that. Most websites collect way more data than this 
                and sell it to advertisers. At least this site tells you what gets collected and lets you delete it.
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                <strong>Remember:</strong> Your ISP, Google, Facebook, and countless others are tracking you right now. 
                This site showing you smoke forecasts is probably the least of your privacy concerns.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">
            At least we're being honest about it. 🤷‍♀️
          </p>
        </div>
      </div>
    </div>
  );
};

export default PrivacyReality;