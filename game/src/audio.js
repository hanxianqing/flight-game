// Skyline Courier — engine and wind sound, synthesized with WebAudio.
// One job: a propeller hum that follows throttle, plus wind that follows speed.
// No audio files: everything is an oscillator and filtered noise.

export function createAudio() {
  let ctx = null, osc = null, osc2 = null, noise = null, noiseGain = null, master = null;
  let started = false;

  function ensure() {
    if (started) return;
    started = true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.0;
      master.connect(ctx.destination);

      // propeller drone: two detuned saws through a low-pass filter
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      filter.connect(master);
      osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 55;
      osc.connect(filter);
      osc.start();
      osc2 = ctx.createOscillator();
      osc2.type = 'sawtooth';
      osc2.frequency.value = 55.7;
      osc2.connect(filter);
      osc2.start();

      // wind: looped noise through a band-pass filter
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 700;
      bp.Q.value = 0.6;
      noiseGain = ctx.createGain();
      noiseGain.gain.value = 0;
      src.connect(bp);
      bp.connect(noiseGain);
      noiseGain.connect(master);
      src.start();
      noise = src;
    } catch {
      ctx = null;
    }
  }

  function setFlying(throttle, speed, flying) {
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const t = ctx.currentTime;
    const rpm = 38 + throttle * 55;
    osc.frequency.setTargetAtTime(rpm, t, 0.1);
    osc2.frequency.setTargetAtTime(rpm * 1.012, t, 0.1);
    master.gain.setTargetAtTime(flying ? 0.05 + throttle * 0.05 : 0.0, t, 0.2);
    noiseGain.gain.setTargetAtTime(Math.min(0.12, speed * 0.0012), t, 0.2);
  }

  function blip(freq = 880, dur = 0.09) {
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.12, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + dur);
  }

  return { ensure, setFlying, blip };
}
