export class CallThrottle {
  private readonly last = new Map<string, number>();

  allow(key: string, windowMs: number, now: number): boolean {
    const previous = this.last.get(key);
    if (previous !== undefined && now - previous < windowMs) return false;
    this.last.set(key, now);
    return true;
  }
}
