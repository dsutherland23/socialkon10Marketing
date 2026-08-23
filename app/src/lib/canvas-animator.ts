/* ------------------------------------------------------------------
   CANVAS ANIMATOR & MOTION ENGINE (§Canva Parity)
   1-Click Element & Page Animations: Fade, Rise, Pop, Breathe,
   Neon Flicker, Stamp, and high-res WebM / MP4 video recording.
------------------------------------------------------------------- */

import type { Canvas, FabricObject } from "fabric";

export type AnimationType = "none" | "fade" | "rise" | "pop" | "slide_left" | "breathe" | "neon_flicker" | "stamp";

export interface AnimationPreset {
  id: AnimationType;
  name: string;
  description: string;
  icon: string;
  durationMs: number;
}

export const ANIMATION_PRESETS: AnimationPreset[] = [
  { id: "rise", name: "Rise Up", description: "Smooth elevation from bottom", icon: "⬆️", durationMs: 1200 },
  { id: "pop", name: "Pop & Bounce", description: "Bouncy scale expansion", icon: "💥", durationMs: 900 },
  { id: "fade", name: "Fade In", description: "Classic smooth opacity reveal", icon: "✨", durationMs: 1000 },
  { id: "slide_left", name: "Slide In", description: "High-speed sweep from left", icon: "➡️", durationMs: 1000 },
  { id: "breathe", name: "Breathe Pulse", description: "Continuous hypnotic pulse", icon: "🫀", durationMs: 2000 },
  { id: "neon_flicker", name: "Neon Flicker", description: "Retro neon electric flicker", icon: "⚡", durationMs: 1400 },
  { id: "stamp", name: "Heavy Stamp", description: "Impact drop with shockwave", icon: "🔨", durationMs: 700 },
];

interface ObjectInitialState {
  obj: FabricObject;
  left: number;
  top: number;
  opacity: number;
  scaleX: number;
  scaleY: number;
}

/**
 * Capture original state of all objects on canvas.
 */
export function captureInitialState(c: Canvas): ObjectInitialState[] {
  return c.getObjects().map((obj) => ({
    obj,
    left: obj.left ?? 0,
    top: obj.top ?? 0,
    opacity: obj.opacity ?? 1,
    scaleX: obj.scaleX ?? 1,
    scaleY: obj.scaleY ?? 1,
  }));
}

/**
 * Restore original state of all objects on canvas.
 */
export function restoreInitialState(c: Canvas, states: ObjectInitialState[]): void {
  states.forEach((s) => {
    s.obj.set({
      left: s.left,
      top: s.top,
      opacity: s.opacity,
      scaleX: s.scaleX,
      scaleY: s.scaleY,
    });
  });
  c.renderAll();
}

/**
 * Play a single animation cycle on the canvas.
 */
export function playAnimationCycle(
  c: Canvas,
  anim: AnimationType,
  states: ObjectInitialState[],
  onComplete?: () => void
): () => void {
  let isCancelled = false;
  const startTime = performance.now();
  const preset = ANIMATION_PRESETS.find((p) => p.id === anim) || ANIMATION_PRESETS[0];
  const duration = preset.durationMs;

  function frame(now: number) {
    if (isCancelled) return;
    const elapsed = now - startTime;
    const progress = Math.min(1, elapsed / duration);

    // Easing curves
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
    const easeOutBack = (t: number) => {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    };

    states.forEach((s, idx) => {
      const stagger = (idx * 0.08);
      const staggeredT = Math.max(0, Math.min(1, (progress - stagger) / (1 - stagger)));

      if (anim === "rise") {
        const ease = easeOutCubic(staggeredT);
        s.obj.set({
          top: s.top + (1 - ease) * 120,
          opacity: s.opacity * ease,
        });
      } else if (anim === "pop") {
        const ease = easeOutBack(staggeredT);
        s.obj.set({
          scaleX: s.scaleX * ease,
          scaleY: s.scaleY * ease,
          opacity: s.opacity * Math.min(1, staggeredT * 2),
        });
      } else if (anim === "fade") {
        const ease = easeOutCubic(staggeredT);
        s.obj.set({
          opacity: s.opacity * ease,
        });
      } else if (anim === "slide_left") {
        const ease = easeOutCubic(staggeredT);
        s.obj.set({
          left: s.left - (1 - ease) * 180,
          opacity: s.opacity * ease,
        });
      } else if (anim === "breathe") {
        const wave = Math.sin(progress * Math.PI * 2);
        const scaleMult = 1 + wave * 0.04;
        s.obj.set({
          scaleX: s.scaleX * scaleMult,
          scaleY: s.scaleY * scaleMult,
        });
      } else if (anim === "neon_flicker") {
        const flicker = Math.random() > 0.3 ? 1 : 0.2;
        s.obj.set({
          opacity: s.opacity * (staggeredT > 0.8 ? 1 : flicker),
        });
      } else if (anim === "stamp") {
        const ease = easeOutCubic(staggeredT);
        s.obj.set({
          scaleX: s.scaleX * (2 - ease),
          scaleY: s.scaleY * (2 - ease),
          opacity: s.opacity * ease,
        });
      }
    });

    c.renderAll();

    if (progress < 1) {
      requestAnimationFrame(frame);
    } else {
      if (onComplete) onComplete();
    }
  }

  requestAnimationFrame(frame);

  return () => {
    isCancelled = true;
    restoreInitialState(c, states);
  };
}

/**
 * Record canvas animation directly to a high-quality video (WebM/MP4) or GIF.
 */
export async function recordCanvasAnimation(
  c: Canvas,
  anim: AnimationType,
  filename = "animated-flyer.webm"
): Promise<Blob> {
  const states = captureInitialState(c);
  const canvasEl = c.getElement();
  const stream = canvasEl.captureStream(30); // 30 FPS

  const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
    ? "video/webm;codecs=vp9"
    : MediaRecorder.isTypeSupported("video/webm")
    ? "video/webm"
    : "video/mp4";

  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6000000 });
  const chunks: Blob[] = [];

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  return new Promise((resolve) => {
    recorder.onstop = () => {
      restoreInitialState(c, states);
      const videoBlob = new Blob(chunks, { type: mimeType });
      // Trigger download
      const url = URL.createObjectURL(videoBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      resolve(videoBlob);
    };

    recorder.start();
    playAnimationCycle(c, anim, states, () => {
      setTimeout(() => {
        recorder.stop();
      }, 300);
    });
  });
}
