/**
 * Short synthesised beeps for workout timers.
 *
 * WebAudio rather than audio files: nothing to ship, nothing to fetch mid-set,
 * and it works offline. One AudioContext is lazily created and reused -- some
 * browsers cap how many you may open, and the first one can only start inside a
 * user gesture (tapping "start" counts), which is exactly when these fire.
 *
 * Every call is wrapped so a blocked autoplay policy or a device with no audio
 * output fails silently: the timer's visible countdown is the real signal, the
 * sound is the courtesy.
 */

let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = ctx ?? new Ctor();
    // A context created before a gesture starts "suspended"; resume it so the
    // first beep isn't swallowed.
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** One tone. `frequency` in Hz, `durationMs` how long it rings out. */
function tone(frequency: number, durationMs: number, gain = 0.15) {
  const c = context();
  if (!c) return;
  try {
    const osc = c.createOscillator();
    const envelope = c.createGain();
    osc.connect(envelope);
    envelope.connect(c.destination);

    osc.frequency.value = frequency;
    const seconds = durationMs / 1000;
    envelope.gain.setValueAtTime(gain, c.currentTime);
    envelope.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + seconds);
    osc.start();
    osc.stop(c.currentTime + seconds);
  } catch {
    // Autoplay policy or no audio device -- the countdown is still visible.
  }
}

/** A short click for the 3-2-1 countdown into the end of a timer. */
export function beepTick() {
  tone(880, 150);
}

/** A longer, higher tone that marks a timer reaching zero -- distinct from the ticks. */
export function beepEnd() {
  tone(1320, 500, 0.18);
}
