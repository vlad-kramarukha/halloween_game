/** Room-local game time excludes pauses, keeping every published timeline unchanged. */
export class GameClock {
  private stoppedAt: number | null = null;
  private offset = 0;
  constructor(private readonly realNow: () => number) {}
  get paused(): boolean { return this.stoppedAt !== null; }
  readonly now = (): number => (this.stoppedAt ?? this.realNow()) - this.offset;
  pause(): void { if (!this.paused) this.stoppedAt = this.realNow(); }
  resume(): void {
    if (this.stoppedAt === null) return;
    this.offset += this.realNow() - this.stoppedAt;
    this.stoppedAt = null;
  }
}

/** A single resumable task, measured against the room's game clock. */
export class GameTimer {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private callback: (() => void) | null = null;
  private deadline = 0;
  private paused = false;
  constructor(private readonly now: () => number) {}
  set(callback: () => void, duration: number): void {
    this.clear();
    this.callback = callback;
    this.deadline = this.now() + Math.max(0, duration);
    this.arm();
  }
  private arm(): void {
    if (this.paused || !this.callback) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      const callback = this.callback;
      this.callback = null;
      callback?.();
    }, Math.max(0, this.deadline - this.now()));
  }
  pause(): void {
    this.paused = true;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
  resume(): void { if (this.paused) { this.paused = false; this.arm(); } }
  clear(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.callback = null;
  }
}