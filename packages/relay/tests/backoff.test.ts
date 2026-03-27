import { describe, it, expect, beforeEach } from "vitest";
import { ExponentialBackoff } from "../src/backoff.js";

describe("ExponentialBackoff", () => {
  let backoff: ExponentialBackoff;

  beforeEach(() => {
    backoff = new ExponentialBackoff(1000, 30_000, 2, 0); // jitter=0 for deterministic tests
  });

  it("starts at baseMs on first call", () => {
    expect(backoff.next()).toBe(1000);
  });

  it("doubles on each call (with jitter=0)", () => {
    expect(backoff.next()).toBe(1000);
    expect(backoff.next()).toBe(2000);
    expect(backoff.next()).toBe(4000);
    expect(backoff.next()).toBe(8000);
    expect(backoff.next()).toBe(16000);
  });

  it("caps at maxMs", () => {
    // 6 iterations: 1000, 2000, 4000, 8000, 16000, 30000
    for (let i = 0; i < 6; i++) backoff.next();
    expect(backoff.next()).toBe(30_000);
    expect(backoff.next()).toBe(30_000); // stays capped
  });

  it("resets to initial state after reset()", () => {
    backoff.next();
    backoff.next();
    backoff.next();
    backoff.reset();
    expect(backoff.next()).toBe(1000); // back to start
  });

  it("currentAttempt tracks call count", () => {
    expect(backoff.currentAttempt).toBe(0);
    backoff.next();
    expect(backoff.currentAttempt).toBe(1);
    backoff.next();
    expect(backoff.currentAttempt).toBe(2);
    backoff.reset();
    expect(backoff.currentAttempt).toBe(0);
  });

  it("never returns negative values even with extreme jitter", () => {
    const backoffWithJitter = new ExponentialBackoff(100, 30_000, 2, 2.0); // 200% jitter
    for (let i = 0; i < 20; i++) {
      expect(backoffWithJitter.next()).toBeGreaterThanOrEqual(0);
    }
  });

  it("is monotonically non-decreasing (with jitter=0)", () => {
    let last = 0;
    for (let i = 0; i < 10; i++) {
      const next = backoff.next();
      expect(next).toBeGreaterThanOrEqual(last);
      last = next;
    }
  });

  it("with jitter, values stay within ±20% of base", () => {
    const backoffWithJitter = new ExponentialBackoff(1000, 30_000, 2, 0.2);
    backoffWithJitter.reset();
    const base = 1000;
    // Take 100 samples to verify jitter bounds
    for (let i = 0; i < 100; i++) {
      const b2 = new ExponentialBackoff(1000, 30_000, 2, 0.2);
      const val = b2.next();
      expect(val).toBeGreaterThanOrEqual(base * 0.8);
      expect(val).toBeLessThanOrEqual(base * 1.2);
    }
  });
});
