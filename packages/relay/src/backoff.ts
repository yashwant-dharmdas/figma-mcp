// ============================================================
// True exponential backoff with bounded jitter.
//
// Problem with v1: used Math.floor(Math.random() * 5) as the exponent,
// which produces non-monotonically-increasing delays and can give 0 delay.
//
// This class uses a counter that increments on each failure, producing
// 1s → 2s → 4s → 8s → 16s → 30s → 30s... with ±20% jitter.
// ============================================================

export class ExponentialBackoff {
  private attempt = 0;

  constructor(
    /** Initial delay in ms */
    private readonly baseMs = 1000,
    /** Maximum delay cap in ms */
    private readonly maxMs = 30_000,
    /** Multiplication factor per attempt */
    private readonly factor = 2,
    /** Jitter fraction (0.2 = ±20%) */
    private readonly jitterFraction = 0.2
  ) {}

  /**
   * Get the next delay in milliseconds and increment the attempt counter.
   * Returns monotonically increasing values (up to maxMs) with bounded jitter.
   */
  next(): number {
    const base = Math.min(
      this.baseMs * Math.pow(this.factor, this.attempt),
      this.maxMs
    );
    this.attempt++;
    const jitter = base * this.jitterFraction * (Math.random() * 2 - 1);
    return Math.max(0, Math.round(base + jitter));
  }

  /**
   * Reset the counter (call after a successful connection).
   */
  reset(): void {
    this.attempt = 0;
  }

  /**
   * Current attempt number (for logging).
   */
  get currentAttempt(): number {
    return this.attempt;
  }
}
