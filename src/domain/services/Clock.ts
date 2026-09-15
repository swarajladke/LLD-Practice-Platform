/**
 * Clock abstraction for deterministic time handling and testability.
 */
export interface Clock {
  now(): string;
}

export class SystemClock implements Clock {
  now(): string {
    return new Date().toISOString();
  }
}

export class FixedClock implements Clock {
  private currentTime: string;

  constructor(initialTime: string = '2026-09-15T12:00:00.000Z') {
    this.currentTime = initialTime;
  }

  setTime(time: string): void {
    this.currentTime = time;
  }

  now(): string {
    return this.currentTime;
  }
}

export const defaultClock: Clock = new SystemClock();
