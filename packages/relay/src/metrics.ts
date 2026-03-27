// ============================================================
// Prometheus-compatible metrics for the relay server.
// Exposed at GET /metrics (Prometheus text format)
// and GET /health (JSON for load balancers)
// ============================================================

interface MetricCounters {
  connections_total: number;
  connections_active: number;
  channels_active: number;
  messages_sent: number;
  messages_received: number;
  auth_failures: number;
  errors_total: number;
  ping_total: number;
}

export class MetricsCollector {
  private readonly startTime = Date.now();
  private counters: MetricCounters = {
    connections_total: 0,
    connections_active: 0,
    channels_active: 0,
    messages_sent: 0,
    messages_received: 0,
    auth_failures: 0,
    errors_total: 0,
    ping_total: 0,
  };

  increment(key: keyof MetricCounters, by = 1): void {
    this.counters[key] += by;
  }

  decrement(key: keyof MetricCounters, by = 1): void {
    this.counters[key] = Math.max(0, this.counters[key] - by);
  }

  set(key: keyof MetricCounters, value: number): void {
    this.counters[key] = value;
  }

  get(key: keyof MetricCounters): number {
    return this.counters[key]!;
  }

  uptimeSeconds(): number {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  /**
   * Prometheus exposition format (plain text).
   * Compatible with Grafana, Datadog, and any Prometheus scraper.
   */
  toPrometheusText(): string {
    const lines: string[] = [
      `# HELP figma_relay_uptime_seconds Relay server uptime in seconds`,
      `# TYPE figma_relay_uptime_seconds gauge`,
      `figma_relay_uptime_seconds ${this.uptimeSeconds()}`,
    ];

    for (const [key, value] of Object.entries(this.counters)) {
      const metricName = `figma_relay_${key}`;
      const type = key.endsWith("_total") || key === "ping_total" ? "counter" : "gauge";
      lines.push(`# TYPE ${metricName} ${type}`);
      lines.push(`${metricName} ${value}`);
    }

    return lines.join("\n") + "\n";
  }

  /**
   * JSON format for health checks and dashboards.
   */
  toJSON(): Record<string, number | string> {
    return {
      ...this.counters,
      uptime_seconds: this.uptimeSeconds(),
      status: "ok",
    };
  }
}

// Singleton instance used throughout the relay
export const metrics = new MetricsCollector();
