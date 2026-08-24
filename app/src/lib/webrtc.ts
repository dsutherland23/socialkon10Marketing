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

/** Request local camera and microphone media stream with progressive fallback */
export async function getLocalUserMedia(options?: {
  audioDeviceId?: string;
  videoDeviceId?: string;
  audio?: boolean;
  video?: boolean;
}): Promise<MediaStream> {
  const wantAudio = options?.audio ?? true;
  const wantVideo = options?.video ?? true;

  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera and microphone are not supported in this browser.");
  }

  // 1. First Attempt: Target specific devices with ideal constraints
  const primaryConstraints: MediaStreamConstraints = {
    audio: wantAudio
      ? options?.audioDeviceId
        ? { deviceId: { ideal: options.audioDeviceId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        : { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      : false,
    video: wantVideo
      ? options?.videoDeviceId
        ? { deviceId: { ideal: options.videoDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }
        : { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }
      : false,
  };

  try {
    return await navigator.mediaDevices.getUserMedia(primaryConstraints);
  } catch (err1) {
    console.warn("Primary media request failed, attempting fallback:", err1);

    // 2. Second Attempt: Generic audio + video constraints
    if (wantAudio && wantVideo) {
      try {
        return await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true,
        });
      } catch (err2) {
        console.warn("Generic audio+video request failed:", err2);
      }
    }

    // 3. Third Attempt: Audio-only fallback if camera is blocked/busy
    if (wantAudio) {
      try {
        const audioOnlyStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        return audioOnlyStream;
      } catch (err3) {
        console.warn("Audio-only fallback failed:", err3);
      }
    }

    // 4. Fourth Attempt: Video-only fallback if mic is blocked
    if (wantVideo) {
      try {
        const videoOnlyStream = await navigator.mediaDevices.getUserMedia({ video: true });
        return videoOnlyStream;
      } catch (err4) {
        console.warn("Video-only fallback failed:", err4);
      }
    }

    throw new Error("Unable to access camera or microphone. Please check your browser device permissions.");
  }
}

/* ---------------- WebRTC Multi-Peer Mesh Session ---------------- */

export const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
};

export class WebRTCMeshSession {
  private myParticipantId: string;
  private onSignalOut: (targetParticipantId: string, type: "offer" | "answer" | "candidate", payload: string) => void;
  private onRemoteTrack: (participantId: string, stream: MediaStream) => void;
  private onRemoteTrackRemoved: (participantId: string) => void;
  private peers = new Map<string, RTCPeerConnection>();
  private remoteStreams = new Map<string, MediaStream>();
  private localStream: MediaStream | null = null;

  constructor(opts: {
    myParticipantId: string;
    localStream: MediaStream | null;
    onSignalOut: (targetParticipantId: string, type: "offer" | "answer" | "candidate", payload: string) => void;
    onRemoteTrack: (participantId: string, stream: MediaStream) => void;
    onRemoteTrackRemoved: (participantId: string) => void;
  }) {
    this.myParticipantId = opts.myParticipantId;
    this.localStream = opts.localStream;
    this.onSignalOut = opts.onSignalOut;
    this.onRemoteTrack = opts.onRemoteTrack;
    this.onRemoteTrackRemoved = opts.onRemoteTrackRemoved;
  }

  public getMyId(): string {
    return this.myParticipantId;
  }

  public setLocalStream(stream: MediaStream | null) {
    this.localStream = stream;
    if (!stream) return;

    // Update tracks for existing peer connections
    this.peers.forEach((pc) => {
      const senders = pc.getSenders();
      stream.getTracks().forEach((track) => {
        const sender = senders.find((s) => s.track?.kind === track.kind);
        if (sender) {
          sender.replaceTrack(track).catch(() => {});
        } else {
          try {
            pc.addTrack(track, stream);
          } catch {}
        }
      });
    });
  }

  public async connectToPeer(remoteParticipantId: string, isInitiator: boolean): Promise<RTCPeerConnection> {
    if (this.peers.has(remoteParticipantId)) {
      return this.peers.get(remoteParticipantId)!;
    }

    const pc = new RTCPeerConnection(RTC_CONFIG);
    this.peers.set(remoteParticipantId, pc);

    // 1. Add local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        try {
          pc.addTrack(track, this.localStream!);
        } catch {}
      });
    }

    // 2. Handle remote tracks
    pc.ontrack = (event) => {
      let rStream = this.remoteStreams.get(remoteParticipantId);
      if (!rStream) {
        rStream = new MediaStream();
        this.remoteStreams.set(remoteParticipantId, rStream);
      }
      if (event.track) {
        rStream.addTrack(event.track);
      }
      if (event.streams && event.streams[0]) {
        this.onRemoteTrack(remoteParticipantId, event.streams[0]);
      } else {
        this.onRemoteTrack(remoteParticipantId, rStream);
      }
    };

    // 3. ICE Candidate handling
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.onSignalOut(remoteParticipantId, "candidate", JSON.stringify(event.candidate));
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "disconnected" || pc.connectionState === "failed" || pc.connectionState === "closed") {
        this.closePeer(remoteParticipantId);
      }
    };

    // 4. If initiator, create and send SDP offer
    if (isInitiator) {
      try {
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });
        await pc.setLocalDescription(offer);
        this.onSignalOut(remoteParticipantId, "offer", JSON.stringify(offer));
      } catch (err) {
        console.warn(`Create offer failed for ${remoteParticipantId}:`, err);
      }
    }

    return pc;
  }

  public async handleIncomingSignal(fromParticipantId: string, type: "offer" | "answer" | "candidate", payload: string) {
    let pc = this.peers.get(fromParticipantId);
    if (!pc) {
      pc = await this.connectToPeer(fromParticipantId, false);
    }

    try {
      const data = JSON.parse(payload);

      if (type === "offer") {
        await pc.setRemoteDescription(new RTCSessionDescription(data));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.onSignalOut(fromParticipantId, "answer", JSON.stringify(answer));
      } else if (type === "answer") {
        await pc.setRemoteDescription(new RTCSessionDescription(data));
      } else if (type === "candidate") {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data));
        } catch {}
      }
    } catch (err) {
      console.warn(`Signal handling error (${type}) from ${fromParticipantId}:`, err);
    }
  }

  public closePeer(remoteParticipantId: string) {
    const pc = this.peers.get(remoteParticipantId);
    if (pc) {
      try {
        pc.close();
      } catch {}
      this.peers.delete(remoteParticipantId);
    }
    this.remoteStreams.delete(remoteParticipantId);
    this.onRemoteTrackRemoved(remoteParticipantId);
  }

  public closeAll() {
    this.peers.forEach((pc) => {
      try {
        pc.close();
      } catch {}
    });
    this.peers.clear();
    this.remoteStreams.clear();
  }
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
