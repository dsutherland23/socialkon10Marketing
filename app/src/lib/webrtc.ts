/* ------------------------------------------------------------------
   WEBRTC MEDIA ENGINE & DEVICE DIAGNOSTICS (2026 Production Standard)
   - Live camera & microphone acquisition
   - Audio VU meter via Web Audio API AnalyserNode
   - Speaker chime test via Web Audio Oscillator
   - Screen sharing with system audio capture
   - Real-time connection quality telemetry
------------------------------------------------------------------- */

export interface MediaDeviceList {
  audioInputs: MediaDeviceInfo[];
  videoInputs: MediaDeviceInfo[];
  audioOutputs: MediaDeviceInfo[];
}

export interface ConnectionQualityStats {
  quality: "excellent" | "good" | "fair" | "poor";
  latencyMs: number;
  packetLossPct: number;
  bitrateKbps: number;
}

/** Enumerate available camera, microphone and speaker devices */
export async function getMediaDevices(): Promise<MediaDeviceList> {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return { audioInputs: [], videoInputs: [], audioOutputs: [] };
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return {
      audioInputs: devices.filter((d) => d.kind === "audioinput"),
      videoInputs: devices.filter((d) => d.kind === "videoinput"),
      audioOutputs: devices.filter((d) => d.kind === "audiooutput"),
    };
  } catch (err) {
    console.warn("Device enumeration failed:", err);
    return { audioInputs: [], videoInputs: [], audioOutputs: [] };
  }
}

/** Request local camera and microphone media stream */
export async function getLocalUserMedia(options?: {
  audioDeviceId?: string;
  videoDeviceId?: string;
  audio?: boolean;
  video?: boolean;
}): Promise<MediaStream> {
  const audio = options?.audio ?? true;
  const video = options?.video ?? true;

  const constraints: MediaStreamConstraints = {
    audio: audio
      ? options?.audioDeviceId
        ? { deviceId: { exact: options.audioDeviceId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        : { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      : false,
    video: video
      ? options?.videoDeviceId
        ? { deviceId: { exact: options.videoDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }
        : { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }
      : false,
  };

  return navigator.mediaDevices.getUserMedia(constraints);
}

/** Request screen share stream (window, tab, or entire display) */
export async function getDisplayMediaStream(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error("Screen sharing is not supported in this browser.");
  }
  return navigator.mediaDevices.getDisplayMedia({
    video: {
      cursor: "always",
      displaySurface: "monitor",
    } as any,
    audio: true,
  });
}

/** Stop all tracks on a media stream */
export function stopMediaStream(stream?: MediaStream | null): void {
  if (!stream) return;
  stream.getTracks().forEach((track) => {
    try {
      track.stop();
    } catch {}
  });
}

/** Create a real-time Audio Level Monitor (VU meter) using Web Audio API */
export function createAudioLevelMeter(
  stream: MediaStream,
  onVolume: (volumePct: number) => void
): () => void {
  const audioTracks = stream.getAudioTracks();
  if (audioTracks.length === 0) {
    onVolume(0);
    return () => {};
  }

  let audioCtx: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let analyser: AnalyserNode | null = null;
  let animationId = 0;
  let isRunning = true;

  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return () => {};

    audioCtx = new AudioCtx();
    source = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      if (!isRunning || !analyser) return;
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const avg = sum / dataArray.length;
      // Convert to a scaled percentage (0 to 100)
      const pct = Math.min(100, Math.round((avg / 128) * 100));
      onVolume(pct);
      animationId = requestAnimationFrame(tick);
    };

    tick();
  } catch (e) {
    console.warn("Audio meter initialization error:", e);
  }

  return () => {
    isRunning = false;
    if (animationId) cancelAnimationFrame(animationId);
    try {
      source?.disconnect();
      analyser?.disconnect();
      audioCtx?.close();
    } catch {}
  };
}

/** Play a pleasant speaker test chime using Web Audio API oscillator */
export function playSpeakerTestSound(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) {
        resolve();
        return;
      }
      const ctx = new AudioCtx();

      // Play a dual-tone chime: 523.25 Hz (C5) then 659.25 Hz (E5)
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.15);
      osc.frequency.setValueAtTime(783.99, now + 0.30); // G5

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.3, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.75);

      setTimeout(() => {
        ctx.close();
        resolve();
      }, 800);
    } catch {
      resolve();
    }
  });
}

/** Play an incoming call ringtone using Web Audio API */
export function playIncomingCallRingtone(): () => void {
  let isRinging = true;
  let audioCtx: AudioContext | null = null;

  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return () => {};

    audioCtx = new AudioCtx();

    const ringCycle = () => {
      if (!isRinging || !audioCtx) return;
      const now = audioCtx.currentTime;
      const osc1 = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc1.type = "sine";
      osc2.type = "sine";
      osc1.frequency.value = 440; // A4
      osc2.frequency.value = 480; // Standard US ringtone frequency pair

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
      gain.gain.setValueAtTime(0.2, now + 1.2);
      gain.gain.linearRampToValueAtTime(0.001, now + 1.5);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(audioCtx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 1.5);
      osc2.stop(now + 1.5);

      setTimeout(ringCycle, 3000);
    };

    ringCycle();
  } catch (e) {
    console.warn("Ringtone error:", e);
  }

  return () => {
    isRinging = false;
    try {
      audioCtx?.close();
    } catch {}
  };
}
