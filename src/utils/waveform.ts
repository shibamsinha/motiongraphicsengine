const BUCKETS = 480;

export type Waveform = {
  peaks: number[];
  duration: number;
};

export const readAudioDuration = (src: string): Promise<number> =>
  new Promise((resolve, reject) => {
    const el = document.createElement('audio');
    el.preload = 'metadata';
    const done = () => {
      el.removeAttribute('src');
      el.load();
    };
    el.onloadedmetadata = () => {
      const seconds = el.duration;
      done();
      if (!Number.isFinite(seconds) || seconds <= 0) {
        reject(new Error('The file reports no playable duration.'));
        return;
      }
      resolve(seconds);
    };
    el.onerror = () => {
      done();
      reject(new Error('The browser could not decode this audio file.'));
    };
    el.src = src;
  });

const cache = new Map<string, Waveform>();

export const cachedWaveform = (src: string): Waveform | null =>
  cache.get(src) ?? null;

export const computeWaveform = async (src: string): Promise<Waveform> => {
  const hit = cache.get(src);
  if (hit) return hit;

  const response = await fetch(src);
  if (!response.ok) throw new Error(`Could not read the audio file (${response.status}).`);
  const bytes = await response.arrayBuffer();

  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctx) throw new Error('This browser has no Web Audio support.');

  const ctx = new Ctx();
  try {
    const buffer = await ctx.decodeAudioData(bytes);
    const channel = buffer.getChannelData(0);
    const per = Math.max(1, Math.floor(channel.length / BUCKETS));
    const peaks: number[] = [];

    for (let bucket = 0; bucket < BUCKETS; bucket++) {
      const start = bucket * per;
      let peak = 0;
      for (let i = start; i < Math.min(start + per, channel.length); i += 16) {
        const value = channel[i] < 0 ? -channel[i] : channel[i];
        if (value > peak) peak = value;
      }
      peaks.push(peak);
    }

    const loudest = peaks.reduce((max, p) => (p > max ? p : max), 0);
    const scale = loudest > 0.01 ? 1 / loudest : 1;

    const waveform: Waveform = {
      peaks: peaks.map((p) => Math.min(1, p * scale)),
      duration: buffer.duration,
    };
    cache.set(src, waveform);
    return waveform;
  } finally {
    void ctx.close();
  }
};

export const timecode = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00.00';
  const whole = Math.floor(seconds);
  const mm = String(Math.floor(whole / 60)).padStart(2, '0');
  const ss = String(whole % 60).padStart(2, '0');
  const cs = String(Math.round((seconds - whole) * 100)).padStart(2, '0');
  return `${mm}:${ss}.${cs}`;
};

export const shortTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const whole = Math.round(seconds);
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
};
