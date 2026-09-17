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
