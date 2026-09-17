let audio: AudioContext | null = null;

// A short filtered noise burst. Placeholder until real sound effects arrive.
export function playScream(): void {
  if (typeof AudioContext === "undefined") return;
  audio ??= new AudioContext();
  const ctx = audio;
  const duration = 0.6;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 6;
  const t = ctx.currentTime;
  filter.frequency.setValueAtTime(900, t);
  filter.frequency.exponentialRampToValueAtTime(2400, t + 0.15);
  filter.frequency.exponentialRampToValueAtTime(500, t + duration);
  const gain = ctx.createGain();
  gain.gain.value = 0.5;
  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start();
}

// A low stone thud for the vote plates landing. Placeholder like the scream.
export function playThud(): void {
  if (typeof AudioContext === "undefined") return;
  audio ??= new AudioContext();
  const ctx = audio;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(90, t);
  osc.frequency.exponentialRampToValueAtTime(35, t + 0.35);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.9, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.5);
}
