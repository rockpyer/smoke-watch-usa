import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { AnalyticsMonitor } from '@/utils/analyticsMonitor';

export type AnalyticsEventType = 
  | 'page_load'
  | 'city_search' 
  | 'location_click'
  | 'time_change'
  | 'forecast_view'
  | 'user_engagement'
  | 'session_end';

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
  
  // Rate limiting and deduplication
  private lastEventTimes: Map<string, number> = new Map();
  private lastEventData: Map<string, string> = new Map();
  private pendingTimeChange: {
    timeout: NodeJS.Timeout | null;
    previousTime: Date;
    newTime: Date;
    interactionType: string;
  } | null = null;

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
    // Skip rate-limited or duplicate events
    if (!this.shouldTrackEvent(event)) {
      return;
    }

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
    AnalyticsMonitor.trackEventCount(analyticsEvent.event_type);
    this.eventQueue.push(analyticsEvent);
    this.scheduleFlush();
  }

  private shouldTrackEvent(event: Partial<AnalyticsEvent>): boolean {
    const eventKey = `${event.event_type}_${event.interaction_type || ''}`;
    const now = Date.now();
    
    // Rate limiting per event type
    const minIntervals = {
      'time_change': 500, // Max 1 per 500ms
      'forecast_view': 1000, // Max 1 per second  
      'location_click': 200, // Max 1 per 200ms
      'city_search': 300, // Max 1 per 300ms
      'page_load': 0 // No rate limiting
    };
    
    const minInterval = minIntervals[event.event_type as keyof typeof minIntervals] || 0;
    const lastTime = this.lastEventTimes.get(eventKey) || 0;
    
    if (now - lastTime < minInterval) {
      console.log('📊 Analytics: Rate limited', eventKey);
      return false;
    }
    
    // Deduplication - skip identical consecutive events
    const eventDataKey = JSON.stringify({
      type: event.event_type,
      interaction: event.interaction_type,
      city: event.city,
      lat: event.latitude,
      lng: event.longitude,
      time: event.new_time
    });
    
    const lastData = this.lastEventData.get(event.event_type!);
    if (lastData === eventDataKey) {
      console.log('📊 Analytics: Duplicate event skipped', event.event_type);
      return false;
    }
    
    // Update tracking
    this.lastEventTimes.set(eventKey, now);
    this.lastEventData.set(event.event_type!, eventDataKey);
    
    return true;
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
    // Smart debouncing for slider interactions
    if (interactionType === 'slider') {
      // Cancel any pending time change
      if (this.pendingTimeChange?.timeout) {
        clearTimeout(this.pendingTimeChange.timeout);
      }
      
      // Store the latest values and debounce
      this.pendingTimeChange = {
        timeout: setTimeout(() => {
          this.trackEvent({
            event_type: 'time_change',
            previous_time: this.pendingTimeChange!.previousTime.toISOString(),
            new_time: this.pendingTimeChange!.newTime.toISOString(),
            interaction_type: 'slider_final'
          });
          this.pendingTimeChange = null;
        }, 300), // 300ms debounce for slider
        previousTime,
        newTime,
        interactionType
      };
      return;
    }
    
    // Track immediate actions (buttons, autoplay, etc.)
    const significantActions = ['step_forward', 'step_back', 'reset', 'autoplay_reset'];
    if (significantActions.includes(interactionType)) {
      this.trackEvent({
        event_type: 'time_change',
        previous_time: previousTime.toISOString(),
        new_time: newTime.toISOString(),
        interaction_type: interactionType
      });
    }
  }

  trackForecastView(city: string, forecastAvailable: boolean, latitude?: number, longitude?: number) {
    // Only track forecast views from deliberate user actions, not cascaded from time changes
    this.trackEvent({
      event_type: 'forecast_view',
      city,
      forecast_available: forecastAvailable,
      latitude,
      longitude
    });
  }

  // Enhanced tracking methods with better context
  trackUserSession() {
    this.trackEvent({
      event_type: 'page_load',
      extra_data: {
        timestamp: new Date().toISOString(),
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      }
    });
  }

  trackSignificantInteraction(type: 'time_exploration' | 'location_discovery' | 'forecast_engagement', data: Record<string, any>) {
    this.trackEvent({
      event_type: 'user_engagement' as AnalyticsEventType,
      interaction_type: type,
      extra_data: data
    });
  }
}

export const analyticsService = new AnalyticsService();