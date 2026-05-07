export class SoundSystem {
  private ctx: AudioContext | null = null;
  private _muted = false;

  init() {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    if (this._muted) this.ctx.suspend();
  }

  setMuted(v: boolean) {
    this._muted = v;
    if (!this.ctx) return;
    if (v) this.ctx.suspend();
    else   this.ctx.resume();
  }

  private noise(duration: number, freq: number, gain: number, type: OscillatorType = 'sine') {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const g   = this.ctx.createGain();
    osc.connect(g);
    g.connect(this.ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.1, this.ctx.currentTime + duration);
    g.gain.setValueAtTime(gain, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  shoot()   { this.noise(0.08, 440,  0.25, 'sawtooth'); }
  hit()     { this.noise(0.12, 200,  0.35, 'square'); }
  explode() { this.noise(0.40, 120,  0.50, 'sawtooth'); }
  step()    { this.noise(0.04,  80,  0.07, 'square'); }
  pickup()  { this.noise(0.20, 880,  0.25, 'sine'); }
}
