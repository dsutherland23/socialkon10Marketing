import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  detectSharedSurface,
  applyScreenTrackOptimization,
  isDisplayMediaSupported,
  getDisplayMediaStream,
} from "../webrtc";

function createFakeStream(opts?: {
  displaySurface?: string;
  width?: number;
  height?: number;
  withAudio?: boolean;
}) {
  const videoTrack: any = {
    kind: "video",
    contentHint: "",
    getSettings: () => ({
      displaySurface: opts?.displaySurface,
      width: opts?.width,
      height: opts?.height,
    }),
    stop: vi.fn(),
  };
  const audioTracks = opts?.withAudio ? [{ kind: "audio", stop: vi.fn() }] : [];
  return {
    getVideoTracks: () => [videoTrack],
    getAudioTracks: () => audioTracks,
    getTracks: () => [videoTrack, ...audioTracks],
    _videoTrack: videoTrack,
  } as unknown as MediaStream & { _videoTrack: any };
}

describe("2026 Screen & Application Sharing Helpers", () => {
  const originalNavigator = globalThis.navigator;
  const originalCaptureController = (globalThis as any).CaptureController;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "navigator", {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
    (globalThis as any).CaptureController = originalCaptureController;
  });

  it("detects application window, browser tab, and full monitor surfaces accurately", () => {
    const appStream = createFakeStream({
      displaySurface: "window",
      width: 2560,
      height: 1440,
      withAudio: false,
    });
    const appMeta = detectSharedSurface(appStream);
    expect(appMeta.surface).toBe("window");
    expect(appMeta.label).toBe("Application Window");
    expect(appMeta.shortLabel).toBe("App Window");
    expect(appMeta.icon).toBe("🪟");
    expect(appMeta.resolution).toBe("2560×1440");
    expect(appMeta.hasSystemAudio).toBe(false);

    const tabStream = createFakeStream({
      displaySurface: "browser",
      width: 1920,
      height: 1080,
      withAudio: true,
    });
    const tabMeta = detectSharedSurface(tabStream);
    expect(tabMeta.surface).toBe("browser");
    expect(tabMeta.shortLabel).toBe("Browser Tab");
    expect(tabMeta.icon).toBe("🌐");
    expect(tabMeta.hasSystemAudio).toBe(true);

    const monitorStream = createFakeStream({
      displaySurface: "monitor",
      width: 1920,
      height: 1080,
    });
    const monitorMeta = detectSharedSurface(monitorStream);
    expect(monitorMeta.surface).toBe("monitor");
    expect(monitorMeta.shortLabel).toBe("Full Screen");
    expect(monitorMeta.icon).toBe("🖥️");
  });

  it("applies WebRTC contentHint ('detail' vs 'motion') to screen video track", () => {
    const stream = createFakeStream({ displaySurface: "window" });
    applyScreenTrackOptimization(stream, "detail");
    expect(stream._videoTrack.contentHint).toBe("detail");

    applyScreenTrackOptimization(stream, "motion");
    expect(stream._videoTrack.contentHint).toBe("motion");
  });

  it("requests application window capture with CaptureController focus and Hall-of-Mirrors exclusion", async () => {
    const setFocusBehavior = vi.fn();
    (globalThis as any).CaptureController = class {
      setFocusBehavior = setFocusBehavior;
    };

    const fakeStream = createFakeStream({ displaySurface: "window", width: 1920, height: 1080 });
    const getDisplayMedia = vi.fn().mockResolvedValue(fakeStream);

    Object.defineProperty(globalThis, "navigator", {
      value: {
        userAgent: "Mozilla/5.0 Chrome/135.0.0.0",
        mediaDevices: {
          getDisplayMedia,
          getSupportedConstraints: () => ({
            selfBrowserSurface: true,
            surfaceSwitching: true,
            systemAudio: true,
          }),
        },
      },
      configurable: true,
      writable: true,
    });

    expect(isDisplayMediaSupported()).toBe(true);

    const stream = await getDisplayMediaStream({
      surface: "window",
      optimizeFor: "detail",
      withAudio: true,
    });

    expect(stream).toBe(fakeStream);
    expect(getDisplayMedia).toHaveBeenCalledTimes(1);
    const passedConstraints = getDisplayMedia.mock.calls[0][0];
    expect(passedConstraints.video.displaySurface).toBe("window");
    expect(passedConstraints.selfBrowserSurface).toBe("exclude");
    expect(passedConstraints.surfaceSwitching).toBe("include");
    expect(setFocusBehavior).toHaveBeenCalledWith("focus-captured-surface");
    expect(fakeStream._videoTrack.contentHint).toBe("detail");
  });

  it("falls back progressively when a browser rejects advanced constraint keys", async () => {
    const fakeStream = createFakeStream({ displaySurface: "monitor" });
    const getDisplayMedia = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Unsupported constraint"))
      .mockResolvedValueOnce(fakeStream);

    Object.defineProperty(globalThis, "navigator", {
      value: {
        userAgent: "Mozilla/5.0 Safari/605.1.15",
        mediaDevices: {
          getDisplayMedia,
          getSupportedConstraints: () => ({}),
        },
      },
      configurable: true,
      writable: true,
    });

    const stream = await getDisplayMediaStream({ surface: "monitor", optimizeFor: "motion" });
    expect(stream).toBe(fakeStream);
    expect(getDisplayMedia).toHaveBeenCalledTimes(2);
    expect(fakeStream._videoTrack.contentHint).toBe("motion");
  });
});
