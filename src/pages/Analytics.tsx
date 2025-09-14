import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Area, AreaChart } from 'recharts';
import { ArrowLeft, Users, MousePointer, Clock, MapPin, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';

interface AnalyticsData {
  totalSessions: number;
  totalEvents: number;
  avgSessionDuration: number;
  uniqueLocations: number;
  topCities: Array<{ city: string; count: number }>;
  topRegions: Array<{ region: string; count: number }>;
  hourlyActivity: Array<{ hour: number; events: number }>;
  dailyActivity: Array<{ date: string; sessions: number; events: number }>;
  deviceTypes: Array<{ device_type: string; count: number }>;
  userEngagement: Array<{ interaction_type: string; count: number }>;
  sessionEngagement: Array<{ 
    session_id: string; 
    events_count: number; 
    duration_minutes: number;
    unique_interactions: number;
    cities_explored: number;
    time_changes: number;
  }>;
  engagementStats: {
    avgEventsPerSession: number;
    avgSessionDurationMinutes: number;
    bounceRate: number;
    highEngagementSessions: number;
  };
  visitorStats: {
    uniqueVisitors: number;
    userSessions: number;
    developerSessions: number;
    visitorSessionRatio: number;
  };
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(var(--accent))', 'hsl(var(--muted))', 'hsl(var(--destructive))'];

const Analytics = () => {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [timeRange, setTimeRange] = useState('7');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, [timeRange]);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const daysAgo = parseInt(timeRange);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysAgo);

      // Get base analytics - using service role to bypass RLS for admin analytics
      const { data: events, error } = await supabase
        .from('smokeusage')
        .select('*')
        .gte('timestamp', startDate.toISOString())
        .order('timestamp', { ascending: false });

      if (error) throw error;

      // Process the data
      const sessions = new Set(events?.map(e => e.session_id)).size;
      const totalEvents = events?.length || 0;

      // Calculate unique visitors using new fingerprinting
      const uniqueVisitorIds = new Set();
      const userSessionIds = new Set();
      const developerSessionIds = new Set();
      
       events?.forEach(e => {
         // Use optional chaining for new fields that may not exist yet
         const browserId = (e as any).browser_session_id || e.session_id;
         const visitorHash = (e as any).visitor_hash || e.user_agent;
         
         if (browserId && visitorHash) {
           // Combine browser session ID and visitor hash for unique visitor identification
           const visitorId = `${browserId}_${visitorHash}`;
           uniqueVisitorIds.add(visitorId);
         }
         
         if (e.session_id) {
           const isDeveloper = (e as any).is_developer || false;
           if (isDeveloper) {
             developerSessionIds.add(e.session_id);
           } else {
             userSessionIds.add(e.session_id);
           }
         }
       });

      const visitorStats = {
        uniqueVisitors: uniqueVisitorIds.size,
        userSessions: userSessionIds.size,
        developerSessions: developerSessionIds.size,
        visitorSessionRatio: uniqueVisitorIds.size > 0 ? Math.round((userSessionIds.size / uniqueVisitorIds.size) * 100) / 100 : 0
      };
      
      // Calculate average session duration
      const sessionDurations = events?.filter(e => e.page_duration_seconds)
        .map(e => Number(e.page_duration_seconds)) || [];
      const avgDuration = sessionDurations.length > 0 
        ? sessionDurations.reduce((a, b) => a + b, 0) / sessionDurations.length 
        : 0;

      // Get unique locations
      const locations = events?.filter(e => e.latitude && e.longitude)
        .map(e => `${e.latitude},${e.longitude}`) || [];
      const uniqueLocations = new Set(locations).size;

      // Top cities (exclude Boulder from analysis since it's the default)
      const cityCount: Record<string, number> = {};
      events?.forEach(e => {
        if (e.city && e.city !== 'Boulder, CO') {
          cityCount[e.city] = (cityCount[e.city] || 0) + 1;
        }
      });
      const topCities = Object.entries(cityCount)
        .map(([city, count]) => ({ city, count: Number(count) }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // Geographic distribution (top states/regions from cities, exclude default Boulder)
      const stateCount: Record<string, number> = {};
      events?.forEach(e => {
        if (e.city && e.city !== 'Boulder, CO') {
          // Extract state/region from city name (assuming format like "City, State")
          const parts = e.city.split(',');
          const state = parts.length > 1 ? parts[parts.length - 1].trim() : 'Unknown';
          stateCount[state] = (stateCount[state] || 0) + 1;
        }
      });
      const topRegions = Object.entries(stateCount)
        .map(([region, count]) => ({ region, count: Number(count) }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);

      // Hourly activity
      const hourlyCount = Array.from({ length: 24 }, (_, i) => ({ hour: i, events: 0 }));
      events?.forEach(e => {
        const hour = new Date(e.timestamp).getHours();
        hourlyCount[hour].events++;
      });

      // Daily activity
      const dailyCount: Record<string, number> = {};
      const sessionsByDay: Record<string, Set<string>> = {};
      events?.forEach(e => {
        const date = new Date(e.timestamp).toISOString().split('T')[0];
        dailyCount[date] = (dailyCount[date] || 0) + 1;
        if (!sessionsByDay[date]) {
          sessionsByDay[date] = new Set();
        }
        sessionsByDay[date].add(e.session_id);
      });
      
      const dailyActivity = Object.entries(dailyCount)
        .map(([date, events]) => ({
          date,
          events: Number(events),
          sessions: sessionsByDay[date]?.size || 0
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // Device types (count unique sessions per device type)
      const deviceSessionCount: Record<string, Set<string>> = {};
      events?.forEach(e => {
        if (e.device_type && e.session_id) {
          if (!deviceSessionCount[e.device_type]) {
            deviceSessionCount[e.device_type] = new Set();
          }
          deviceSessionCount[e.device_type].add(e.session_id);
        }
      });
      const deviceTypes = Object.entries(deviceSessionCount)
        .map(([device_type, sessions]) => ({ device_type, count: sessions.size }));

      // User engagement (interaction types)
      const engagementCount: Record<string, number> = {};
      events?.forEach(e => {
        if (e.interaction_type) {
          engagementCount[e.interaction_type] = (engagementCount[e.interaction_type] || 0) + 1;
        }
      });
      const userEngagement = Object.entries(engagementCount)
        .map(([interaction_type, count]) => ({ interaction_type, count: Number(count) }));

      // Session-based engagement analysis
      const sessionData: Record<string, any> = {};
      events?.forEach(e => {
        if (!e.session_id) return;
        
        if (!sessionData[e.session_id]) {
          sessionData[e.session_id] = {
            session_id: e.session_id,
            events: [],
            cities: new Set(),
            interactions: new Set(),
            timeChanges: 0,
            startTime: null,
            endTime: null
          };
        }
        
        const session = sessionData[e.session_id];
        session.events.push(e);
        
        if (e.city) session.cities.add(e.city);
        if (e.interaction_type) session.interactions.add(e.interaction_type);
        if (e.event_type === 'time_change') session.timeChanges++;
        
        const eventTime = new Date(e.timestamp);
        if (!session.startTime || eventTime < session.startTime) {
          session.startTime = eventTime;
        }
        if (!session.endTime || eventTime > session.endTime) {
          session.endTime = eventTime;
        }
      });

      const sessionEngagement = Object.values(sessionData).map((session: any) => {
        const durationMs = session.endTime && session.startTime 
          ? session.endTime.getTime() - session.startTime.getTime() 
          : 0;
        
        return {
          session_id: session.session_id.substring(0, 8) + '...', // Truncate for display
          events_count: session.events.length,
          duration_minutes: Math.round(durationMs / 60000 * 10) / 10, // Round to 1 decimal
          unique_interactions: session.interactions.size,
          cities_explored: session.cities.size,
          time_changes: session.timeChanges
        };
      }).sort((a, b) => b.events_count - a.events_count);

      // Calculate engagement statistics
      const totalSessionCount = Object.keys(sessionData).length;
      const avgEventsPerSession = totalSessionCount > 0 
        ? Math.round(totalEvents / totalSessionCount * 10) / 10 
        : 0;
      
      const sessionDurationsMinutes = sessionEngagement.map(s => s.duration_minutes);
      const avgSessionDurationMinutes = sessionDurationsMinutes.length > 0
        ? Math.round(sessionDurationsMinutes.reduce((a, b) => a + b, 0) / sessionDurationsMinutes.length * 10) / 10
        : 0;
      
      const bounceRate = totalSessionCount > 0
        ? Math.round(sessionEngagement.filter(s => s.events_count <= 1).length / totalSessionCount * 100)
        : 0;
      
      const highEngagementSessions = sessionEngagement.filter(s => 
        s.events_count >= 5 || s.duration_minutes >= 2 || s.unique_interactions >= 2
      ).length;

      const engagementStats = {
        avgEventsPerSession,
        avgSessionDurationMinutes,
        bounceRate,
        highEngagementSessions
      };

      setData({
        totalSessions: sessions,
        totalEvents,
        avgSessionDuration: Math.round(avgDuration),
        uniqueLocations,
        topCities,
        topRegions,
        hourlyActivity: hourlyCount,
        dailyActivity,
        deviceTypes,
        userEngagement,
        sessionEngagement: sessionEngagement.slice(0, 20), // Top 20 sessions
        engagementStats,
        visitorStats
      });
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted/20 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-muted rounded w-1/3"></div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-32 bg-muted rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link to="/" className="p-2 hover:bg-muted rounded-lg transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Analytics Dashboard</h1>
              <p className="text-muted-foreground">Detailed insights from user interactions (Mountain Time)</p>
            </div>
          </div>
          
          <Link to="/privacy-reality">
            <Button variant="outline" className="border-destructive/50 text-destructive hover:bg-destructive/10">
              Your data isn't private - read more
            </Button>
          </Link>
          
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Last 24 hours</SelectItem>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Sessions</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data?.totalSessions.toLocaleString()}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Events</CardTitle>
              <MousePointer className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data?.totalEvents.toLocaleString()}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Events/Session</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data?.engagementStats?.avgEventsPerSession || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Bounce Rate</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data?.engagementStats?.bounceRate || 0}%</div>
            </CardContent>
          </Card>
        </div>

        {/* Engagement Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Session Duration</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data?.engagementStats?.avgSessionDurationMinutes || 0}m</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">High Engagement Sessions</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data?.engagementStats?.highEngagementSessions || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Unique Locations</CardTitle>
              <MapPin className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data?.uniqueLocations.toLocaleString()}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Unique Visitors</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data?.visitorStats?.uniqueVisitors || 0}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {data?.visitorStats?.userSessions || 0} user sessions, {data?.visitorStats?.developerSessions || 0} dev sessions
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Daily Activity</CardTitle>
              <CardDescription>Sessions and events over time</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={data?.dailyActivity}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px',
                      color: 'hsl(var(--card-foreground))'
                    }}
                  />
                  <Area type="monotone" dataKey="sessions" stackId="1" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.8} />
                  <Area type="monotone" dataKey="events" stackId="2" stroke="hsl(var(--secondary))" fill="hsl(var(--secondary))" fillOpacity={0.8} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Hourly Activity</CardTitle>
              <CardDescription>Events by hour of day</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data?.hourlyActivity}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="hour" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="events" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Top Regions</CardTitle>
              <CardDescription>Geographic distribution of users</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={data?.topRegions}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ region, percent }) => `${region} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="count"
                  >
                    {data?.topRegions.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Device Types</CardTitle>
              <CardDescription>User device distribution</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data?.deviceTypes.map((device, index) => (
                  <div key={device.device_type} className="flex items-center justify-between">
                    <span className="text-sm font-medium">{device.device_type}</span>
                    <Badge variant="secondary">{device.count}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top Cities</CardTitle>
              <CardDescription>Most popular locations</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data?.topCities.slice(0, 8).map((city, index) => (
                  <div key={city.city} className="flex items-center justify-between">
                    <span className="text-sm font-medium">{city.city}</span>
                    <Badge variant="outline">{city.count}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Session Engagement Table */}
        <Card>
          <CardHeader>
            <CardTitle>Top Sessions by Engagement</CardTitle>
            <CardDescription>Detailed analysis of individual user sessions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Session ID</th>
                    <th className="text-right p-2">Events</th>
                    <th className="text-right p-2">Duration</th>
                    <th className="text-right p-2">Interactions</th>
                    <th className="text-right p-2">Cities</th>
                    <th className="text-right p-2">Time Changes</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.sessionEngagement.slice(0, 10).map((session, index) => (
                    <tr key={session.session_id} className="border-b hover:bg-muted/50">
                      <td className="p-2 font-mono text-xs">{session.session_id}</td>
                      <td className="p-2 text-right">
                        <Badge variant={session.events_count > 10 ? "default" : "secondary"}>
                          {session.events_count}
                        </Badge>
                      </td>
                      <td className="p-2 text-right">{session.duration_minutes}m</td>
                      <td className="p-2 text-right">{session.unique_interactions}</td>
                      <td className="p-2 text-right">{session.cities_explored}</td>
                      <td className="p-2 text-right">{session.time_changes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* User Engagement */}
        <Card>
          <CardHeader>
            <CardTitle>User Engagement Patterns</CardTitle>
            <CardDescription>Types of interactions users perform</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data?.userEngagement}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="interaction_type" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="hsl(var(--accent))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Analytics;