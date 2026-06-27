import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { AnalyticsMonitor } from '@/utils/analyticsMonitor';

// Analytics backend is currently disconnected. Set to true to re-enable tracking
// once Lovable Cloud / Supabase is reconnected.
const ANALYTICS_ENABLED = false;

// Convert UTC timestamp to Mountain Time (proper timezone handling)
const toMountainTime = (date: Date): Date => {
  // Create a new date object that represents the same moment in Mountain Time
  // This handles daylight saving time automatically
  const utcTime = date.getTime();
  const mountainOffset = new Date().toLocaleString("en-US", { 
    timeZone: "America/Denver" 
  });
  // Use Intl API for proper timezone conversion
  const mountainDate = new Date(utcTime);
  return new Date(mountainDate.toLocaleString("en-US", { timeZone: "America/Denver" }));
};

export type AnalyticsEventType = 
  | 'page_load'
  | 'city_search' 
  | 'location_click'
  | 'time_change'
  | 'forecast_view'
  | 'user_engagement'
  | 'session_end'
  | 'privacy_data_cleared';

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
  browser_session_id?: string;
  is_developer?: boolean;
  visitor_hash?: string;
  user_agent_hash?: string;
  viewport?: string;
  timezone?: string;
}

class AnalyticsService {
  private sessionId: string;
  private sessionStartTime: Date;
  private eventQueue: AnalyticsEvent[] = [];
  private flushTimeout: NodeJS.Timeout | null = null;
  private visitorFingerprint: {
    browserSessionId: string;
    isDeveloper: boolean;
    visitorHash: string;
    userAgentHash: string;
    viewport: string;
    timezone: string;
  } | null = null;
  
  // Rate limiting, deduplication, and session safeguards
  private lastEventTimes: Map<string, number> = new Map();
  private lastEventData: Map<string, string> = new Map();
  private sessionEventCount: number = 0;
  private maxEventsPerSession: number = 200; // Circuit breaker
  private eventCountPerMinute: Map<number, number> = new Map();
  private pendingTimeChange: {
    timeout: NodeJS.Timeout | null;
    previousTime: Date;
    newTime: Date;
    interactionType: string;
  } | null = null;

  constructor() {
    this.sessionId = crypto.randomUUID();
    this.sessionStartTime = new Date();
    if (!ANALYTICS_ENABLED) {
      // Backend disconnected — do not generate fingerprints, listeners, or
      // periodic flush timers. All public tracking methods short‑circuit below.
      return;
    }
    this.visitorFingerprint = this.generateVisitorFingerprint();
    console.log('📊 Analytics: Starting new session', this.sessionId);
    console.log('📊 Analytics: Visitor fingerprint', this.visitorFingerprint);
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

  private generateVisitorFingerprint() {
    // Get or create browser session ID from sessionStorage
    let browserSessionId = sessionStorage.getItem('analytics_browser_session_id');
    if (!browserSessionId) {
      browserSessionId = crypto.randomUUID();
      sessionStorage.setItem('analytics_browser_session_id', browserSessionId);
    }

    // Detect if this is likely a developer session
    const isDeveloper = this.detectDeveloperSession();

    // Create a visitor hash combining stable browser characteristics
    const userAgent = navigator.userAgent;
    const userAgentHash = this.hashString(userAgent);
    const viewport = `${window.innerWidth}x${window.innerHeight}`;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    // Combine multiple factors for visitor fingerprint (excluding Boulder searches)
    const visitorData = [
      userAgentHash,
      timezone,
      navigator.language,
      navigator.platform
    ].join('|');
    const visitorHash = this.hashString(visitorData);

    return {
      browserSessionId,
      isDeveloper,
      visitorHash,
      userAgentHash,
      viewport,
      timezone
    };
  }

  private detectDeveloperSession(): boolean {
    const userAgent = navigator.userAgent.toLowerCase();
    const referrer = document.referrer.toLowerCase();
    
    // Check for development indicators
    const devIndicators = [
      // Referrer from localhost or lovable
      referrer.includes('localhost'),
      referrer.includes('lovable.dev'),
      referrer.includes('127.0.0.1'),
      
      // User agent patterns common in development
      userAgent.includes('chrome') && userAgent.includes('mac'),
      
      // Window location indicators
      window.location.hostname === 'localhost',
      window.location.hostname.includes('lovable'),
      
      // Development tools detection
      window.outerHeight - window.innerHeight > 200 // DevTools likely open
    ];

    const score = devIndicators.filter(Boolean).length;
    return score >= 2; // If 2 or more indicators, likely developer
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  private getDeviceType(): string {
    const userAgent = navigator.userAgent;
    if (/tablet|ipad|playbook|silk/i.test(userAgent)) return 'tablet';
    if (/mobile|iphone|ipod|android|blackberry|opera|mini|windows\sce|palm|smartphone|iemobile/i.test(userAgent)) return 'mobile';
    return 'desktop';
  }

  async trackEvent(event: Partial<AnalyticsEvent>) {
    if (!ANALYTICS_ENABLED) return;
    // Circuit breaker: Stop tracking if session has too many events
    if (this.sessionEventCount >= this.maxEventsPerSession) {
      console.warn('📊 Analytics: Circuit breaker activated - too many events in session');
      return;
    }

    // Skip rate-limited or duplicate events
    if (!this.shouldTrackEvent(event)) {
      return;
    }

    this.sessionEventCount++;
    this.updateEventCountPerMinute();

    const analyticsEvent: AnalyticsEvent = {
      event_type: event.event_type!,
      session_id: this.sessionId,
      device_type: this.getDeviceType(),
      user_agent: navigator.userAgent,
      referrer: document.referrer || undefined,
      session_start_time: toMountainTime(this.sessionStartTime).toISOString(),
      browser_session_id: this.visitorFingerprint?.browserSessionId,
      is_developer: this.visitorFingerprint?.isDeveloper,
      visitor_hash: this.visitorFingerprint?.visitorHash,
      user_agent_hash: this.visitorFingerprint?.userAgentHash,
      viewport: this.visitorFingerprint?.viewport,
      timezone: this.visitorFingerprint?.timezone,
      ...event
    };

    console.log('📊 Analytics: Tracking event', analyticsEvent.event_type, analyticsEvent);
    AnalyticsMonitor.trackEventCount(analyticsEvent.event_type);
    this.eventQueue.push(analyticsEvent);
    this.scheduleFlush();
  }

  private updateEventCountPerMinute() {
    const currentMinute = Math.floor(Date.now() / 60000);
    const count = this.eventCountPerMinute.get(currentMinute) || 0;
    this.eventCountPerMinute.set(currentMinute, count + 1);
    
    // Alert if too many events per minute
    if (count > 50) {
      console.warn('📊 Analytics: High event rate detected:', count, 'events/minute');
    }
  }

  private shouldTrackEvent(event: Partial<AnalyticsEvent>): boolean {
    const eventKey = `${event.event_type}_${event.interaction_type || ''}`;
    const now = Date.now();
    
    // Enhanced rate limiting per event type with longer intervals
    const minIntervals = {
      'time_change': 1000, // Increased from 500ms to 1s
      'forecast_view': 2000, // Increased from 1s to 2s  
      'location_click': 500, // Increased from 200ms to 500ms
      'city_search': 1000, // Increased from 300ms to 1s
      'page_load': 0 // No rate limiting
    };
    
    const minInterval = minIntervals[event.event_type as keyof typeof minIntervals] || 0;
    const lastTime = this.lastEventTimes.get(eventKey) || 0;
    
    if (now - lastTime < minInterval) {
      console.log('📊 Analytics: Rate limited', eventKey, 'last:', Date.now() - lastTime, 'ms ago');
      return false;
    }
    
    // Enhanced deduplication - skip identical consecutive events
    const eventDataKey = JSON.stringify({
      type: event.event_type,
      interaction: event.interaction_type,
      city: event.city,
      lat: Math.round((event.latitude || 0) * 1000) / 1000, // Round to avoid float precision issues
      lng: Math.round((event.longitude || 0) * 1000) / 1000,
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
        browser_session_id: event.browser_session_id,
        is_developer: event.is_developer,
        visitor_hash: event.visitor_hash,
        user_agent_hash: event.user_agent_hash,
        viewport: event.viewport,
        timezone: event.timezone,
        timestamp: toMountainTime(new Date()).toISOString()
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
        browser_session_id: event.browser_session_id,
        is_developer: event.is_developer,
        visitor_hash: event.visitor_hash,
        user_agent_hash: event.user_agent_hash,
        viewport: event.viewport,
        timezone: event.timezone,
        timestamp: toMountainTime(new Date()).toISOString()
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
      session_end_time: toMountainTime(new Date()).toISOString(),
      device_type: this.getDeviceType(),
      user_agent: navigator.userAgent,
      referrer: document.referrer || undefined,
      session_start_time: toMountainTime(this.sessionStartTime).toISOString(),
      browser_session_id: this.visitorFingerprint?.browserSessionId,
      is_developer: this.visitorFingerprint?.isDeveloper,
      visitor_hash: this.visitorFingerprint?.visitorHash,
      user_agent_hash: this.visitorFingerprint?.userAgentHash,
      viewport: this.visitorFingerprint?.viewport,
      timezone: this.visitorFingerprint?.timezone
    };

    this.eventQueue.push(event);
    
    // Force immediate flush for session end
    this.flushQueue();
  }

  // Public methods for specific tracking events
  trackPageLoad(latitude?: number, longitude?: number) {
    if (!ANALYTICS_ENABLED) return;
    this.trackEvent({
      event_type: 'page_load',
      latitude,
      longitude
    });
  }

  trackCitySearch(query: string, city?: string, latitude?: number, longitude?: number) {
    if (!ANALYTICS_ENABLED) return;
    this.trackEvent({
      event_type: 'city_search',
      search_query: query,
      city,
      latitude,
      longitude
    });
  }

  trackLocationClick(latitude: number, longitude: number, zoomLevel?: number) {
    if (!ANALYTICS_ENABLED) return;
    this.trackEvent({
      event_type: 'location_click',
      latitude,
      longitude,
      zoom_level: zoomLevel
    });
  }

  trackTimeChange(previousTime: Date, newTime: Date, interactionType: string) {
    if (!ANALYTICS_ENABLED) return;
    // Enhanced debouncing for slider interactions
    if (interactionType === 'slider') {
      // Cancel any pending time change
      if (this.pendingTimeChange?.timeout) {
        clearTimeout(this.pendingTimeChange.timeout);
      }
      
      // Store the latest values and debounce with longer delay
      this.pendingTimeChange = {
        timeout: setTimeout(() => {
          this.trackEvent({
            event_type: 'time_change',
            previous_time: this.pendingTimeChange!.previousTime.toISOString(),
            new_time: this.pendingTimeChange!.newTime.toISOString(),
            interaction_type: 'slider_final'
          });
          this.pendingTimeChange = null;
        }, 1000), // Increased from 300ms to 1s for better debouncing
        previousTime,
        newTime,
        interactionType
      };
      return;
    }
    
    // Track immediate actions (buttons, autoplay, etc.) with rate limiting
    const significantActions = ['step_forward', 'step_back', 'reset', 'autoplay_reset'];
    if (significantActions.includes(interactionType)) {
      // Additional rate limit for rapid button clicking
      const buttonKey = `button_${interactionType}`;
      const now = Date.now();
      const lastButtonTime = this.lastEventTimes.get(buttonKey) || 0;
      
      if (now - lastButtonTime < 500) { // Prevent rapid button mashing
        console.log('📊 Analytics: Button rate limited', interactionType);
        return;
      }
      
      this.lastEventTimes.set(buttonKey, now);
      this.trackEvent({
        event_type: 'time_change',
        previous_time: previousTime.toISOString(),
        new_time: newTime.toISOString(),
        interaction_type: interactionType
      });
    }
  }

  trackForecastView(city: string, forecastAvailable: boolean, latitude?: number, longitude?: number) {
    if (!ANALYTICS_ENABLED) return;
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