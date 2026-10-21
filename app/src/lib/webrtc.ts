/* ------------------------------------------------------------------
   WEBRTC MEDIA ENGINE & DEVICE DIAGNOSTICS (2026 Production Standard)
   - Live camera & microphone acquisition
   - Audio VU meter via Web Audio API AnalyserNode
   - Speaker chime test via Web Audio Oscillator
   - Screen sharing with system audio capture
   - Real-time connection quality telemetry
   - Opus in-band FEC + DTX negotiation (choppy-audio resilience)
   - Codec preferences (VP9-first video) & adaptive send profiles
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

/** Enumerate available camera, microphone and speaker devices.
 *  Call again after getUserMedia succeeds — browsers only populate
 *  device labels once permission has been granted. */
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

/** 2026-standard audio capture chain: mono 48 kHz voice channel with the
 *  full echo/noise/gain DSP stack. Mono + Opus DTX keeps voice smooth even
 *  on constrained uplinks. */
function buildAudioConstraints(deviceId?: string): MediaTrackConstraints {
  return {
    ...(deviceId ? { deviceId: { ideal: deviceId } } : {}),
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: { ideal: 1 },
    sampleRate: { ideal: 48000 },
  };
}

/** Hint the browser's encoder about content type — "speech" optimizes the
 *  audio pipeline for voice, "motion" favors fluid camera video. */
export function applyLocalTrackHints(stream: MediaStream): void {
  stream.getAudioTracks().forEach((t) => {
    try {
      (t as MediaStreamTrack & { contentHint?: string }).contentHint = "speech";
    } catch {
      // contentHint unsupported — harmless, encoding defaults apply
    }
  });
  stream.getVideoTracks().forEach((t) => {
    try {
      (t as MediaStreamTrack & { contentHint?: string }).contentHint = "motion";
    } catch {
      // contentHint unsupported — harmless, encoding defaults apply
    }
  });
}

/** Request local camera and microphone media stream with progressive fallback */
export async function getLocalUserMedia(options?: {
  audioDeviceId?: string;
  videoDeviceId?: string;
  audio?: boolean;
  video?: boolean;
}): Promise<MediaStream> {
  const stream = await getLocalUserMediaRaw(options);
  applyLocalTrackHints(stream);
  return stream;
}

async function getLocalUserMediaRaw(options?: {
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

  // 1. First Attempt: Target specific devices with ideal constraints (or mobile facingMode)
  const isMobile = typeof window !== "undefined" && (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth < 768);

  const primaryConstraints: MediaStreamConstraints = {
    audio: wantAudio ? buildAudioConstraints(options?.audioDeviceId) : false,
    video: wantVideo
      ? options?.videoDeviceId
        ? { deviceId: { ideal: options.videoDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } }
        : isMobile
        ? { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } }
        : { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } }
      : false,
  };

  try {
    return await navigator.mediaDevices.getUserMedia(primaryConstraints);
  } catch (err1) {
    console.warn("Primary media request failed, attempting fallback:", err1);

    // 2. Second Attempt: Mobile facingMode fallback
    if (wantAudio && wantVideo) {
      try {
        return await navigator.mediaDevices.getUserMedia({
          audio: buildAudioConstraints(),
          video: { facingMode: "user" },
        });
      } catch (err2) {
        console.warn("Mobile facingMode request failed:", err2);
      }
    }

    // 3. Third Attempt: Generic audio + video constraints
    if (wantAudio && wantVideo) {
      try {
        return await navigator.mediaDevices.getUserMedia({
          audio: buildAudioConstraints(),
          video: true,
        });
      } catch (err3) {
        console.warn("Generic audio+video request failed:", err3);
      }
    }

    // 4. Fourth Attempt: Audio-only fallback if camera is blocked/busy
    if (wantAudio) {
      try {
        const audioOnlyStream = await navigator.mediaDevices.getUserMedia({ audio: buildAudioConstraints() });
        return audioOnlyStream;
      } catch (err4) {
        console.warn("Audio-only fallback failed:", err4);
      }
    }

    // 5. Fifth Attempt: Video-only fallback if mic is blocked
    if (wantVideo) {
      try {
        const videoOnlyStream = await navigator.mediaDevices.getUserMedia({ video: true });
        return videoOnlyStream;
      } catch (err5) {
        console.warn("Video-only fallback failed:", err5);
      }
    }

    throw new Error("Unable to access camera or microphone. Please check your browser device permissions.");
  }
}

/* ---------------- WebRTC Multi-Peer Mesh Session ---------------- */

/** STUN servers are free; TURN is required for restrictive/symmetric NATs
 *  (corporate firewalls, some mobile carriers). Configure via env:
 *  VITE_TURN_URLS (comma-separated), VITE_TURN_USERNAME, VITE_TURN_CREDENTIAL. */
export function getRtcConfig(): RTCConfiguration {
  const iceServers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ];
  try {
    const env = import.meta.env || {};
    const turnUrls = String(env.VITE_TURN_URLS || "").split(",").map((u: string) => u.trim()).filter(Boolean);
    if (turnUrls.length > 0) {
      iceServers.push({
        urls: turnUrls,
        username: env.VITE_TURN_USERNAME || undefined,
        credential: env.VITE_TURN_CREDENTIAL || undefined,
      });
    }
  } catch {
    // TURN is optional — STUN-only config still works for most networks
  }
  return {
    iceServers,
    // One transport for all media — fewer ports, less setup churn, faster
    // ICE. Standard in every production meeting app.
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
    iceCandidatePoolSize: 2,
  };
}

export const RTC_CONFIG: RTCConfiguration = getRtcConfig();

/** Perfect-negotiation politeness rule (RFC 8860 style): the peer with the
 *  lexicographically larger id is "polite" and rolls back on offer collision.
 *  Pure & deterministic so both sides always agree without extra signaling. */
export function isPolitePeer(myId: string, remoteId: string): boolean {
  return myId > remoteId;
}

/* ---------------- 2026 Media Quality Enhancements ---------------- */

/** Rewrite the Opus fmtp lines in an SDP blob to request in-band FEC
 *  (recovers lost voice packets) and DTX (stops sending during silence,
 *  freeing uplink for video). These two params are the single biggest
 *  lever against "choppy / robotic" audio on lossy networks, and every
 *  major meeting stack (Jitsi, mediasoup templates) negotiates them. */
export function enhanceOpusSdp(sdp: string): string {
  const opusPts = new Set<string>();
  sdp.split(/\r?\n/).forEach((line) => {
    const m = line.match(/^a=rtpmap:(\d+)\s+opus\/48000/i);
    if (m) opusPts.add(m[1]);
  });
  if (opusPts.size === 0) return sdp;

  const lines = sdp.split(/\r?\n/);
  const out: string[] = [];
  const seenFmtp = new Set<string>();
  for (const line of lines) {
    const fmtp = line.match(/^a=fmtp:(\d+)\s+(.*)$/);
    if (fmtp && opusPts.has(fmtp[1])) {
      seenFmtp.add(fmtp[1]);
      let params = fmtp[2];
      if (!/useinbandfec=1/i.test(params)) params += ";useinbandfec=1";
      if (!/usedtx=1/i.test(params)) params += ";usedtx=1";
      out.push(`a=fmtp:${fmtp[1]} ${params}`);
    } else {
      out.push(line);
    }
  }

  // Some stacks omit the fmtp line entirely — inject one after the rtpmap.
  if ([...opusPts].some((pt) => !seenFmtp.has(pt))) {
    const finalLines: string[] = [];
    for (const line of out) {
      finalLines.push(line);
      const rm = line.match(/^a=rtpmap:(\d+)\s+opus\/48000/i);
      if (rm && opusPts.has(rm[1]) && !seenFmtp.has(rm[1])) {
        finalLines.push(`a=fmtp:${rm[1]} minptime=10;useinbandfec=1;usedtx=1`);
      }
    }
    return finalLines.join("\r\n");
  }
  return out.join("\r\n");
}

/** Lower score = more preferred. VP9 first: better quality-per-bit and far
 *  better packet-loss resilience than VP8; H264 next for hardware encode;
 *  AV1 last — great compression but expensive software encode on low-end
 *  devices causes exactly the choppiness we are fixing. */
export function scoreCodecPreference(kind: "audio" | "video", codec: { mimeType: string }): number {
  const mime = codec.mimeType.toLowerCase();
  if (kind === "audio") {
    if (mime.includes("opus")) return 0;
    if (mime.includes("g722")) return 10;
    if (mime.includes("pcmu") || mime.includes("pcma")) return 20;
    return 50;
  }
  if (mime.includes("vp9")) return 0;
  if (mime.includes("h264")) return 10;
  if (mime.includes("vp8")) return 20;
  if (mime.includes("av1")) return 30;
  return 50;
}

export interface VideoSendProfile {
  maxBitrate: number; // bps
  scaleResolutionDownBy: number;
  degradationPreference: "maintain-framerate" | "maintain-resolution" | "balanced";
  contentHint: "motion" | "detail";
}

/** Mesh topology costs scale ~N² — every extra participant means another
 *  full copy of your video on the uplink. Industry practice (and the only
 *  way a mesh stays smooth) is to step the outgoing camera profile down as
 *  the room fills. Screen share keeps full resolution for legible text. */
export function getVideoSendProfile(opts: {
  participantCount: number;
  isScreenSharing: boolean;
}): VideoSendProfile {
  if (opts.isScreenSharing) {
    return {
      maxBitrate: 3_000_000,
      scaleResolutionDownBy: 1,
      degradationPreference: "maintain-resolution",
      contentHint: "detail",
    };
  }
  const n = Math.max(1, opts.participantCount);
  if (n <= 2) {
    return { maxBitrate: 1_700_000, scaleResolutionDownBy: 1, degradationPreference: "maintain-framerate", contentHint: "motion" };
  }
  if (n <= 4) {
    return { maxBitrate: 1_000_000, scaleResolutionDownBy: 1.5, degradationPreference: "maintain-framerate", contentHint: "motion" };
  }
  if (n <= 9) {
    return { maxBitrate: 600_000, scaleResolutionDownBy: 2, degradationPreference: "balanced", contentHint: "motion" };
  }
  return { maxBitrate: 320_000, scaleResolutionDownBy: 3, degradationPreference: "balanced", contentHint: "motion" };
}

/** Connection quality scoring from getStats deltas. Thresholds follow the
 *  MOS-style heuristics used by meeting dashboards:
 *  3 = good, 2 = fair, 1 = poor, 0 = unknown/insufficient data. */
export function scoreConnectionQuality(input: {
  packetLossPct: number;
  rttMs: number | null;
  jitterMs: number | null;
}): 0 | 1 | 2 | 3 {
  const { packetLossPct, rttMs, jitterMs } = input;
  if (rttMs === null && jitterMs === null && packetLossPct === 0) return 0;
  if (packetLossPct > 8 || (rttMs !== null && rttMs > 600) || (jitterMs !== null && jitterMs > 60)) return 1;
  if (packetLossPct > 2.5 || (rttMs !== null && rttMs > 250) || (jitterMs !== null && jitterMs > 30)) return 2;
  return 3;
}

export interface PeerQualitySample {
  packetLossPct: number;
  rttMs: number | null;
  jitterMs: number | null;
  score: 0 | 1 | 2 | 3;
}

/** Samples a peer connection's inbound RTP stats and turns the raw counters
 *  into a stable quality score. Keeps its own previous snapshot so each
 *  call returns the delta for that interval. */
export class ConnectionQualityMonitor {
  private lastPackets = new WeakMap<RTCPeerConnection, { lost: number; received: number }>();

  async sample(pc: RTCPeerConnection): Promise<PeerQualitySample> {
    let lostDelta = 0;
    let receivedDelta = 0;
    let rttMs: number | null = null;
    let jitterMs: number | null = null;

    try {
      const stats = await pc.getStats();
      const jitterValues: number[] = [];
      stats.forEach((report) => {
        const type = (report as { type?: string }).type;
        if (type === "inbound-rtp") {
          const ir = report as unknown as { packetsLost?: number; packetsReceived?: number; jitter?: number };
          const prev = this.lastPackets.get(pc);
          lostDelta += Math.max(0, (ir.packetsLost ?? 0) - (prev?.lost ?? 0));
          receivedDelta += Math.max(0, (ir.packetsReceived ?? 0) - (prev?.received ?? 0));
          this.lastPackets.set(pc, { lost: ir.packetsLost ?? 0, received: ir.packetsReceived ?? 0 });
          if (typeof ir.jitter === "number") jitterValues.push(ir.jitter * 1000);
        }
        if (type === "candidate-pair" && (report as { state?: string }).state === "succeeded") {
          const cp = report as unknown as { currentRoundTripTime?: number };
          if (typeof cp.currentRoundTripTime === "number") rttMs = cp.currentRoundTripTime * 1000;
        }
      });
      if (jitterValues.length > 0) {
        jitterMs = jitterValues.reduce((a, b) => a + b, 0) / jitterValues.length;
      }
    } catch {
      return { packetLossPct: 0, rttMs: null, jitterMs: null, score: 0 };
    }

    const total = lostDelta + receivedDelta;
    const packetLossPct = total > 0 ? (lostDelta / total) * 100 : 0;
    const score = scoreConnectionQuality({ packetLossPct, rttMs, jitterMs });
    return { packetLossPct, rttMs, jitterMs, score };
  }
}

/** Apply codec preferences to every transceiver — no renegotiation needed
 *  until the next offer/answer, which the mesh will do naturally. */
function applyCodecPreferences(pc: RTCPeerConnection): void {
  if (typeof RTCRtpSender.getCapabilities !== "function") return;
  pc.getTransceivers().forEach((t) => {
    try {
      const kind = t.sender.track?.kind;
      if ((kind !== "audio" && kind !== "video") || typeof t.setCodecPreferences !== "function") return;
      const caps = RTCRtpSender.getCapabilities(kind);
      if (!caps?.codecs?.length) return;
      const sorted = [...caps.codecs].sort(
        (a, b) => scoreCodecPreference(kind, a) - scoreCodecPreference(kind, b)
      );
      t.setCodecPreferences(sorted);
    } catch {
      // codec preference is best-effort
    }
  });
}

export class WebRTCMeshSession {
  private myParticipantId: string;
  private onSignalOut: (targetParticipantId: string, type: "offer" | "answer" | "candidate", payload: string) => void;
  private onRemoteTrack: (participantId: string, stream: MediaStream) => void;
  private onRemoteTrackRemoved: (participantId: string) => void;
  private peers = new Map<string, RTCPeerConnection>();
  private remoteStreams = new Map<string, MediaStream>();
  private localStream: MediaStream | null = null;
  private makingOffer = new Map<string, boolean>();
  private ignoreOffer = new Map<string, boolean>();
  private lastIceRestart = new Map<string, number>();

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

    // Update tracks for existing peer connections. replaceTrack never needs
    // renegotiation; a genuinely new track kind triggers onnegotiationneeded.
    this.peers.forEach((pc) => {
      const senders = pc.getSenders();
      stream.getTracks().forEach((track) => {
        const sender = senders.find((s) => s.track?.kind === track.kind);
        if (sender) {
          if (sender.track?.id !== track.id) {
            sender.replaceTrack(track).catch(() => {});
          }
        } else {
          try {
            pc.addTrack(track, stream);
          } catch {}
        }
      });
      applyCodecPreferences(pc);
    });
  }

  /** Live-tune the outgoing video sender on every peer — bitrate cap,
   *  resolution scaling and degradation preference all apply WITHOUT
   *  renegotiation, so this is safe to call as rooms fill or links degrade. */
  public setVideoProfile(profile: VideoSendProfile) {
    this.peers.forEach((pc) => {
      pc.getSenders().forEach((sender) => {
        if (sender.track?.kind !== "video") return;
        try {
          const params = sender.getParameters();
          if (!params.encodings || params.encodings.length === 0) {
            params.encodings = [{}];
          }
          params.encodings[0].maxBitrate = profile.maxBitrate;
          params.encodings[0].scaleResolutionDownBy = profile.scaleResolutionDownBy;
          sender.setParameters(params).catch(() => {});
          // degradationPreference is a non-standard but widely supported
          // sender property (Safari/Chrome) — set it defensively.
          (sender as RTCRtpSender & { degradationPreference?: string }).degradationPreference =
            profile.degradationPreference;
        } catch {
          // sender tuning is best-effort
        }
      });
    });
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach((t) => {
        try {
          (t as MediaStreamTrack & { contentHint?: string }).contentHint = profile.contentHint;
        } catch {
          // contentHint unsupported — profile still applies via sender params
        }
      });
    }
  }

  /** Expose a peer connection for stats sampling (connection quality UI). */
  public getPeerConnection(remoteParticipantId: string): RTCPeerConnection | null {
    return this.peers.get(remoteParticipantId) ?? null;
  }

  /** All live peer ids — for quality polling loops. */
  public getPeerIds(): string[] {
    return [...this.peers.keys()];
  }

  public async connectToPeer(remoteParticipantId: string): Promise<RTCPeerConnection> {
    if (this.peers.has(remoteParticipantId)) {
      return this.peers.get(remoteParticipantId)!;
    }

    const pc = new RTCPeerConnection(getRtcConfig());
    this.peers.set(remoteParticipantId, pc);
    this.makingOffer.set(remoteParticipantId, false);
    this.ignoreOffer.set(remoteParticipantId, false);

    // 1. Add local tracks — triggers onnegotiationneeded, which drives the offer
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        try {
          pc.addTrack(track, this.localStream!);
        } catch {}
      });
    }
    // Prefer resilient codecs (Opus / VP9-first) before the first negotiation
    applyCodecPreferences(pc);

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

    // 4. Perfect negotiation — both sides may offer; collisions resolve politely
    pc.onnegotiationneeded = async () => {
      try {
        this.makingOffer.set(remoteParticipantId, true);
        // Explicit createOffer so we can inject Opus FEC/DTX into the SDP —
        // the strongest defense against choppy audio on lossy networks.
        const offer = await pc.createOffer();
        if (offer.sdp) offer.sdp = enhanceOpusSdp(offer.sdp);
        await pc.setLocalDescription(offer);
        if (pc.localDescription) {
          this.onSignalOut(remoteParticipantId, "offer", JSON.stringify(pc.localDescription));
        }
      } catch (err) {
        console.warn(`Negotiation failed for ${remoteParticipantId}:`, err);
      } finally {
        this.makingOffer.set(remoteParticipantId, false);
      }
    };

    // 5. Resilient connection state handling — "disconnected" is often a
    // transient network blip, so we never tear down on it. Only true failure
    // triggers an ICE restart (rate-limited); only "closed" disposes the peer.
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "failed") {
        const now = Date.now();
        const last = this.lastIceRestart.get(remoteParticipantId) || 0;
        if (now - last > 8000) {
          this.lastIceRestart.set(remoteParticipantId, now);
          try {
            pc.restartIce();
          } catch {
            // restart is best-effort; the next failure tick will retry
          }
        }
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "closed") {
        this.closePeer(remoteParticipantId);
      }
    };

    return pc;
  }

  public async handleIncomingSignal(fromParticipantId: string, type: "offer" | "answer" | "candidate", payload: string) {
    const pc = await this.connectToPeer(fromParticipantId);

    try {
      const data = JSON.parse(payload);

      if (type === "offer") {
        // Glare resolution: impolite peer ignores colliding offers entirely;
        // polite peer rolls back its own in-flight offer and accepts theirs.
        const offerCollision =
          this.makingOffer.get(fromParticipantId) || pc.signalingState !== "stable";
        const ignore = !isPolitePeer(this.myParticipantId, fromParticipantId) && offerCollision;
        this.ignoreOffer.set(fromParticipantId, ignore);
        if (ignore) return;
        if (offerCollision) {
          try {
            await pc.setLocalDescription({ type: "rollback" } as RTCSessionDescriptionInit);
          } catch {
            // rollback unsupported in older browsers — the remote will re-offer
          }
        }
        await pc.setRemoteDescription(new RTCSessionDescription(data));
        const answer = await pc.createAnswer();
        if (answer.sdp) answer.sdp = enhanceOpusSdp(answer.sdp);
        await pc.setLocalDescription(answer);
        this.onSignalOut(fromParticipantId, "answer", JSON.stringify(pc.localDescription || answer));
      } else if (type === "answer") {
        await pc.setRemoteDescription(new RTCSessionDescription(data));
      } else if (type === "candidate") {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data));
        } catch (err) {
          if (!this.ignoreOffer.get(fromParticipantId)) throw err;
        }
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
    this.makingOffer.delete(remoteParticipantId);
    this.ignoreOffer.delete(remoteParticipantId);
    this.lastIceRestart.delete(remoteParticipantId);
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
    this.makingOffer.clear();
    this.ignoreOffer.clear();
    this.lastIceRestart.clear();
  }
}

export type DisplaySurfaceType = "window" | "browser" | "monitor";
export type ScreenCaptureOptimization = "detail" | "motion";

export interface DisplayMediaOptions {
  preferWindow?: boolean;
  surface?: DisplaySurfaceType;
  withAudio?: boolean;
  optimizeFor?: ScreenCaptureOptimization;
}

/** Check whether native screen/application capture (getDisplayMedia) is supported on this device/browser */
export function isDisplayMediaSupported(): boolean {
  return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getDisplayMedia);
}

/** Apply WebRTC MediaStreamTrack contentHint ("detail" for crisp app UI/text, "motion" for 60fps video) */
export function applyScreenTrackOptimization(
  stream: MediaStream | null | undefined,
  optimizeFor: ScreenCaptureOptimization
): void {
  if (!stream) return;
  const videoTrack = stream.getVideoTracks()[0];
  if (!videoTrack) return;
  try {
    if ("contentHint" in videoTrack) {
      videoTrack.contentHint = optimizeFor;
    }
  } catch {
    // Ignore if read-only in older engines
  }
}

/** Inspect an active screen-share MediaStream to identify the shared surface (App Window, Browser Tab, or Full Monitor) */
export function detectSharedSurface(stream?: MediaStream | null): {
  surface: DisplaySurfaceType | "unknown";
  label: string;
  shortLabel: string;
  icon: string;
  resolution?: string;
  hasSystemAudio: boolean;
} {
  if (!stream) {
    return {
      surface: "unknown",
      label: "Live Screen",
      shortLabel: "Screen",
      icon: "🖥️",
      hasSystemAudio: false,
    };
  }
  const videoTrack = stream.getVideoTracks()[0];
  const settings = (videoTrack?.getSettings?.() ?? {}) as Record<string, unknown>;
  const rawSurface = String(settings.displaySurface || "");
  const width = typeof settings.width === "number" ? settings.width : undefined;
  const height = typeof settings.height === "number" ? settings.height : undefined;
  const resolution = width && height ? `${width}×${height}` : undefined;
  const hasSystemAudio = stream.getAudioTracks().length > 0;

  if (rawSurface === "window") {
    return {
      surface: "window",
      label: "Application Window",
      shortLabel: "App Window",
      icon: "🪟",
      resolution,
      hasSystemAudio,
    };
  }
  if (rawSurface === "browser") {
    return {
      surface: "browser",
      label: "Browser Tab",
      shortLabel: "Browser Tab",
      icon: "🌐",
      resolution,
      hasSystemAudio,
    };
  }
  if (rawSurface === "monitor") {
    return {
      surface: "monitor",
      label: "Entire Screen",
      shortLabel: "Full Screen",
      icon: "🖥️",
      resolution,
      hasSystemAudio,
    };
  }
  return {
    surface: "unknown",
    label: "Live Broadcast",
    shortLabel: "Screen",
    icon: "🖥️",
    resolution,
    hasSystemAudio,
  };
}

/** Request screen share stream (application window, browser tab, or entire display).
 *  Implements 2026 W3C Screen Capture best practices:
 *  - Explicit `displaySurface` ("window" | "browser" | "monitor")
 *  - `CaptureController` focus management
 *  - `surfaceSwitching: "include"` & `selfBrowserSurface` Hall-of-Mirrors protection
 *  - `track.contentHint` ("detail" for crisp creative software vs "motion" for video)
 *  - Progressive fallback for Safari/Firefox compatibility */
export async function getDisplayMediaStream(options?: DisplayMediaOptions): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error("Screen sharing is not supported in this browser.");
  }

  const targetSurface: DisplaySurfaceType | undefined =
    options?.surface ?? (options?.preferWindow ? "window" : undefined);
  const optimizeFor: ScreenCaptureOptimization = options?.optimizeFor ?? "detail";

  const videoConstraints: Record<string, unknown> = {
    cursor: "always",
    width: { ideal: 1920, max: optimizeFor === "detail" ? 2560 : 1920 },
    height: { ideal: 1080, max: optimizeFor === "detail" ? 1440 : 1080 },
    frameRate: optimizeFor === "motion" ? { ideal: 60, max: 60 } : { ideal: 30, max: 60 },
  };
  if (targetSurface) {
    videoConstraints.displaySurface = targetSurface;
  }

  const constraints: Record<string, unknown> = {
    video: videoConstraints,
    audio: options?.withAudio ?? true,
  };

  // Optional 2026 W3C CaptureController for window/tab focus behavior
  let controller: any = null;
  const CaptureControllerCtor = (globalThis as any).CaptureController;
  if (typeof CaptureControllerCtor === "function") {
    try {
      controller = new CaptureControllerCtor();
      constraints.controller = controller;
    } catch {
      controller = null;
    }
  }

  // Chromium 2026 Screen Capture hints (guarded for cross-browser compatibility)
  const testConstraints = navigator.mediaDevices.getSupportedConstraints?.() ?? {};
  const isChromium = /Chrome|Chromium|Edg/.test(navigator.userAgent);
  if ("selfBrowserSurface" in testConstraints || isChromium) {
    // Exclude the meeting tab itself when picking an app window or full screen to prevent Hall-of-Mirrors
    constraints.selfBrowserSurface = targetSurface === "browser" ? "include" : "exclude";
  }
  if ("surfaceSwitching" in testConstraints || isChromium) {
    constraints.surfaceSwitching = "include";
  }
  if ("monitorTypeSurfaces" in testConstraints || isChromium) {
    constraints.monitorTypeSurfaces = "include";
  }
  if ("systemAudio" in testConstraints || isChromium) {
    constraints.systemAudio = options?.withAudio === false ? "exclude" : "include";
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia(constraints as any);
  } catch (err: any) {
    // Do not retry if the user explicitly cancelled the picker dialog
    if (err?.name === "NotAllowedError" || err?.name === "AbortError") {
      throw err;
    }
    // Progressive fallback for browsers that reject advanced constraint keys
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: targetSurface ? ({ displaySurface: targetSurface } as any) : true,
      audio: options?.withAudio ?? false,
    });
  }

  // Configure focus behavior after capture starts if CaptureController is active
  if (controller && typeof controller.setFocusBehavior === "function") {
    try {
      const capturedSurface = detectSharedSurface(stream).surface;
      if (capturedSurface === "window" || capturedSurface === "browser") {
        controller.setFocusBehavior("focus-captured-surface");
      } else {
        controller.setFocusBehavior("no-focus-change");
      }
    } catch {
      // Focus behavior already finalized or unsupported for this surface
    }
  }

  applyScreenTrackOptimization(stream, optimizeFor);
  return stream;
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

/** Ensure AudioContext is running — resumes suspended context caused by
 *  browser autoplay policy restrictions after page load without interaction. */
async function resumeAudioContext(ctx: AudioContext): Promise<void> {
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      // Non-fatal — audio may still play in some browsers even when suspended
    }
  }
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

  const init = async () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      audioCtx = new AudioCtx();
      // Resume suspended context — required after page load without user interaction
      await resumeAudioContext(audioCtx);

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
  };

  init();

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
    (async () => {
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) { resolve(); return; }
        const ctx = new AudioCtx();
        await resumeAudioContext(ctx);

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
    })();
  });
}

/** Play an incoming call ringtone using Web Audio API */
export function playIncomingCallRingtone(): () => void {
  let isRinging = true;
  let audioCtx: AudioContext | null = null;

  (async () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      audioCtx = new AudioCtx();
      await resumeAudioContext(audioCtx);

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
  })();

  return () => {
    isRinging = false;
    try {
      audioCtx?.close();
    } catch {}
  };
}

/** Trigger device haptic / tactile vibration feedback on supported devices */
export function triggerHapticFeedback(pattern: number | number[] = 50): void {
  if (typeof window !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {}
  }
}

/** Play a soft, pleasant chat message incoming sound */
export function playMessageNotificationSound(): void {
  (async () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      await resumeAudioContext(ctx);
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(880, now); // A5
      osc.frequency.exponentialRampToValueAtTime(1174.66, now + 0.08); // D6

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.15, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.2);

      setTimeout(() => { ctx.close(); }, 250);
    } catch {}
  })();
}

/** Play a distinctive 3-tone meeting starting reminder chime */
export function playMeetingReminderChime(): void {
  (async () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      await resumeAudioContext(ctx);
      const now = ctx.currentTime;

      const notes = [523.25, 659.25, 880.0]; // C5, E5, A5
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = now + i * 0.12;

        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, start);

        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.2, start + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.45);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(start);
        osc.stop(start + 0.5);
      });

      setTimeout(() => { ctx.close(); }, 1000);
    } catch {}
  })();
}

/** Play a doorbell chime when a participant enters the waiting room */
export function playDoorbellChime(): void {
  (async () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      await resumeAudioContext(ctx);
      const now = ctx.currentTime;

      // Two-tone Ding-Dong (G5 783.99 Hz, then E5 659.25 Hz)
      const tones = [
        { freq: 783.99, start: now, dur: 0.6 },
        { freq: 659.25, start: now + 0.35, dur: 0.8 },
      ];

      tones.forEach(({ freq, start, dur }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, start);

        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.25, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, start + dur);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(start);
        osc.stop(start + dur + 0.05);
      });

      setTimeout(() => { ctx.close(); }, 1500);
    } catch {}
  })();
}

/** Play an attention-grabbing dual-bell chime when a participant raises their hand */
export function playHandRaiseChime(): void {
  (async () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      await resumeAudioContext(ctx);
      const now = ctx.currentTime;

      const notes = [440.0, 880.0]; // A4 -> A5 ascending octave chime
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = now + i * 0.15;

        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, start);

        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.25, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.5);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(start);
        osc.stop(start + 0.55);
      });

      setTimeout(() => { ctx.close(); }, 1000);
    } catch {}
  })();
}

/** Play a celebratory success chime when a deliverable concept is approved */
export function playSuccessChime(): void {
  (async () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      await resumeAudioContext(ctx);
      const now = ctx.currentTime;

      // Harmonious major triad arpeggio (C5 523.25 Hz, E5 659.25 Hz, G5 783.99 Hz, C6 1046.50 Hz)
      const tones = [
        { freq: 523.25, start: now, dur: 0.35 },
        { freq: 659.25, start: now + 0.1, dur: 0.35 },
        { freq: 783.99, start: now + 0.2, dur: 0.45 },
        { freq: 1046.5, start: now + 0.32, dur: 0.9 },
      ];

      tones.forEach(({ freq, start, dur }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, start);

        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.22, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, start + dur);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(start);
        osc.stop(start + dur + 0.05);
      });

      setTimeout(() => { ctx.close(); }, 1800);
    } catch {}
  })();
}
