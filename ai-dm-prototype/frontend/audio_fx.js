(() => {
  "use strict";

  class AudioFXEngine {
    constructor() {
      this.ctx = null;
      this.masterGain = null;
      this.ambientGain = null;
      this.sfxGain = null;
      this.ambientSource = null;
      this.ambientEnabled = true;
      this.ambientVolume = 0.7;
      this.sfxVolume = 0.8;
      this.isDucked = false;
      this.baseAmbientLevel = 0.20;
      this.duckedAmbientLevel = 0.045;
    }

    ensureContext() {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      if (!this.ctx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.95;
        this.masterGain.connect(this.ctx.destination);

        this.ambientGain = this.ctx.createGain();
        this.ambientGain.gain.value = 0;
        this.ambientGain.connect(this.masterGain);

        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.value = this.sfxVolume;
        this.sfxGain.connect(this.masterGain);
      }
      if (this.ctx.state === "suspended") {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    }

    unlock() {
      const ctx = this.ensureContext();
      if (ctx && this.ambientEnabled && !this.ambientSource) {
        this.startAmbientRain();
      }
    }

    startAmbientRain() {
      const ctx = this.ensureContext();
      if (!ctx || this.ambientSource) return;

      const bufferSize = ctx.sampleRate * 3;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let lastOut = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        lastOut = (lastOut + 0.035 * white) / 1.035;
        data[i] = lastOut * 2.2;
      }

      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;

      const highpass = ctx.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.value = 320;

      const lowpass = ctx.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.value = 1800;

      src.connect(highpass);
      highpass.connect(lowpass);
      lowpass.connect(this.ambientGain);
      src.start();
      this.ambientSource = src;

      this._updateAmbientTarget();
    }

    _updateAmbientTarget() {
      if (!this.ctx || !this.ambientGain) return;
      const base = this.isDucked ? this.duckedAmbientLevel : this.baseAmbientLevel;
      const target = !this.ambientEnabled ? 0 : base * this.ambientVolume;
      this.ambientGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.2);
    }

    setAmbientVolume(level01) {
      const clamped = Math.max(0, Math.min(1, Number(level01) || 0));
      this.ambientVolume = clamped;
      if (clamped > 0 && this.ambientEnabled && !this.ambientSource) {
        this.startAmbientRain();
      } else {
        this._updateAmbientTarget();
      }
    }

    setSfxVolume(level01) {
      const clamped = Math.max(0, Math.min(1, Number(level01) || 0));
      this.sfxVolume = clamped;
      if (this.ctx && this.sfxGain) {
        this.sfxGain.gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.08);
      }
    }

    setAmbientEnabled(enabled) {
      this.ambientEnabled = Boolean(enabled);
      if (this.ambientEnabled && !this.ambientSource) {
        this.startAmbientRain();
      } else {
        this._updateAmbientTarget();
      }
      return this.ambientEnabled;
    }

    toggleAmbient() {
      return this.setAmbientEnabled(!this.ambientEnabled);
    }

    setDucking(active) {
      this.isDucked = Boolean(active);
      this._updateAmbientTarget();
    }

    playSfx(kind) {
      const ctx = this.ensureContext();
      if (!ctx || !this.sfxGain) return;
      const now = ctx.currentTime;

      if (kind === "radio_static") {
        const len = Math.floor(ctx.sampleRate * 0.55);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) {
          d[i] = (Math.random() * 2 - 1) * (i % 180 < 90 ? 0.6 : 0.2);
        }
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = 1600;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.18, now);
        g.gain.exponentialRampToValueAtTime(0.005, now + 0.55);
        src.connect(bp);
        bp.connect(g);
        g.connect(this.sfxGain);
        src.start(now);
        return;
      }

      if (kind === "dice_roll") {
        [0, 0.07, 0.14].forEach((offset, idx) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = "triangle";
          osc.frequency.setValueAtTime(220 + idx * 75, now + offset);
          g.gain.setValueAtTime(0.12, now + offset);
          g.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.055);
          osc.connect(g);
          g.connect(this.sfxGain);
          osc.start(now + offset);
          osc.stop(now + offset + 0.06);
        });
        return;
      }

      if (kind === "dice_clatter") {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        const baseFreq = 260 + Math.random() * 190;
        osc.type = "triangle";
        osc.frequency.setValueAtTime(baseFreq, now);
        osc.frequency.exponentialRampToValueAtTime(Math.max(110, baseFreq * 0.45), now + 0.045);
        g.gain.setValueAtTime(0.14, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.connect(g);
        g.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.055);
        return;
      }

      if (kind === "dice_success" || kind === "skill_cast") {
        const freqs = kind === "skill_cast" ? [440, 587.3, 880] : [523.25, 659.25];
        freqs.forEach((f, idx) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(f, now + idx * 0.08);
          g.gain.setValueAtTime(0.11, now + idx * 0.08);
          g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.35);
          osc.connect(g);
          g.connect(this.sfxGain);
          osc.start(now + idx * 0.08);
          osc.stop(now + idx * 0.08 + 0.38);
        });
        return;
      }

      if (kind === "dice_fail" || kind === "combat_hit") {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = kind === "combat_hit" ? "sawtooth" : "sine";
        osc.frequency.setValueAtTime(kind === "combat_hit" ? 160 : 130, now);
        osc.frequency.exponentialRampToValueAtTime(48, now + 0.24);
        g.gain.setValueAtTime(0.18, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
        osc.connect(g);
        g.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.28);
        return;
      }

      if (kind === "ghost_attack") {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(620, now);
        osc.frequency.exponentialRampToValueAtTime(95, now + 0.52);
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 900;
        g.gain.setValueAtTime(0.16, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
        osc.connect(lp);
        lp.connect(g);
        g.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.56);
      }
    }
  }

  window.AudioFXEngine = AudioFXEngine;
})();
