// Simple analytics monitoring utility to track optimization effectiveness
export class AnalyticsMonitor {
  private static eventCounts: Map<string, number> = new Map();
  private static sessionStart = Date.now();
  
  static trackEventCount(eventType: string) {
    const current = this.eventCounts.get(eventType) || 0;
    this.eventCounts.set(eventType, current + 1);
  }
  
  static getSessionStats() {
    const sessionDuration = Math.round((Date.now() - this.sessionStart) / 1000);
    const totalEvents = Array.from(this.eventCounts.values()).reduce((sum, count) => sum + count, 0);
    const eventsPerMinute = Math.round((totalEvents / sessionDuration) * 60);
    
    return {
      sessionDuration,
      totalEvents,
      eventsPerMinute,
      eventBreakdown: Object.fromEntries(this.eventCounts),
      optimizationTarget: totalEvents < 50 ? 'GOOD' : totalEvents < 100 ? 'ACCEPTABLE' : 'NEEDS_OPTIMIZATION'
    };
  }
  
  static logStats() {
    const stats = this.getSessionStats();
    console.log('📊 Analytics Session Stats:', stats);
    return stats;
  }
}

// Optional: Auto-log stats every 2 minutes in development
if (process.env.NODE_ENV === 'development') {
  setInterval(() => {
    AnalyticsMonitor.logStats();
  }, 120000); // Every 2 minutes
}