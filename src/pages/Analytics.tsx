import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  eventTypes: Array<{ event_type: string; count: number }>;
  hourlyActivity: Array<{ hour: number; events: number }>;
  dailyActivity: Array<{ date: string; sessions: number; events: number }>;
  deviceTypes: Array<{ device_type: string; count: number }>;
  userEngagement: Array<{ interaction_type: string; count: number }>;
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

      // Get base analytics
      const { data: events, error } = await supabase
        .from('smokeusage')
        .select('*')
        .gte('timestamp', startDate.toISOString());

      if (error) throw error;

      // Process the data
      const sessions = new Set(events?.map(e => e.session_id)).size;
      const totalEvents = events?.length || 0;
      
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

      // Top cities
      const cityCount: Record<string, number> = {};
      events?.forEach(e => {
        if (e.city) {
          cityCount[e.city] = (cityCount[e.city] || 0) + 1;
        }
      });
      const topCities = Object.entries(cityCount)
        .map(([city, count]) => ({ city, count: Number(count) }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // Event types
      const eventTypeCount: Record<string, number> = {};
      events?.forEach(e => {
        if (e.event_type) {
          eventTypeCount[e.event_type] = (eventTypeCount[e.event_type] || 0) + 1;
        }
      });
      const eventTypes = Object.entries(eventTypeCount)
        .map(([event_type, count]) => ({ event_type, count: Number(count) }));

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

      // Device types
      const deviceCount: Record<string, number> = {};
      events?.forEach(e => {
        if (e.device_type) {
          deviceCount[e.device_type] = (deviceCount[e.device_type] || 0) + 1;
        }
      });
      const deviceTypes = Object.entries(deviceCount)
        .map(([device_type, count]) => ({ device_type, count: Number(count) }));

      // User engagement (interaction types)
      const engagementCount: Record<string, number> = {};
      events?.forEach(e => {
        if (e.interaction_type) {
          engagementCount[e.interaction_type] = (engagementCount[e.interaction_type] || 0) + 1;
        }
      });
      const userEngagement = Object.entries(engagementCount)
        .map(([interaction_type, count]) => ({ interaction_type, count: Number(count) }));

      setData({
        totalSessions: sessions,
        totalEvents,
        avgSessionDuration: Math.round(avgDuration),
        uniqueLocations,
        topCities,
        eventTypes,
        hourlyActivity: hourlyCount,
        dailyActivity,
        deviceTypes,
        userEngagement
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
              <p className="text-muted-foreground">Detailed insights from user interactions</p>
            </div>
          </div>
          
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
              <CardTitle className="text-sm font-medium">Avg Session Duration</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{Math.floor((data?.avgSessionDuration || 0) / 60)}m {(data?.avgSessionDuration || 0) % 60}s</div>
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
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Area type="monotone" dataKey="sessions" stackId="1" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.3} />
                  <Area type="monotone" dataKey="events" stackId="2" stroke="hsl(var(--secondary))" fill="hsl(var(--secondary))" fillOpacity={0.3} />
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
              <CardTitle>Event Types</CardTitle>
              <CardDescription>Distribution of user interactions</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={data?.eventTypes}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ event_type, percent }) => `${event_type} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="count"
                  >
                    {data?.eventTypes.map((entry, index) => (
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