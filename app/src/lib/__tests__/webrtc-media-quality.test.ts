import { describe, it, expect } from "vitest";
import {
  enhanceOpusSdp,
  scoreCodecPreference,
  getVideoSendProfile,
  scoreConnectionQuality,
} from "../webrtc";

describe("enhanceOpusSdp", () => {
  const baseSdp = [
    "v=0",
    "m=audio 9 UDP/TLS/RTP/SAVPF 111 0",
    "a=rtpmap:111 opus/48000/2",
    "a=fmtp:111 minptime=10",
    "a=rtpmap:0 PCMU/8000",
    "m=video 9 UDP/TLS/RTP/SAVPF 96",
    "a=rtpmap:96 VP8/90000",
  ].join("\r\n");

  it("adds in-band FEC and DTX to an existing opus fmtp line", () => {
    const out = enhanceOpusSdp(baseSdp);
    expect(out).toContain("a=fmtp:111 minptime=10;useinbandfec=1;usedtx=1");
  });

  it("does not touch non-opus payload types", () => {
    const out = enhanceOpusSdp(baseSdp);
    expect(out).toContain("a=rtpmap:0 PCMU/8000");
    expect(out).not.toContain("a=fmtp:0 ");
  });

  it("injects an fmtp line when opus has none", () => {
    const noFmtp = ["v=0", "m=audio 9 UDP/TLS/RTP/SAVPF 111", "a=rtpmap:111 opus/48000/2"].join("\r\n");
    const out = enhanceOpusSdp(noFmtp);
    expect(out).toContain("a=fmtp:111 minptime=10;useinbandfec=1;usedtx=1");
  });

  it("is idempotent — running twice never duplicates params", () => {
    const once = enhanceOpusSdp(baseSdp);
    const twice = enhanceOpusSdp(once);
    expect(twice).toBe(once);
  });

  it("returns SDP untouched when there is no opus", () => {
    const videoOnly = "v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=rtpmap:96 VP8/90000";
    expect(enhanceOpusSdp(videoOnly)).toBe(videoOnly);
  });
});

describe("scoreCodecPreference", () => {
  it("prefers opus above all other audio codecs", () => {
    expect(scoreCodecPreference("audio", { mimeType: "audio/opus" })).toBeLessThan(
      scoreCodecPreference("audio", { mimeType: "audio/PCMU" })
    );
  });

  it("orders video VP9 > H264 > VP8 > AV1 (loss resilience + encode cost)", () => {
    const vp9 = scoreCodecPreference("video", { mimeType: "video/VP9" });
    const h264 = scoreCodecPreference("video", { mimeType: "video/H264" });
    const vp8 = scoreCodecPreference("video", { mimeType: "video/VP8" });
    const av1 = scoreCodecPreference("video", { mimeType: "video/AV1" });
    expect(vp9).toBeLessThan(h264);
    expect(h264).toBeLessThan(vp8);
    expect(vp8).toBeLessThan(av1);
  });
});

describe("getVideoSendProfile", () => {
  it("gives full 720p-class quality for a 1:1 call", () => {
    const p = getVideoSendProfile({ participantCount: 2, isScreenSharing: false });
    expect(p.maxBitrate).toBe(1_700_000);
    expect(p.scaleResolutionDownBy).toBe(1);
    expect(p.degradationPreference).toBe("maintain-framerate");
  });

  it("steps quality down as the mesh fills (N² uplink cost)", () => {
    const small = getVideoSendProfile({ participantCount: 3, isScreenSharing: false });
    const mid = getVideoSendProfile({ participantCount: 6, isScreenSharing: false });
    const big = getVideoSendProfile({ participantCount: 20, isScreenSharing: false });
    expect(small.maxBitrate).toBeLessThan(1_700_000);
    expect(mid.maxBitrate).toBeLessThan(small.maxBitrate);
    expect(big.maxBitrate).toBeLessThan(mid.maxBitrate);
    expect(big.scaleResolutionDownBy).toBeGreaterThan(small.scaleResolutionDownBy);
  });

  it("keeps full resolution and resolution-preference for screen share", () => {
    const p = getVideoSendProfile({ participantCount: 12, isScreenSharing: true });
    expect(p.scaleResolutionDownBy).toBe(1);
    expect(p.degradationPreference).toBe("maintain-resolution");
    expect(p.contentHint).toBe("detail");
    expect(p.maxBitrate).toBe(3_000_000);
  });
});

describe("scoreConnectionQuality", () => {
  it("scores a clean link as good", () => {
    expect(scoreConnectionQuality({ packetLossPct: 0.5, rttMs: 60, jitterMs: 8 })).toBe(3);
  });

  it("scores moderate loss or latency as fair", () => {
    expect(scoreConnectionQuality({ packetLossPct: 4, rttMs: 80, jitterMs: 10 })).toBe(2);
    expect(scoreConnectionQuality({ packetLossPct: 0, rttMs: 300, jitterMs: 10 })).toBe(2);
    expect(scoreConnectionQuality({ packetLossPct: 0, rttMs: 80, jitterMs: 45 })).toBe(2);
  });

  it("scores heavy loss or extreme latency as poor", () => {
    expect(scoreConnectionQuality({ packetLossPct: 12, rttMs: 80, jitterMs: 10 })).toBe(1);
    expect(scoreConnectionQuality({ packetLossPct: 0, rttMs: 900, jitterMs: 10 })).toBe(1);
    expect(scoreConnectionQuality({ packetLossPct: 0, rttMs: 80, jitterMs: 120 })).toBe(1);
  });

  it("reports unknown when there is no data yet", () => {
    expect(scoreConnectionQuality({ packetLossPct: 0, rttMs: null, jitterMs: null })).toBe(0);
  });
});
