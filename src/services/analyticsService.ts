import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

export type AnalyticsEventType = 
  | 'page_load'
  | 'city_search' 
  | 'location_click'
  | 'time_change'
  | 'forecast_view';

export interface AnalyticsEvent {
  event_type: AnalyticsEventType;
  latitude?: number;
  longitude?: number;
  city?: string;
  zoom_level?: number;
  session_id: string;
  device_type?: string;
  user_agent?: string;
  referrer?: string;
  search_query?: string;
  interaction_type?: string;
  previous_time?: string;
  new_time?: string;
  forecast_available?: boolean;
  extra_data?: Record<string, any>;
  session_start_time?: string;
  session_end_time?: string;
  page_duration_seconds?: number;
}

class AnalyticsService {
  private sessionId: string;
  private sessionStartTime: Date;
  private eventQueue: AnalyticsEvent[] = [];
  private flushTimeout: NodeJS.Timeout | null = null;

  constructor() {
    this.sessionId = crypto.randomUUID();
    this.sessionStartTime = new Date();
    console.log('📊 Analytics: Starting new session', this.sessionId);
    this.setupBeforeUnload();
    // Try to retry any failed events from previous sessions
    this.retryFailedEvents();
  }

  private setupBeforeUnload() {
    window.addEventListener('beforeunload', () => {
      this.endSession();
    });

    // Handle visibility change for mobile/tab switching
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        console.log('📊 Analytics: Page hidden, flushing events');
        this.flushQueue();
      }
    });

    // Flush events periodically to prevent data loss
    setInterval(() => {
      if (this.eventQueue.length > 0) {
        console.log('📊 Analytics: Periodic flush of', this.eventQueue.length, 'events');
        this.flushQueue();
      }
    }, 10000); // Flush every 10 seconds if there are pending events
  }

  private getDeviceType(): string {
    const userAgent = navigator.userAgent;
    if (/tablet|ipad|playbook|silk/i.test(userAgent)) return 'tablet';
    if (/mobile|iphone|ipod|android|blackberry|opera|mini|windows\sce|palm|smartphone|iemobile/i.test(userAgent)) return 'mobile';
    return 'desktop';
  }

  async trackEvent(event: Partial<AnalyticsEvent>) {
    const analyticsEvent: AnalyticsEvent = {
      event_type: event.event_type!,
      session_id: this.sessionId,
      device_type: this.getDeviceType(),
      user_agent: navigator.userAgent,
      referrer: document.referrer || undefined,
      session_start_time: this.sessionStartTime.toISOString(),
      ...event
    };

    console.log('📊 Analytics: Tracking event', analyticsEvent.event_type, analyticsEvent);
    this.eventQueue.push(analyticsEvent);
    this.scheduleFlush();
  }

  private scheduleFlush() {
    if (this.flushTimeout) return;
    
    this.flushTimeout = setTimeout(() => {
      this.flushQueue();
    }, 500); // Batch events for 500ms for faster tracking
  }

  private async flushQueue() {
    if (this.eventQueue.length === 0) return;

    const events = [...this.eventQueue];
    this.eventQueue = [];
    
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = null;
    }

    console.log('📊 Analytics: Flushing', events.length, 'events to Supabase');

    try {
      const insertData = events.map(event => ({
        event_type: event.event_type,
        latitude: event.latitude,
        longitude: event.longitude,
        city: event.city,
        zoom_level: event.zoom_level,
        session_id: event.session_id,
        device_type: event.device_type,
        user_agent: event.user_agent,
        referrer: event.referrer,
        search_query: event.search_query,
        interaction_type: event.interaction_type,
        previous_time: event.previous_time || null,
        new_time: event.new_time || null,
        forecast_available: event.forecast_available,
        extra_data: event.extra_data,
        session_start_time: event.session_start_time || null,
        session_end_time: event.session_end_time || null,
        page_duration_seconds: event.page_duration_seconds,
        timestamp: new Date().toISOString()
      }));

      const { data, error } = await supabase
        .from('smokeusage')
        .insert(insertData as any);

      if (error) {
        console.error('📊 Analytics: Insert failed:', error);
        // Store failed events in localStorage for retry
        this.storeFailedEvents(events);
        // Re-queue events on failure
        this.eventQueue.unshift(...events);
      } else {
        console.log('📊 Analytics: Successfully inserted', events.length, 'events');
        // Try to send any previously failed events
        this.retryFailedEvents();
      }
    } catch (error) {
      console.error('📊 Analytics: Network error:', error);
      // Store failed events in localStorage for retry
      this.storeFailedEvents(events);
      // Re-queue events on failure
      this.eventQueue.unshift(...events);
    }
  }

  private storeFailedEvents(events: AnalyticsEvent[]) {
    try {
      const existing = localStorage.getItem('failed_analytics_events');
      const existingEvents = existing ? JSON.parse(existing) : [];
      const allEvents = [...existingEvents, ...events];
      localStorage.setItem('failed_analytics_events', JSON.stringify(allEvents));
      console.log('📊 Analytics: Stored', events.length, 'failed events in localStorage');
    } catch (error) {
      console.warn('📊 Analytics: Failed to store events in localStorage:', error);
    }
  }

  private async retryFailedEvents() {
    try {
      const stored = localStorage.getItem('failed_analytics_events');
      if (!stored) return;

      const events: AnalyticsEvent[] = JSON.parse(stored);
      if (events.length === 0) return;

      console.log('📊 Analytics: Retrying', events.length, 'failed events');

      const insertData = events.map(event => ({
        event_type: event.event_type,
        latitude: event.latitude,
        longitude: event.longitude,
        city: event.city,
        zoom_level: event.zoom_level,
        session_id: event.session_id,
        device_type: event.device_type,
        user_agent: event.user_agent,
        referrer: event.referrer,
        search_query: event.search_query,
        interaction_type: event.interaction_type,
        previous_time: event.previous_time || null,
        new_time: event.new_time || null,
        forecast_available: event.forecast_available,
        extra_data: event.extra_data,
        session_start_time: event.session_start_time || null,
        session_end_time: event.session_end_time || null,
        page_duration_seconds: event.page_duration_seconds,
        timestamp: new Date().toISOString()
      }));

      const { error } = await supabase
        .from('smokeusage')
        .insert(insertData as any);

      if (!error) {
        localStorage.removeItem('failed_analytics_events');
        console.log('📊 Analytics: Successfully retried', events.length, 'failed events');
      }
    } catch (error) {
      console.warn('📊 Analytics: Failed to retry events:', error);
    }
  }

  private endSession() {
    const sessionDuration = Math.floor((Date.now() - this.sessionStartTime.getTime()) / 1000);
    
    console.log('📊 Analytics: Ending session, duration:', sessionDuration, 'seconds');
    
    // Add session end event to queue and flush immediately
    const event: AnalyticsEvent = {
      event_type: 'session_end' as AnalyticsEventType,
      session_id: this.sessionId,
      page_duration_seconds: sessionDuration,
      session_end_time: new Date().toISOString(),
      device_type: this.getDeviceType(),
      user_agent: navigator.userAgent,
      referrer: document.referrer || undefined,
      session_start_time: this.sessionStartTime.toISOString()
    };

    this.eventQueue.push(event);
    
    // Force immediate flush for session end
    this.flushQueue();
  }

  // Public methods for specific tracking events
  trackPageLoad(latitude?: number, longitude?: number) {
    this.trackEvent({
      event_type: 'page_load',
      latitude,
      longitude
    });
  }

  trackCitySearch(query: string, city?: string, latitude?: number, longitude?: number) {
    this.trackEvent({
      event_type: 'city_search',
      search_query: query,
      city,
      latitude,
      longitude
    });
  }

  trackLocationClick(latitude: number, longitude: number, zoomLevel?: number) {
    this.trackEvent({
      event_type: 'location_click',
      latitude,
      longitude,
      zoom_level: zoomLevel
    });
  }

  trackTimeChange(previousTime: Date, newTime: Date, interactionType: string) {
    this.trackEvent({
      event_type: 'time_change',
      previous_time: previousTime.toISOString(),
      new_time: newTime.toISOString(),
      interaction_type: interactionType
    });
  }

  trackForecastView(city: string, forecastAvailable: boolean, latitude?: number, longitude?: number) {
    this.trackEvent({
      event_type: 'forecast_view',
      city,
      forecast_available: forecastAvailable,
      latitude,
      longitude
    });
  }
}

export const analyticsService = new AnalyticsService();