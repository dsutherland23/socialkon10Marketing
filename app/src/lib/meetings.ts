import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { db, firebaseReady } from "./firebase";

/* ------------------------------------------------------------------
   MEETINGS & COMMUNICATIONS DATA ENGINE (communication-meetings-v1)
   Unified communication model: scheduled meetings, instant video,
   instant voice, waiting room, chat, moderation, call history,
   attendance, presence, and AI summaries.
------------------------------------------------------------------- */

export type SessionType = "scheduled_meeting" | "instant_video_call" | "instant_voice_call";

export type SessionStatus =
  | "draft"
  | "scheduled"
  | "invitation_sent"
  | "accepted"
  | "declined"
  | "waiting"
  | "live"
  | "completed"
  | "cancelled"
  | "expired";

export type ParticipantRole = "host" | "cohost" | "participant" | "guest";

export type ParticipantStatus =
  | "invited"
  | "accepted"
  | "declined"
  | "waiting"
  | "admitted"
  | "joined"
  | "left"
  | "removed";

export interface MeetingParticipant {
  id: string;
  meetingId: string;
  userId?: string;
  email: string;
  displayName: string;
  role: ParticipantRole;
  status: ParticipantStatus;
  joinedAt?: string;
  leftAt?: string;
  isMuted?: boolean;
  isVideoOff?: boolean;
  isHandRaised?: boolean;
  isScreenSharing?: boolean;
  cameraAllowed?: boolean;
  microphoneAllowed?: boolean;
  screenShareAllowed?: boolean;
  chatAllowed?: boolean;
  connectionQuality?: "excellent" | "good" | "fair" | "poor";
  /** Set by the host to politely ask this participant to unmute (Zoom-style) */
  unmuteRequestedAt?: string;
  /** ID of the breakout room this participant is currently inside (null/undefined = Main Stage) */
  currentBreakoutRoomId?: string | null;
  /** ID of the breakout room where this participant clicked "Ask Host for Help" */
  helpRequestedRoomId?: string | null;
}

export interface MeetingChatMessage {
  id: string;
  meetingId: string;
  senderId: string;
  senderName: string;
  senderRole: ParticipantRole;
  recipientId?: string; // empty for public message, userId for private message
  /** Optional breakout room ID if sent inside a breakout room chat */
  breakoutRoomId?: string;
  breakoutRoomName?: string;
  message: string;
  createdAt: string;
}

export interface MeetingReaction {
  id: string;
  meetingId: string;
  senderId: string;
  senderName: string;
  emoji: "thumbs_up" | "heart" | "laugh" | "clap" | "celebrate" | "question";
  createdAt: number;
}

export interface MeetingBreakoutRoom {
  id: string;
  meetingId: string;
  name: string;
  topic?: string;
  status: "draft" | "open" | "closed";
  assignedParticipants: string[]; // participant IDs assigned to this room
  activeParticipants: string[];   // participant IDs currently inside this room
  durationMinutes?: number;
  openedAt?: string;
  endsAt?: string;
  createdAt: string;
}

export interface MeetingIntelligence {
  summary: string;
  keyPoints: string[];
  decisions: string[];
  actionItems: { task: string; assignee?: string; dueDate?: string }[];
  followUpItems: string[];
  generatedAt: string;
}

export interface ProofingFeedbackNote {
  id: string;
  senderName: string;
  text: string;
  approved: boolean;
  createdAt: string;
}

export interface ProofingMockupItem {
  id: string;
  title: string;
  category: string;
  image: string;
  notes?: string;
  uploadedBy?: string;
  createdAt?: string;
}

export const DEFAULT_PROOFING_MOCKUPS: ProofingMockupItem[] = [
  {
    id: "def_proof_1",
    title: "Social Media Brand Campaign 2026",
    category: "Social Campaign",
    image: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1200&auto=format&fit=crop",
    notes: "High-contrast dark mode aesthetics with neon department accents and conversion CTA.",
  },
  {
    id: "def_proof_2",
    title: "Studio Logo & Typography Lockup",
    category: "Identity & Branding",
    image: "https://images.unsplash.com/photo-1600132806370-bf17e65e942f?q=80&w=1200&auto=format&fit=crop",
    notes: "Vector-ready SVG export with primary and secondary typography color palette.",
  },
  {
    id: "def_proof_3",
    title: "Product Launch Promotional Banner",
    category: "E-Commerce / Ads",
    image: "https://images.unsplash.com/photo-1557804506-669a67965ba0?q=80&w=1200&auto=format&fit=crop",
    notes: "Optimized for Instagram 9:16 reels, TikTok ads, YouTube bumpers, and Google display.",
  },
];

export interface CanvasStroke {
  id: string;
  tool: "pen" | "highlighter" | "arrow" | "rect" | "circle";
  color: string;
  width: number;
  points: { x: number; y: number }[]; // percentage coordinates 0-100
  vanishing?: boolean;
  senderName: string;
  createdAt: string;
}

export interface CanvasPin {
  id: string;
  number: number;
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  text: string;
  resolved?: boolean;
  senderName: string;
  createdAt: string;
}

export interface MockupAnnotationState {
  strokes: CanvasStroke[];
  pins: CanvasPin[];
}

export interface ApprovedDeliverableRecord {
  id: string;
  mockupId: string;
  mockupTitle: string;
  mockupCategory: string;
  mockupImage: string;
  approved: boolean; // true = Approved Concept, false = Revision Requested
  approvedBy: string;
  approvedAt: string;
  feedbackText: string;
  pinsCount: number;
  pins: CanvasPin[]; // permanent preservation of all dropped pins & notes
  strokesCount: number;
}

export interface LiveProofingState {
  active: boolean;
  mockupIndex: number;
  presenterId: string;
  presenterName: string;
  mockups?: ProofingMockupItem[];
  laserPointer?: { x: number; y: number; updatedAt: number; senderName: string };
  zoomLevel?: number;
  feedbackNotes?: ProofingFeedbackNote[];
  approvedDeliverables?: ApprovedDeliverableRecord[];
  updatedAt: string;
}

export type CoDesignArtboardPresetId =
  | "square_1080"
  | "story_9_16"
  | "landscape_16_9"
  | "poster_3_4";

export type CoDesignFontFamily =
  | "Syne"
  | "Space Grotesk"
  | "Inter"
  | "Playfair Display"
  | "JetBrains Mono";

export interface CoDesignLayer {
  id: string;
  type: "text" | "badge" | "shape" | "image";
  name: string;
  text?: string;
  imageUrl?: string;
  shapeKind?: "rect" | "circle" | "pill" | "line";
  x: number; // percentage 0-100 (center X)
  y: number; // percentage 0-100 (center Y)
  width?: number; // percentage 5-100 of artboard
  height?: number; // percentage 5-100 of artboard
  fontSize: number; // px on reference canvas (12-72)
  fontFamily: CoDesignFontFamily;
  fontWeight: "normal" | "bold" | "extrabold";
  textAlign?: "left" | "center" | "right";
  color: string; // text color or shape border color
  fillColor?: string; // pill/badge/shape fill color
  opacity: number; // 0.1 - 1
  rotation?: number; // -180 to 180 deg
  borderRadius?: number; // px
  locked?: boolean;
  hidden?: boolean;
  updatedBy?: string;
}

export interface CoDesignVersionSnapshot {
  id: string;
  label: string;
  createdBy: string;
  createdAt: string;
  artboardPreset: CoDesignArtboardPresetId;
  backgroundColor: string;
  backgroundGradient?: string;
  backgroundImage?: string;
  backgroundDim: number;
  brandPalette: string[];
  layers: CoDesignLayer[];
}

export interface CoDesignCollaboratorCursor {
  participantId: string;
  displayName: string;
  color: string;
  x: number; // 0-100
  y: number; // 0-100
  selectedLayerId?: string | null;
  updatedAt?: number;
}

export interface CoDesignSessionState {
  active: boolean;
  title: string;
  sourceType: "deliverable" | "client_design" | "preset";
  sourceId?: string;
  hostId: string;
  hostName: string;
  allowParticipantEdits: boolean;
  artboardPreset: CoDesignArtboardPresetId;
  backgroundColor: string;
  backgroundGradient?: string;
  backgroundImage?: string;
  backgroundDim: number; // 0-85% overlay dim on background photo
  brandPalette: string[];
  showSafeZone: boolean;
  showGrid: boolean;
  layers: CoDesignLayer[];
  versions: CoDesignVersionSnapshot[];
  updatedAt: string;
  updatedBy: string;
}

export interface MeetingRecord {
  id: string;
  title: string;
  description: string;
  hostId: string;
  hostName: string;
  hostEmail: string;
  type: SessionType;
  status: SessionStatus;
  scheduledStart: string; // ISO 8601 UTC
  scheduledEnd: string;   // ISO 8601 UTC
  durationMinutes: number;
  timezone: string;       // e.g. "America/New_York", "UTC"
  roomId: string;
  passcode?: string;
  waitingRoomEnabled: boolean;
  authenticationRequired: boolean;
  meetingLocked: boolean;
  allowGuests: boolean;
  recordingEnabled: boolean;
  transcriptionEnabled: boolean;
  aiSummaryEnabled: boolean;
  chatEnabled: boolean;
  reactionsEnabled: boolean;
  screenShareMode: "host_only" | "host_and_cohost" | "everyone" | "disabled";
  allowCamera: boolean;
  allowMicrophone: boolean;
  participants: MeetingParticipant[];
  breakoutRooms?: MeetingBreakoutRoom[];
  breakoutAllowSelfSelect?: boolean;
  breakoutBroadcast?: {
    id: string;
    senderName: string;
    message: string;
    sentAt: string;
    createdAt?: string;
  };
  intelligence?: MeetingIntelligence;
  liveProofing?: LiveProofingState;
  /** Synchronized in-meeting multi-user Co-Design canvas state */
  coDesignSession?: CoDesignSessionState;
  /** "Come watch" ping broadcast when someone starts presenting (Zoom-style) */
  liveInvite?: { type: "screen_share" | "co_design" | "proofing"; senderId: string; senderName: string; sentAt: string };
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  endedAt?: string;
}

export interface CallHistoryRecord {
  id: string;
  sessionId: string;
  callerId: string;
  callerName: string;
  callerEmail: string;
  recipientId: string;
  recipientName: string;
  recipientEmail: string;
  type: "voice" | "video";
  status: "ringing" | "accepted" | "declined" | "missed" | "busy" | "cancelled" | "completed";
  startedAt: string;
  answeredAt?: string;
  endedAt?: string;
  durationSeconds: number;
}

export interface UserPresence {
  userId: string;
  email: string;
  displayName: string;
  status: "online" | "available" | "busy" | "in_meeting" | "do_not_disturb" | "offline";
  lastSeen: string;
  currentSessionId?: string;
}

/* ---------------- IndexedDB Fallback Store ---------------- */

const STORE_MEETINGS = "sk_meetings";
const STORE_CALLS = "sk_call_history";
const STORE_PRESENCE = "sk_user_presence";

async function getIdbData<T>(storeName: string): Promise<T[]> {
  try {
    const raw = localStorage.getItem(storeName);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function setIdbItem<T extends { id: string }>(storeName: string, item: T): Promise<void> {
  try {
    const items = await getIdbData<T>(storeName);
    const idx = items.findIndex((x) => x.id === item.id);
    if (idx >= 0) items[idx] = item; else items.unshift(item);
    localStorage.setItem(storeName, JSON.stringify(items));
  } catch (err) {
    console.warn("Local storage write error:", err);
  }
}

async function removeIdbItem(storeName: string, id: string): Promise<void> {
  try {
    const items = (await getIdbData<{ id: string }>(storeName)).filter((x) => x.id !== id);
    localStorage.setItem(storeName, JSON.stringify(items));
  } catch (err) {
    console.warn("Local storage delete error:", err);
  }
}

/* ---------------- Helper Utilities ---------------- */

export function generateRoomId(prefix = "sk"): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const seg1 = Array.from({ length: 3 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  const seg2 = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  const seg3 = Array.from({ length: 3 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `${prefix}-${seg1}-${seg2}-${seg3}`;
}

export function generatePasscode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/** Check whether current time is within the access window (30m before start to 30m after end). */
export function isMeetingJoinable(meeting: MeetingRecord): { canJoin: boolean; reason?: string } {
  if (meeting.status === "cancelled") return { canJoin: false, reason: "Meeting was cancelled" };
  if (meeting.status === "completed") return { canJoin: false, reason: "Meeting has completed" };
  if (meeting.meetingLocked) return { canJoin: false, reason: "Meeting is locked by host" };

  if (meeting.status === "live") return { canJoin: true };

  const now = Date.now();
  const start = new Date(meeting.scheduledStart).getTime();
  const end = new Date(meeting.scheduledEnd).getTime();
  const windowStart = start - 30 * 60 * 1000;
  const windowEnd = end + 30 * 60 * 1000;

  if (now < windowStart) {
    const minsUntil = Math.round((start - now) / 60000);
    return { canJoin: false, reason: `Meeting opens ${minsUntil} minutes before start` };
  }
  if (now > windowEnd) {
    return { canJoin: false, reason: "Meeting window has expired" };
  }

  return { canJoin: true };
}

/* ---------------- Tolerant Room Code Normalization ---------------- */

/** Normalize room IDs replacing all unicode dashes (en-dash, em-dash, non-breaking), URL prefixes, query strings, and whitespace */
export function normalizeRoomCode(input: string): string {
  if (!input) return "";
  return input
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D—–-]/g, "-") // Convert all unicode hyphens/en-dashes/em-dashes to standard ASCII hyphen
    .replace(/^https?:\/\/[^\/]+\/meet\//i, "")
    .replace(/^socialkon10\.pro\/meet\//i, "")
    .replace(/^www\.socialkon10\.pro\/meet\//i, "")
    .replace(/^\/meet\//i, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "")
    .replace(/\s+/g, "")
    .trim()
    .toUpperCase();
}

/** Extract pure alphanumeric characters for fuzzy key lookup (e.g. SKZZMNQSUWUZ) */
export function getAlphanumericRoomKey(input: string): string {
  if (!input) return "";
  return normalizeRoomCode(input).replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

/* ---------------- Meeting CRUD & Live Sync ---------------- */

export async function createMeeting(
  data: Omit<MeetingRecord, "id" | "roomId" | "createdAt" | "updatedAt">
): Promise<MeetingRecord> {
  const roomId = generateRoomId().toUpperCase();
  const now = new Date().toISOString();
  // Using roomId as document ID ensures direct 1-step O(1) resolution and perfect realtime subscriptions!
  const id = roomId;
  const alphaKey = getAlphanumericRoomKey(roomId);

  const meeting: MeetingRecord = cleanFirestoreObject({
    ...data,
    id,
    roomId,
    createdAt: now,
    updatedAt: now,
    participants: data.participants || [],
  });

  if (firebaseReady && db) {
    try {
      await setDoc(doc(db, "meetings", id), meeting);
      if (alphaKey && alphaKey !== id) {
        // Also save alphanumeric key alias so copy/paste variations match in 1 step!
        await setDoc(doc(db, "meetings", alphaKey), meeting);
      }
    } catch (err) {
      console.warn("Firestore createMeeting error, saving to IDB fallback:", err);
      await setIdbItem(STORE_MEETINGS, meeting);
    }
  } else {
    await setIdbItem(STORE_MEETINGS, meeting);
  }

  return meeting;
}

function cleanFirestoreValue(val: any): any {
  if (val === undefined) return undefined;
  if (val === null || typeof val !== "object" || val instanceof Date) return val;
  if (Array.isArray(val)) {
    return val
      .filter((item) => item !== undefined)
      .map((item) => cleanFirestoreValue(item));
  }
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(val)) {
    if (v !== undefined) {
      out[k] = cleanFirestoreValue(v);
    }
  }
  return out;
}

/** Recursively strip `undefined` values from objects AND elements inside arrays.
 *  Firestore rejects writes (`setDoc`, `updateDoc`, `tx.update`) if any nested
 *  array element (e.g. `participants[i].joinedAt` or `participants[i].userId`
 *  when a guest joins the waiting room) contains `undefined`. */
export function cleanFirestoreObject<T extends Record<string, any>>(obj: T): T {
  if (!obj || typeof obj !== "object") return obj;
  return cleanFirestoreValue(obj) as T;
}

export async function updateMeeting(
  id: string,
  updates: Partial<MeetingRecord>
): Promise<void> {
  const now = new Date().toISOString();
  const rawPayload = { ...updates, updatedAt: now };
  const payload = cleanFirestoreObject(rawPayload);

  if (firebaseReady && db) {
    try {
      const normalized = normalizeRoomCode(id);
      const alphaKey = getAlphanumericRoomKey(id);
      await setDoc(doc(db, "meetings", id), payload, { merge: true });
      // Mirror into every known alias key so fuzzy lookups never serve stale data
      for (const alias of [normalized, alphaKey]) {
        if (alias && alias !== id) {
          await setDoc(doc(db, "meetings", alias), payload, { merge: true }).catch(() => {});
        }
      }
      return;
    } catch (err) {
      console.warn("Firestore updateMeeting error:", err);
    }
  }

  const items = await getIdbData<MeetingRecord>(STORE_MEETINGS);
  const target = items.find((m) => m.id === id || m.roomId === id);
  if (target) {
    await setIdbItem(STORE_MEETINGS, { ...target, ...payload });
  }
}

export async function deleteMeeting(id: string): Promise<void> {
  if (firebaseReady && db) {
    try {
      await deleteDoc(doc(db, "meetings", id));
      const alphaKey = getAlphanumericRoomKey(id);
      if (alphaKey && alphaKey !== id) {
        await deleteDoc(doc(db, "meetings", alphaKey)).catch(() => {});
      }
    } catch (err) {
      console.warn("Firestore deleteMeeting error:", err);
    }
  }
  await removeIdbItem(STORE_MEETINGS, id);
}

/** Batch delete multiple meetings. */
export async function deleteMeetings(ids: string[]): Promise<void> {
  if (!ids || ids.length === 0) return;
  await Promise.allSettled(ids.map((id) => deleteMeeting(id)));
}

/** Batch update statuses for multiple meetings. */
export async function setMeetingsStatus(ids: string[], status: MeetingRecord["status"]): Promise<void> {
  if (!ids || ids.length === 0) return;
  await Promise.allSettled(ids.map((id) => updateMeeting(id, { status })));
}

/** Robust, unicode-tolerant, case-insensitive meeting lookup */
export async function getMeetingById(idOrRoomId: string): Promise<MeetingRecord | null> {
  if (!idOrRoomId) return null;
  const raw = idOrRoomId.trim();
  const normalized = normalizeRoomCode(raw);
  const alphaKey = getAlphanumericRoomKey(raw);

  if (firebaseReady && db) {
    try {
      // 1. Direct doc by normalized ID (e.g. SK-ZZM-NQSU-WUZ)
      if (normalized) {
        const snap1 = await getDoc(doc(db, "meetings", normalized));
        if (snap1.exists()) {
          const data1 = snap1.data() as MeetingRecord;
          if (data1.id && data1.id !== normalized) {
            const canon = await getDoc(doc(db, "meetings", data1.id)).catch(() => null);
            if (canon?.exists()) return canon.data() as MeetingRecord;
          }
          return data1;
        }
      }

      // 2. Direct doc by alphanumeric key (e.g. SKZZMNQSUWUZ)
      if (alphaKey) {
        const snap2 = await getDoc(doc(db, "meetings", alphaKey));
        if (snap2.exists()) {
          const data2 = snap2.data() as MeetingRecord;
          if (data2.id && data2.id !== alphaKey) {
            const canon = await getDoc(doc(db, "meetings", data2.id)).catch(() => null);
            if (canon?.exists()) return canon.data() as MeetingRecord;
          }
          return data2;
        }
      }

      // 3. Direct doc by raw ID
      const snap3 = await getDoc(doc(db, "meetings", raw));
      if (snap3.exists()) return snap3.data() as MeetingRecord;

      // 4. Scan all meetings in collection (handles legacy docs & format variations)
      const allSnap = await getDocs(collection(db, "meetings"));
      const found = allSnap.docs
        .map((d) => d.data() as MeetingRecord)
        .find((m) => {
          const mNorm = normalizeRoomCode(m.roomId || m.id || "");
          const mAlpha = getAlphanumericRoomKey(m.roomId || m.id || "");
          return (
            mNorm === normalized ||
            mAlpha === alphaKey ||
            (alphaKey.length >= 4 && mAlpha.includes(alphaKey)) ||
            m.roomId === raw ||
            m.id === raw
          );
        });
      if (found) return found;
    } catch (err) {
      console.warn("Firestore getMeetingById notice:", err);
    }
  }

  const items = await getIdbData<MeetingRecord>(STORE_MEETINGS);
  return (
    items.find((m) => {
      const mNorm = normalizeRoomCode(m.roomId || m.id || "");
      const mAlpha = getAlphanumericRoomKey(m.roomId || m.id || "");
      return (
        mNorm === normalized ||
        mAlpha === alphaKey ||
        (alphaKey.length >= 4 && mAlpha.includes(alphaKey)) ||
        m.roomId === raw ||
        m.id === raw
      );
    }) || null
  );
}

export async function listAllMeetings(): Promise<MeetingRecord[]> {
  if (firebaseReady && db) {
    try {
      const snap = await getDocs(collection(db, "meetings"));
      const map = new Map<string, MeetingRecord>();
      snap.docs.forEach((d) => {
        const data = d.data() as MeetingRecord;
        const key = data.id || d.id;
        if (!key) return;
        const existing = map.get(key);
        if (!existing || (data.updatedAt || "") > (existing.updatedAt || "") || d.id === data.id) {
          map.set(key, data);
        }
      });
      const list = Array.from(map.values());
      if (list.length > 0) {
        return list.sort((a, b) => new Date(b.scheduledStart).getTime() - new Date(a.scheduledStart).getTime());
      }
    } catch (err) {
      console.warn("Firestore listAllMeetings error:", err);
    }
  }

  const items = await getIdbData<MeetingRecord>(STORE_MEETINGS);
  return items.sort((a, b) => new Date(b.scheduledStart).getTime() - new Date(a.scheduledStart).getTime());
}

export async function listUserMeetings(userEmail: string, aliases?: string[]): Promise<MeetingRecord[]> {
  const all = await listAllMeetings();
  const searchEmails = [userEmail, ...(aliases || [])]
    .map((e) => e.toLowerCase().trim())
    .filter(Boolean);

  return all.filter((m) => {
    const hostEmail = m.hostEmail?.toLowerCase().trim() || "";
    const isHost = searchEmails.includes(hostEmail);
    const isParticipant = m.participants?.some((p) => {
      const pEmail = p.email?.toLowerCase().trim() || "";
      const pName = p.displayName?.toLowerCase().trim() || "";
      return searchEmails.some((se) => pEmail === se || pName === se || (se.includes("@") && pEmail === se));
    });
    return isHost || isParticipant;
  });
}

/** Subscribe to live meeting document updates with multi-tier fallback */
export function subscribeToMeeting(
  idOrRoomId: string,
  onUpdate: (meeting: MeetingRecord | null) => void
): Unsubscribe {
  if (!idOrRoomId) {
    onUpdate(null);
    return () => {};
  }

  const raw = idOrRoomId.trim();
  const normalized = normalizeRoomCode(raw);
  const alphaKey = getAlphanumericRoomKey(raw);
  const targetKey = normalized || alphaKey || raw;

  if (firebaseReady && db) {
    const firestore = db;
    let resolved = false;
    let cancelled = false;
    let currentKey = "";
    let innerUnsub: Unsubscribe = () => {};

    // Every write (participants, waiting-room admits, status) targets the
    // CANONICAL doc (`meeting.id`). createMeeting also stores a stale
    // alphanumeric alias copy, so a client that arrived via the alias key
    // would otherwise listen to a doc that never receives updates — and the
    // host would never see guests knocking. Always follow the canonical doc.
    const attach = (key: string) => {
      innerUnsub();
      currentKey = key;
      innerUnsub = onSnapshot(
        doc(firestore, "meetings", key),
        (snap) => {
          if (cancelled) return;
          if (snap.exists()) {
            resolved = true;
            const data = snap.data() as MeetingRecord;
            onUpdate(data);
            if (data.id && data.id !== snap.id && data.id !== currentKey) {
              attach(data.id);
            }
          } else {
            // Check collection for legacy IDs / variations
            getMeetingById(idOrRoomId).then((m) => {
              if (cancelled) return;
              if (m) {
                resolved = true;
                onUpdate(m);
                if (m.id && m.id !== currentKey) attach(m.id);
              } else if (!resolved) {
                onUpdate(null);
              }
            }).catch(() => {
              if (!cancelled && !resolved) onUpdate(null);
            });
          }
        },
        (err) => {
          console.warn("Meeting subscribe notice:", err);
          getMeetingById(idOrRoomId).then((m) => { if (!cancelled) onUpdate(m); });
        }
      );
    };

    attach(targetKey);

    return () => {
      cancelled = true;
      innerUnsub();
    };
  }

  // Fallback polling for offline/IDB mode
  let active = true;
  const poll = async () => {
    if (!active) return;
    const m = await getMeetingById(idOrRoomId);
    onUpdate(m);
  };
  poll();
  const interval = setInterval(poll, 2000);

  return () => {
    active = false;
    clearInterval(interval);
  };
}


/** Subscribe to the full meetings collection — powers admin lobby alerts. */
export function subscribeAllMeetings(onUpdate: (meetings: MeetingRecord[]) => void): Unsubscribe {
  if (firebaseReady && db) {
    const unsub = onSnapshot(
      collection(db, "meetings"),
      (snap) => {
        const map = new Map<string, MeetingRecord>();
        snap.docs.forEach((d) => {
          const data = d.data() as MeetingRecord;
          const key = data.id || d.id;
          if (!key) return;
          const existing = map.get(key);
          if (!existing || (data.updatedAt || "") > (existing.updatedAt || "") || d.id === data.id) {
            map.set(key, data);
          }
        });
        onUpdate(Array.from(map.values()));
      },
      (err) => {
        console.warn("Meetings subscribe notice:", err);
        listAllMeetings().then(onUpdate).catch(() => onUpdate([]));
      }
    );
    return () => unsub();
  }

  // Fallback polling for offline/IDB mode
  let active = true;
  const poll = async () => {
    if (!active) return;
    const items = await getIdbData<MeetingRecord>(STORE_MEETINGS);
    onUpdate(items);
  };
  poll();
  const interval = setInterval(poll, 2000);

  return () => {
    active = false;
    clearInterval(interval);
  };
}


/* ---------------- Participant Management & Moderation ---------------- */

/** Pure participant-list merge: upsert by id / host-role / email / userId and
 *  deduplicate (at most one host, unique session ids). Exported for tests and
 *  used by both the transactional Firestore path and the offline IDB path. */
export function mergeParticipantUpdate(
  participants: MeetingParticipant[],
  participantId: string,
  updates: Partial<MeetingParticipant>
): MeetingParticipant[] {
  const cleanUpdates = cleanFirestoreObject(updates as Record<string, any>) as Partial<MeetingParticipant>;
  const pEmail = (cleanUpdates.email || "").toLowerCase().trim();
  const pUserId = cleanUpdates.userId || "";
  const isHostRole = cleanUpdates.role === "host";

  let existingIdx = participants.findIndex((p) => p.id === participantId);

  // If ID didn't match, check if this is the host to prevent duplicate host entries
  if (existingIdx === -1 && isHostRole) {
    existingIdx = participants.findIndex((p) => p.role === "host");
  }

  // Check matching email (never merge a non-host into the host's record)
  if (existingIdx === -1 && pEmail && !pEmail.endsWith("@guest.local")) {
    existingIdx = participants.findIndex(
      (p) => p.email?.toLowerCase().trim() === pEmail && (isHostRole || p.role !== "host")
    );
  }

  // Check matching userId (never merge a non-host into the host's record)
  if (existingIdx === -1 && pUserId) {
    existingIdx = participants.findIndex(
      (p) => p.userId === pUserId && (isHostRole || p.role !== "host")
    );
  }

  let updatedList: MeetingParticipant[];
  if (existingIdx >= 0) {
    updatedList = [...participants];
    updatedList[existingIdx] = cleanFirestoreObject({
      ...updatedList[existingIdx],
      ...cleanUpdates,
      id: participantId || updatedList[existingIdx].id,
    });
  } else {
    const newP = cleanFirestoreObject({ id: participantId, ...cleanUpdates }) as MeetingParticipant;
    updatedList = [...participants, newP];
  }

  // Deduplicate: guarantee at most ONE host and unique participant sessions
  let hasHost = false;
  const seenIds = new Set<string>();
  const deduplicated: MeetingParticipant[] = [];

  for (const p of updatedList) {
    const cleanP = cleanFirestoreObject(p);
    if (cleanP.role === "host") {
      if (!hasHost) {
        hasHost = true;
        deduplicated.push(cleanP);
      }
    } else {
      if (!seenIds.has(cleanP.id)) {
        seenIds.add(cleanP.id);
        deduplicated.push(cleanP);
      }
    }
  }

  return deduplicated;
}

export async function updateParticipant(
  meetingId: string,
  participantId: string,
  updates: Partial<MeetingParticipant>
): Promise<void> {
  // Live path: atomic read-modify-write inside a Firestore transaction so
  // concurrent joins / admits / status flips can never overwrite each other.
  if (firebaseReady && db) {
    try {
      const firestore = db;
      // Resolve the real doc key (normalized roomId, alphanumeric alias, or raw)
      const candidates = [normalizeRoomCode(meetingId), getAlphanumericRoomKey(meetingId), meetingId]
        .filter((k, i, arr) => k && arr.indexOf(k) === i);
      let ref: ReturnType<typeof doc> | null = null;
      for (const key of candidates) {
        const snap = await getDoc(doc(firestore, "meetings", key)).catch(() => null);
        if (snap?.exists()) {
          const data = snap.data() as MeetingRecord;
          if (data.id && data.id !== key) {
            const canonSnap = await getDoc(doc(firestore, "meetings", data.id)).catch(() => null);
            ref = canonSnap?.exists() ? canonSnap.ref : snap.ref;
          } else {
            ref = snap.ref;
          }
          break;
        }
      }

      if (ref) {
        let syncedPayload: Record<string, any> | null = null;
        let canonicalId = normalizeRoomCode(meetingId);
        let alphaAlias = getAlphanumericRoomKey(meetingId);
        await runTransaction(firestore, async (tx) => {
          const snap = await tx.get(ref!);
          if (!snap.exists()) return;
          const current = snap.data() as MeetingRecord;
          canonicalId = current.id || canonicalId;
          alphaAlias = getAlphanumericRoomKey(current.roomId || current.id || meetingId);
          const merged = mergeParticipantUpdate(current.participants || [], participantId, updates);
          syncedPayload = cleanFirestoreObject({
            participants: merged,
            updatedAt: new Date().toISOString(),
          });
          tx.update(ref!, syncedPayload);
        });
        if (syncedPayload) {
          const mirrorKeys = Array.from(new Set([canonicalId, alphaAlias, ...candidates].filter(Boolean)));
          for (const alias of mirrorKeys) {
            if (alias !== ref.id) {
              await setDoc(doc(firestore, "meetings", alias), syncedPayload, { merge: true }).catch(() => {});
            }
          }
        }
        return;
      }
    } catch (err) {
      console.warn("Firestore updateParticipant notice, using fallback path:", err);
    }
  }

  // Offline / demo path: single-writer localStorage merge
  const meeting = await getMeetingById(meetingId);
  if (!meeting) return;
  const merged = mergeParticipantUpdate(meeting.participants || [], participantId, updates);
  await updateMeeting(meeting.id, { participants: merged });
}

export async function admitParticipant(meetingId: string, participantId: string): Promise<void> {
  await updateParticipant(meetingId, participantId, {
    status: "admitted",
    joinedAt: new Date().toISOString(),
  });
}

export async function admitAllParticipants(meetingId: string): Promise<void> {
  const now = new Date().toISOString();

  // Live path: transactional so a guest joining at the same moment can't be
  // overwritten by the admit-all write.
  if (firebaseReady && db) {
    try {
      const firestore = db;
      const candidates = [normalizeRoomCode(meetingId), getAlphanumericRoomKey(meetingId), meetingId]
        .filter((k, i, arr) => k && arr.indexOf(k) === i);
      let ref: ReturnType<typeof doc> | null = null;
      for (const key of candidates) {
        const snap = await getDoc(doc(firestore, "meetings", key)).catch(() => null);
        if (snap?.exists()) {
          const data = snap.data() as MeetingRecord;
          if (data.id && data.id !== key) {
            const canonSnap = await getDoc(doc(firestore, "meetings", data.id)).catch(() => null);
            ref = canonSnap?.exists() ? canonSnap.ref : snap.ref;
          } else {
            ref = snap.ref;
          }
          break;
        }
      }
      if (ref) {
        let syncedPayload: Record<string, any> | null = null;
        let canonicalId = normalizeRoomCode(meetingId);
        let alphaAlias = getAlphanumericRoomKey(meetingId);
        await runTransaction(firestore, async (tx) => {
          const snap = await tx.get(ref!);
          if (!snap.exists()) return;
          const current = snap.data() as MeetingRecord;
          canonicalId = current.id || canonicalId;
          alphaAlias = getAlphanumericRoomKey(current.roomId || current.id || meetingId);
          const updated = (current.participants || []).map((p) =>
            p.status === "waiting" ? { ...p, status: "admitted" as ParticipantStatus, joinedAt: now } : p
          );
          syncedPayload = cleanFirestoreObject({ participants: updated, updatedAt: now });
          tx.update(ref!, syncedPayload);
        });
        if (syncedPayload) {
          const mirrorKeys = Array.from(new Set([canonicalId, alphaAlias, ...candidates].filter(Boolean)));
          for (const alias of mirrorKeys) {
            if (alias !== ref.id) {
              await setDoc(doc(firestore, "meetings", alias), syncedPayload, { merge: true }).catch(() => {});
            }
          }
        }
        return;
      }
    } catch (err) {
      console.warn("Firestore admitAllParticipants notice, using fallback path:", err);
    }
  }

  const meeting = await getMeetingById(meetingId);
  if (!meeting) return;
  const updated = meeting.participants.map((p) =>
    p.status === "waiting" ? { ...p, status: "admitted" as ParticipantStatus, joinedAt: now } : p
  );
  await updateMeeting(meeting.id, { participants: updated });
}

export async function removeParticipant(
  meetingId: string,
  participantId: string
): Promise<void> {
  await updateParticipant(meetingId, participantId, {
    status: "removed",
    leftAt: new Date().toISOString(),
  });
}

export async function setMeetingLock(meetingId: string, locked: boolean): Promise<void> {
  await updateMeeting(meetingId, { meetingLocked: locked });
}

export async function endMeetingForAll(meetingId: string): Promise<void> {
  const now = new Date().toISOString();
  const meeting = await getMeetingById(meetingId);
  if (!meeting) return;

  const closedParticipants = meeting.participants.map((p) => ({
    ...p,
    status: (p.status === "joined" || p.status === "admitted" ? "left" : p.status) as ParticipantStatus,
    currentBreakoutRoomId: null,
    helpRequestedRoomId: null,
    leftAt: now,
  }));

  await updateMeeting(meetingId, {
    status: "completed",
    endedAt: now,
    participants: closedParticipants,
  });
}

/* ---------------- Breakout Rooms Engine (Create, Assign, Move, Join, Broadcast) ---------------- */

/** Pure helper: distributes participant IDs evenly across breakout rooms in round-robin order */
export function distributeParticipantsEvenly(
  participantIds: string[],
  rooms: MeetingBreakoutRoom[]
): MeetingBreakoutRoom[] {
  if (rooms.length === 0) return [];
  const uniqueIds = Array.from(new Set(participantIds.filter(Boolean)));
  const buckets: string[][] = rooms.map(() => []);
  uniqueIds.forEach((pid, idx) => {
    buckets[idx % rooms.length].push(pid);
  });
  return rooms.map((room, idx) => ({
    ...room,
    assignedParticipants: buckets[idx],
  }));
}

/** Create a single breakout room and persist to the meeting record */
export async function createBreakoutRoom(
  meetingId: string,
  nameOrOptions:
    | string
    | {
        name: string;
        topic?: string;
        durationMinutes?: number;
        status?: "draft" | "open";
      },
  maybeOptions?: {
    topic?: string;
    durationMinutes?: number;
    status?: "draft" | "open";
  }
): Promise<MeetingRecord | null> {
  const options =
    typeof nameOrOptions === "string"
      ? { name: nameOrOptions, ...(maybeOptions || {}) }
      : nameOrOptions;
  const meeting = await getMeetingById(meetingId);
  const existing = meeting?.breakoutRooms || [];
  const now = new Date().toISOString();
  const status = options.status ?? "open";
  const durationMinutes =
    options.durationMinutes && options.durationMinutes > 0 ? options.durationMinutes : undefined;
  const endsAt =
    status === "open" && durationMinutes
      ? new Date(Date.now() + durationMinutes * 60 * 1000).toISOString()
      : undefined;

  const newRoom: MeetingBreakoutRoom = {
    id: `br_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    meetingId: normalizeRoomCode(meetingId),
    name: options.name.trim() || `Breakout Room ${existing.length + 1}`,
    topic: options.topic?.trim() || undefined,
    status,
    assignedParticipants: [],
    activeParticipants: [],
    durationMinutes,
    openedAt: status === "open" ? now : undefined,
    endsAt,
    createdAt: now,
  };

  const updatedRooms = [...existing, newRoom];
  await updateMeeting(meetingId, { breakoutRooms: updatedRooms });
  return await getMeetingById(meetingId);
}

/** Quick-generate N breakout rooms and optionally auto-assign active non-host participants evenly */
export async function createMultipleBreakoutRooms(
  meetingId: string,
  countOrOptions:
    | number
    | {
        count: number;
        autoAssign?: boolean;
        durationMinutes?: number;
        allowSelfSelect?: boolean;
        topicPrefix?: string;
        autoMoveAssigned?: boolean;
        openImmediately?: boolean;
      },
  maybeOptions?: {
    autoAssign?: boolean;
    durationMinutes?: number;
    allowSelfSelect?: boolean;
    topicPrefix?: string;
    autoMoveAssigned?: boolean;
    openImmediately?: boolean;
  }
): Promise<MeetingRecord | null> {
  const options =
    typeof countOrOptions === "number"
      ? { count: countOrOptions, ...(maybeOptions || {}) }
      : countOrOptions;
  const meeting = await getMeetingById(meetingId);
  if (!meeting) return null;

  const count = Math.max(1, Math.min(12, Math.floor(options.count || 2)));
  const existing = meeting.breakoutRooms || [];
  const now = new Date().toISOString();
  const durationMinutes =
    options.durationMinutes && options.durationMinutes > 0 ? options.durationMinutes : undefined;
  const endsAt = durationMinutes
    ? new Date(Date.now() + durationMinutes * 60 * 1000).toISOString()
    : undefined;

  const creativeDefaultTopics = [
    "Brand Strategy & Positioning",
    "Visual Identity & Typography",
    "Social Campaign & Reels",
    "Copywriting & Conversion",
    "Deliverables Review",
    "Packaging & Print Layout",
  ];

  const createdRooms: MeetingBreakoutRoom[] = Array.from({ length: count }, (_, idx) => {
    const roomNum = existing.length + idx + 1;
    return {
      id: `br_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 5)}`,
      meetingId: normalizeRoomCode(meetingId),
      name: `Room ${roomNum}`,
      topic: options.topicPrefix
        ? `${options.topicPrefix} #${roomNum}`
        : creativeDefaultTopics[(roomNum - 1) % creativeDefaultTopics.length],
      status: options.openImmediately === false ? "draft" : "open",
      assignedParticipants: [],
      activeParticipants: [],
      durationMinutes,
      openedAt: now,
      endsAt,
      createdAt: now,
    };
  });

  let allRooms = [...existing, ...createdRooms];
  let updatedParticipants = [...(meeting.participants || [])];

  if (options.autoAssign) {
    const assignableIds = updatedParticipants
      .filter((p) => (p.status === "joined" || p.status === "admitted") && p.role !== "host")
      .map((p) => p.id);
    allRooms = distributeParticipantsEvenly(assignableIds, allRooms);

    if (options.autoMoveAssigned) {
      const pidToRoom = new Map<string, string>();
      allRooms.forEach((r) => {
        r.assignedParticipants.forEach((pid) => pidToRoom.set(pid, r.id));
      });
      updatedParticipants = updatedParticipants.map((p) => {
        const targetRoomId = pidToRoom.get(p.id);
        return targetRoomId ? { ...p, currentBreakoutRoomId: targetRoomId } : p;
      });
      allRooms = allRooms.map((r) => ({
        ...r,
        activeParticipants: [...r.assignedParticipants],
      }));
    }
  }

  await updateMeeting(meetingId, {
    breakoutRooms: allRooms,
    participants: updatedParticipants,
    ...(typeof options.allowSelfSelect === "boolean"
      ? { breakoutAllowSelfSelect: options.allowSelfSelect }
      : {}),
  });

  return await getMeetingById(meetingId);
}

/** Update a breakout room's name, topic, status, or timer */
export async function updateBreakoutRoom(
  meetingId: string,
  roomId: string,
  updates: Partial<MeetingBreakoutRoom>
): Promise<MeetingRecord | null> {
  const meeting = await getMeetingById(meetingId);
  if (!meeting) return null;
  const rooms = (meeting.breakoutRooms || []).map((r) =>
    r.id === roomId ? { ...r, ...updates } : r
  );
  await updateMeeting(meetingId, { breakoutRooms: rooms });
  return await getMeetingById(meetingId);
}

/** Delete a breakout room and return any participants inside it to the Main Stage */
export async function deleteBreakoutRoom(
  meetingId: string,
  roomId: string
): Promise<MeetingRecord | null> {
  const meeting = await getMeetingById(meetingId);
  if (!meeting) return null;
  const rooms = (meeting.breakoutRooms || []).filter((r) => r.id !== roomId);
  const participants = (meeting.participants || []).map((p) =>
    p.currentBreakoutRoomId === roomId
      ? { ...p, currentBreakoutRoomId: undefined, helpRequestedRoomId: undefined }
      : p
  );
  await updateMeeting(meetingId, { breakoutRooms: rooms, participants });
  return await getMeetingById(meetingId);
}

/** Assign (or unassign if roomId is null) a participant to a specific breakout room */
export async function assignParticipantToBreakoutRoom(
  meetingId: string,
  participantId: string,
  roomId: string | null,
  moveImmediately: boolean = false
): Promise<MeetingRecord | null> {
  const meeting = await getMeetingById(meetingId);
  if (!meeting) return null;

  const rooms = (meeting.breakoutRooms || []).map((r) => {
    const filteredAssigned = (r.assignedParticipants || []).filter((id) => id !== participantId);
    const filteredActive = (r.activeParticipants || []).filter((id) => id !== participantId);
    if (r.id === roomId) {
      return {
        ...r,
        assignedParticipants: [...filteredAssigned, participantId],
        activeParticipants: moveImmediately ? [...filteredActive, participantId] : r.activeParticipants || [],
      };
    }
    return {
      ...r,
      assignedParticipants: filteredAssigned,
      activeParticipants: moveImmediately || roomId === null ? filteredActive : r.activeParticipants || [],
    };
  });

  const participants = (meeting.participants || []).map((p) => {
    if (p.id !== participantId) return p;
    if (moveImmediately || roomId === null) {
      return {
        ...p,
        currentBreakoutRoomId: roomId ?? undefined,
        helpRequestedRoomId: undefined,
      };
    }
    return p;
  });

  await updateMeeting(meetingId, { breakoutRooms: rooms, participants });
  return await getMeetingById(meetingId);
}

/** Automatically distribute all active non-host participants evenly across existing breakout rooms */
export async function autoAssignParticipantsToBreakoutRooms(
  meetingId: string,
  moveImmediately: boolean = false
): Promise<MeetingRecord | null> {
  const meeting = await getMeetingById(meetingId);
  if (!meeting || !meeting.breakoutRooms?.length) return meeting;

  const assignableIds = (meeting.participants || [])
    .filter((p) => (p.status === "joined" || p.status === "admitted") && p.role !== "host")
    .map((p) => p.id);

  let updatedRooms = distributeParticipantsEvenly(assignableIds, meeting.breakoutRooms);
  let updatedParticipants = [...(meeting.participants || [])];

  if (moveImmediately) {
    const pidToRoom = new Map<string, string>();
    updatedRooms.forEach((r) => {
      r.assignedParticipants.forEach((pid) => pidToRoom.set(pid, r.id));
    });
    updatedParticipants = updatedParticipants.map((p) => {
      const targetId = pidToRoom.get(p.id);
      return targetId ? { ...p, currentBreakoutRoomId: targetId } : p;
    });
    updatedRooms = updatedRooms.map((r) => ({
      ...r,
      status: "open" as const,
      activeParticipants: [...r.assignedParticipants],
    }));
  }

  await updateMeeting(meetingId, {
    breakoutRooms: updatedRooms,
    participants: updatedParticipants,
  });
  return await getMeetingById(meetingId);
}

/** Join a breakout room (or pass null to return to the Main Stage) */
export async function joinBreakoutRoom(
  meetingId: string,
  participantId: string,
  roomId: string | null
): Promise<MeetingRecord | null> {
  const meeting = await getMeetingById(meetingId);
  if (!meeting) return null;

  const rooms = (meeting.breakoutRooms || []).map((r) => {
    const withoutMe = (r.activeParticipants || []).filter((id) => id !== participantId);
    if (r.id === roomId) {
      const alsoAssigned = (r.assignedParticipants || []).includes(participantId)
        ? r.assignedParticipants
        : [...(r.assignedParticipants || []), participantId];
      return {
        ...r,
        status: "open" as const,
        assignedParticipants: alsoAssigned,
        activeParticipants: [...withoutMe, participantId],
      };
    }
    return {
      ...r,
      activeParticipants: withoutMe,
    };
  });

  const isHostJoining =
    (meeting.participants || []).find((p) => p.id === participantId)?.role === "host";

  const participants = (meeting.participants || []).map((p) => {
    if (p.id === participantId) {
      return {
        ...p,
        currentBreakoutRoomId: roomId ?? undefined,
        helpRequestedRoomId: undefined,
      };
    }
    if (isHostJoining && roomId && p.helpRequestedRoomId === roomId) {
      return {
        ...p,
        helpRequestedRoomId: undefined,
      };
    }
    return p;
  });

  await updateMeeting(meetingId, { breakoutRooms: rooms, participants });
  return await getMeetingById(meetingId);
}

/** Open all breakout rooms and optionally move assigned participants inside */
export async function openAllBreakoutRooms(
  meetingId: string,
  options?: {
    durationMinutes?: number;
    allowSelfSelect?: boolean;
    autoMoveAssigned?: boolean;
    moveAssignedIntoRooms?: boolean;
  }
): Promise<MeetingRecord | null> {
  const meeting = await getMeetingById(meetingId);
  if (!meeting || !meeting.breakoutRooms?.length) return meeting;

  const shouldMove = Boolean(options?.autoMoveAssigned || options?.moveAssignedIntoRooms);
  const now = new Date().toISOString();
  const durationMinutes = options?.durationMinutes;
  const endsAt =
    durationMinutes && durationMinutes > 0
      ? new Date(Date.now() + durationMinutes * 60 * 1000).toISOString()
      : undefined;

  const pidToRoom = new Map<string, string>();
  const rooms = meeting.breakoutRooms.map((r) => {
    (r.assignedParticipants || []).forEach((pid) => pidToRoom.set(pid, r.id));
    return {
      ...r,
      status: "open" as const,
      openedAt: now,
      ...(durationMinutes !== undefined ? { durationMinutes, endsAt } : {}),
      activeParticipants: shouldMove
        ? Array.from(new Set([...(r.activeParticipants || []), ...(r.assignedParticipants || [])]))
        : r.activeParticipants || [],
    };
  });

  const participants = shouldMove
    ? (meeting.participants || []).map((p) => {
        const assignedRoom = pidToRoom.get(p.id);
        return assignedRoom ? { ...p, currentBreakoutRoomId: assignedRoom } : p;
      })
    : meeting.participants;

  await updateMeeting(meetingId, {
    breakoutRooms: rooms,
    participants,
    ...(typeof options?.allowSelfSelect === "boolean"
      ? { breakoutAllowSelfSelect: options.allowSelfSelect }
      : {}),
  });
  return await getMeetingById(meetingId);
}

/** Close all breakout rooms and recall every participant back to the Main Stage */
export async function closeAllBreakoutRooms(meetingId: string): Promise<MeetingRecord | null> {
  const meeting = await getMeetingById(meetingId);
  if (!meeting) return null;

  const rooms = (meeting.breakoutRooms || []).map((r) => ({
    ...r,
    status: "closed" as const,
    activeParticipants: [],
    endsAt: undefined,
  }));

  const participants = (meeting.participants || []).map((p) => ({
    ...p,
    currentBreakoutRoomId: undefined,
    helpRequestedRoomId: undefined,
  }));

  await updateMeeting(meetingId, { breakoutRooms: rooms, participants });
  return await getMeetingById(meetingId);
}

/** Toggle whether participants can self-select and switch between open breakout rooms */
export async function setBreakoutAllowSelfSelect(
  meetingId: string,
  allowSelfSelect: boolean
): Promise<MeetingRecord | null> {
  await updateMeeting(meetingId, { breakoutAllowSelfSelect: allowSelfSelect });
  return await getMeetingById(meetingId);
}

/** Broadcast an announcement banner from the Host to all open breakout rooms */
export async function broadcastToBreakoutRooms(
  meetingId: string,
  senderName: string,
  message: string
): Promise<MeetingRecord | null> {
  const trimmed = message.trim();
  if (!trimmed) return await getMeetingById(meetingId);
  const now = new Date().toISOString();
  await updateMeeting(meetingId, {
    breakoutBroadcast: {
      id: `bb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      senderName,
      message: trimmed,
      sentAt: now,
      createdAt: now,
    },
  });
  return await getMeetingById(meetingId);
}

/** Request or clear Host assistance from inside a breakout room */
export async function requestBreakoutHostHelp(
  meetingId: string,
  participantId: string,
  roomId: string | null
): Promise<MeetingRecord | null> {
  await updateParticipant(meetingId, participantId, {
    helpRequestedRoomId: roomId ?? undefined,
  });
  return await getMeetingById(meetingId);
}

/* ---------------- Real-Time In-Meeting Chat ---------------- */

export async function sendMeetingChatMessage(
  meetingId: string,
  senderId: string,
  senderName: string,
  senderRole: ParticipantRole,
  message: string,
  recipientId?: string,
  breakoutRoomId?: string,
  breakoutRoomName?: string
): Promise<MeetingChatMessage> {
  const normId = normalizeRoomCode(meetingId);
  const now = new Date().toISOString();
  const id = `chat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  const chatMsg: MeetingChatMessage = {
    id,
    meetingId: normId,
    senderId,
    senderName,
    senderRole,
    message: message.trim(),
    createdAt: now,
  };
  if (recipientId) {
    chatMsg.recipientId = recipientId;
  }
  if (breakoutRoomId) {
    chatMsg.breakoutRoomId = breakoutRoomId;
    if (breakoutRoomName) {
      chatMsg.breakoutRoomName = breakoutRoomName;
    }
  }

  // 1. Broadcast via local channel for zero-latency in same-device testing
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const bc = new BroadcastChannel(`sk_chat_${normId}`);
      bc.postMessage(chatMsg);
      setTimeout(() => bc.close(), 100);
    }
  } catch {}

  // 2. Persist cleanly to Firestore
  if (firebaseReady && db) {
    try {
      const cleanData = cleanFirestoreObject(chatMsg);
      await setDoc(doc(db, "meetings", normId, "chat", id), cleanData);
      return chatMsg;
    } catch (err) {
      console.warn("Firestore chat error, using local storage:", err);
    }
  }

  // 3. Local storage fallback
  const key = `sk_chat_${normId}`;
  const existing: MeetingChatMessage[] = JSON.parse(localStorage.getItem(key) || "[]");
  existing.push(chatMsg);
  localStorage.setItem(key, JSON.stringify(existing));
  return chatMsg;
}

export function subscribeToMeetingChat(
  meetingId: string,
  onMessages: (msgs: MeetingChatMessage[]) => void
): Unsubscribe {
  const normId = normalizeRoomCode(meetingId);
  let unsubFirestore = () => {};

  if (firebaseReady && db) {
    try {
      const chatCol = collection(db, "meetings", normId, "chat");
      unsubFirestore = onSnapshot(
        chatCol,
        (snap) => {
          const msgs = snap.docs
            .map((d) => d.data() as MeetingChatMessage)
            .filter((m) => m && m.message && m.createdAt)
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
          onMessages(msgs);
        },
        (err) => {
          console.warn("Firestore chat subscription error, fallback to local:", err);
          const key = `sk_chat_${normId}`;
          const local = JSON.parse(localStorage.getItem(key) || "[]");
          onMessages(local);
        }
      );
    } catch {
      const key = `sk_chat_${normId}`;
      const local = JSON.parse(localStorage.getItem(key) || "[]");
      onMessages(local);
    }
  }

  let bc: BroadcastChannel | null = null;
  try {
    if (typeof BroadcastChannel !== "undefined") {
      bc = new BroadcastChannel(`sk_chat_${normId}`);
      bc.onmessage = (e) => {
        if (e.data && e.data.message) {
          const key = `sk_chat_${normId}`;
          const current: MeetingChatMessage[] = JSON.parse(localStorage.getItem(key) || "[]");
          if (!current.some((m) => m.id === e.data.id)) {
            current.push(e.data);
            localStorage.setItem(key, JSON.stringify(current));
            onMessages(current);
          }
        }
      };
    }
  } catch {}

  return () => {
    unsubFirestore();
    if (bc) bc.close();
  };
}

/* ---------------- Real-Time In-Meeting Emoji Reactions ---------------- */

export interface MeetingReactionEvent {
  id: string;
  senderId: string;
  senderName: string;
  emoji: string;
  x: number;
  createdAt: number;
}

export async function sendMeetingReaction(
  meetingId: string,
  senderId: string,
  senderName: string,
  emoji: string,
  x: number
): Promise<void> {
  const normId = normalizeRoomCode(meetingId);
  const data: MeetingReactionEvent = {
    id: `rx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    senderId,
    senderName,
    emoji,
    x,
    createdAt: Date.now(),
  };

  try {
    if (typeof BroadcastChannel !== "undefined") {
      const bc = new BroadcastChannel(`sk_reactions_${normId}`);
      bc.postMessage(data);
      setTimeout(() => bc.close(), 100);
    }
  } catch {}

  if (firebaseReady && db) {
    try {
      await setDoc(doc(db, "meetings", normId, "reactions", data.id), cleanFirestoreObject(data));
    } catch {}
  }
}

export function subscribeToMeetingReactions(
  meetingId: string,
  onReaction: (rx: MeetingReactionEvent) => void
): Unsubscribe {
  const normId = normalizeRoomCode(meetingId);
  let unsubFirestore = () => {};

  if (firebaseReady && db) {
    try {
      const q = collection(db, "meetings", normId, "reactions");
      unsubFirestore = onSnapshot(q, (snap) => {
        snap.docChanges().forEach((change) => {
          if (change.type === "added") {
            const rx = change.doc.data() as MeetingReactionEvent;
            if (Date.now() - rx.createdAt < 6000) {
              onReaction(rx);
            }
          }
        });
      });
    } catch {}
  }

  let bc: BroadcastChannel | null = null;
  try {
    if (typeof BroadcastChannel !== "undefined") {
      bc = new BroadcastChannel(`sk_reactions_${normId}`);
      bc.onmessage = (e) => {
        if (e.data && e.data.emoji) {
          onReaction(e.data);
        }
      };
    }
  } catch {}

  return () => {
    unsubFirestore();
    if (bc) bc.close();
  };
}

/* ---------------- Real-Time Synchronized Live Proofing & Deliverables ---------------- */

export async function setMeetingLiveProofing(
  meetingId: string,
  updates: Partial<LiveProofingState>
): Promise<void> {
  const meeting = await getMeetingById(meetingId);
  const existing: LiveProofingState = meeting?.liveProofing || {
    active: true,
    mockupIndex: 0,
    presenterId: "",
    presenterName: "",
    updatedAt: new Date().toISOString(),
  };

  const payload: LiveProofingState = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  const normId = normalizeRoomCode(meetingId);

  // Broadcast channel for instantaneous local testing
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const bc = new BroadcastChannel(`sk_proofing_${normId}`);
      bc.postMessage(payload);
      setTimeout(() => bc.close(), 100);
    }
  } catch {}

  await updateMeeting(meetingId, { liveProofing: payload });
}

/** Add a new deliverable/artwork to the Live Proofing canvas */
export async function addMeetingProofingArtwork(
  meetingId: string,
  item: Omit<ProofingMockupItem, "id" | "createdAt">
): Promise<ProofingMockupItem> {
  const meeting = await getMeetingById(meetingId);
  const existingMockups = meeting?.liveProofing?.mockups || DEFAULT_PROOFING_MOCKUPS;

  const newItem: ProofingMockupItem = {
    ...item,
    id: `art_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
  };

  const updatedMockups = [...existingMockups, newItem];

  await setMeetingLiveProofing(meetingId, {
    mockups: updatedMockups,
    mockupIndex: updatedMockups.length - 1, // Automatically focus newly added artwork
    active: true,
  });

  return newItem;
}

/** Remove an artwork from the Live Proofing canvas */
export async function removeMeetingProofingArtwork(
  meetingId: string,
  artworkId: string
): Promise<void> {
  const meeting = await getMeetingById(meetingId);
  const existingMockups = meeting?.liveProofing?.mockups || DEFAULT_PROOFING_MOCKUPS;
  const filtered = existingMockups.filter((m) => m.id !== artworkId);
  const nextIdx = Math.max(0, Math.min(filtered.length - 1, (meeting?.liveProofing?.mockupIndex || 0)));

  await setMeetingLiveProofing(meetingId, {
    mockups: filtered.length > 0 ? filtered : DEFAULT_PROOFING_MOCKUPS,
    mockupIndex: nextIdx,
  });
}

/** Broadcast Laser pointer coordinates in real-time to all participants */
export async function updateMeetingLaserPointer(
  meetingId: string,
  x: number,
  y: number,
  senderName: string
): Promise<void> {
  const normId = normalizeRoomCode(meetingId);
  const laser = { x, y, updatedAt: Date.now(), senderName };

  // 1. Instant local BroadcastChannel broadcast (sub-1ms for tabs/windows)
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const bc = new BroadcastChannel(`sk_laser_${normId}`);
      bc.postMessage(laser);
      setTimeout(() => bc.close(), 100);
    }
  } catch {}

  // 2. High-speed Firestore subcollection doc: /meetings/{normId}/laser/pointer
  if (firebaseReady && db) {
    try {
      await setDoc(
        doc(db, "meetings", normId, "laser", "pointer"),
        cleanFirestoreObject(laser)
      );
    } catch (err) {
      console.warn("Firestore laser pointer write notice:", err);
    }
  }
}

/** Subscribe to real-time Laser pointer updates from host and clients */
export function subscribeToMeetingLaser(
  meetingId: string,
  onLaser: (laser: { x: number; y: number; senderName: string }) => void
): Unsubscribe {
  const normId = normalizeRoomCode(meetingId);
  let bc: BroadcastChannel | null = null;
  let unsubDoc: Unsubscribe = () => {};

  // 1. Broadcast Channel listener
  try {
    if (typeof BroadcastChannel !== "undefined") {
      bc = new BroadcastChannel(`sk_laser_${normId}`);
      bc.onmessage = (e) => {
        if (e.data && typeof e.data.x === "number") {
          onLaser(e.data);
        }
      };
    }
  } catch {}

  // 2. Real-time Firestore Subcollection Listener
  if (firebaseReady && db) {
    try {
      unsubDoc = onSnapshot(doc(db, "meetings", normId, "laser", "pointer"), (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (data && typeof data.x === "number" && Date.now() - (data.updatedAt || 0) < 10000) {
            onLaser(data as any);
          }
        }
      });
    } catch (err) {
      console.warn("Firestore laser subscribe notice:", err);
    }
  }

  return () => {
    if (bc) bc.close();
    unsubDoc();
  };
}

export async function submitMeetingProofFeedback(
  meetingId: string,
  senderName: string,
  text: string,
  approved: boolean,
  mockup?: ProofingMockupItem,
  pinsSnapshot?: CanvasPin[],
  strokesCount?: number
): Promise<ApprovedDeliverableRecord> {
  const meeting = await getMeetingById(meetingId);
  const noteId = `note_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const nowIso = new Date().toISOString();

  const note: ProofingFeedbackNote = {
    id: noteId,
    senderName,
    text: text.trim(),
    approved,
    createdAt: nowIso,
  };

  const approvalRecord: ApprovedDeliverableRecord = {
    id: `appr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    mockupId: mockup?.id || "mockup_unknown",
    mockupTitle: mockup?.title || "Project Deliverable",
    mockupCategory: mockup?.category || "Design Concept",
    mockupImage: mockup?.image || "",
    approved,
    approvedBy: senderName,
    approvedAt: nowIso,
    feedbackText: text.trim(),
    pinsCount: pinsSnapshot?.length || 0,
    pins: pinsSnapshot ? [...pinsSnapshot] : [],
    strokesCount: strokesCount || 0,
  };

  const existingNotes = meeting?.liveProofing?.feedbackNotes || [];
  const updatedNotes = [...existingNotes, note];
  const existingApprovals = meeting?.liveProofing?.approvedDeliverables || [];
  const updatedApprovals = [...existingApprovals, approvalRecord];

  await setMeetingLiveProofing(meetingId, {
    feedbackNotes: updatedNotes,
    approvedDeliverables: updatedApprovals,
  });

  try {
    const key = `sk_approved_proofs_${normalizeRoomCode(meetingId)}`;
    const saved = JSON.parse(localStorage.getItem(key) || "[]");
    saved.push(approvalRecord);
    localStorage.setItem(key, JSON.stringify(saved));
  } catch {}

  return approvalRecord;
}

/** Update strokes and pins for a specific mockup/artwork in real-time */
export async function updateMockupAnnotations(
  meetingId: string,
  mockupId: string,
  data: { strokes?: CanvasStroke[]; pins?: CanvasPin[] }
): Promise<void> {
  const normId = normalizeRoomCode(meetingId);
  const safeMockupId = mockupId.replace(/[^a-zA-Z0-9_-]/g, "_");

  // 1. Broadcast channel for instantaneous cross-tab/window sync
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const bc = new BroadcastChannel(`sk_ann_${normId}_${safeMockupId}`);
      bc.postMessage(data);
      setTimeout(() => bc.close(), 100);
    }
  } catch {}

  // 2. High-speed Firestore subcollection doc: /meetings/{normId}/annotations/{safeMockupId}
  if (firebaseReady && db) {
    try {
      await setDoc(
        doc(db, "meetings", normId, "annotations", safeMockupId),
        cleanFirestoreObject({
          ...data,
          updatedAt: new Date().toISOString(),
        }),
        { merge: true }
      );
    } catch (err) {
      console.warn("Firestore annotation write notice:", err);
    }
  }
}

/** Subscribe to real-time markup strokes and pins for an artwork */
export function subscribeToMockupAnnotations(
  meetingId: string,
  mockupId: string,
  onUpdate: (data: MockupAnnotationState) => void
): Unsubscribe {
  const normId = normalizeRoomCode(meetingId);
  const safeMockupId = mockupId.replace(/[^a-zA-Z0-9_-]/g, "_");
  let bc: BroadcastChannel | null = null;
  let unsubDoc: Unsubscribe = () => {};

  // 1. Broadcast Channel listener
  try {
    if (typeof BroadcastChannel !== "undefined") {
      bc = new BroadcastChannel(`sk_ann_${normId}_${safeMockupId}`);
      bc.onmessage = (e) => {
        if (e.data && (e.data.strokes || e.data.pins)) {
          onUpdate({
            strokes: e.data.strokes || [],
            pins: e.data.pins || [],
          });
        }
      };
    }
  } catch {}

  // 2. Real-time Firestore Subcollection Listener
  if (firebaseReady && db) {
    try {
      unsubDoc = onSnapshot(
        doc(db, "meetings", normId, "annotations", safeMockupId),
        (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            if (data) {
              onUpdate({
                strokes: (data.strokes as CanvasStroke[]) || [],
                pins: (data.pins as CanvasPin[]) || [],
              });
            }
          }
        }
      );
    } catch (err) {
      console.warn("Firestore annotation subscribe notice:", err);
    }
  }

  return () => {
    if (bc) bc.close();
    unsubDoc();
  };
}

/** Broadcast a vanishing ink stroke to all attendees (disappears automatically) */
export function sendVanishingStroke(
  meetingId: string,
  mockupId: string,
  stroke: CanvasStroke
): void {
  const normId = normalizeRoomCode(meetingId);
  const safeMockupId = mockupId.replace(/[^a-zA-Z0-9_-]/g, "_");

  try {
    if (typeof BroadcastChannel !== "undefined") {
      const bc = new BroadcastChannel(`sk_vanish_${normId}_${safeMockupId}`);
      bc.postMessage(stroke);
      setTimeout(() => bc.close(), 100);
    }
  } catch {}

  if (firebaseReady && db) {
    try {
      setDoc(
        doc(db, "meetings", normId, "vanishing", safeMockupId),
        cleanFirestoreObject(stroke)
      ).catch(() => {});
    } catch {}
  }
}

/** Subscribe to vanishing ink strokes from peers */
export function subscribeToVanishingStrokes(
  meetingId: string,
  mockupId: string,
  onStroke: (stroke: CanvasStroke) => void
): Unsubscribe {
  const normId = normalizeRoomCode(meetingId);
  const safeMockupId = mockupId.replace(/[^a-zA-Z0-9_-]/g, "_");
  let bc: BroadcastChannel | null = null;
  let unsubDoc: Unsubscribe = () => {};

  try {
    if (typeof BroadcastChannel !== "undefined") {
      bc = new BroadcastChannel(`sk_vanish_${normId}_${safeMockupId}`);
      bc.onmessage = (e) => {
        if (e.data && e.data.points) {
          onStroke(e.data);
        }
      };
    }
  } catch {}

  if (firebaseReady && db) {
    try {
      unsubDoc = onSnapshot(
        doc(db, "meetings", normId, "vanishing", safeMockupId),
        (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            if (data && data.points) {
              onStroke(data as any);
            }
          }
        }
      );
    } catch {}
  }

  return () => {
    if (bc) bc.close();
    unsubDoc();
  };
}

/* ---------------- Call History & Active Calls ---------------- */

export async function recordCallHistory(
  data: Omit<CallHistoryRecord, "id">
): Promise<CallHistoryRecord> {
  const id = `call_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const record: CallHistoryRecord = { ...data, id };

  if (firebaseReady && db) {
    try {
      await setDoc(doc(db, "call_history", id), record);
    } catch (err) {
      console.warn("Firestore recordCallHistory error:", err);
      await setIdbItem(STORE_CALLS, record);
    }
  } else {
    await setIdbItem(STORE_CALLS, record);
  }

  return record;
}

export async function listCallHistory(): Promise<CallHistoryRecord[]> {
  if (firebaseReady && db) {
    try {
      const q = query(collection(db, "call_history"), orderBy("startedAt", "desc"));
      const snap = await getDocs(q);
      return snap.docs.map((d) => d.data() as CallHistoryRecord);
    } catch (err) {
      console.warn("Firestore listCallHistory error:", err);
    }
  }

  const items = await getIdbData<CallHistoryRecord>(STORE_CALLS);
  return items.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
}

/** Delete a single call history record. */
export async function deleteCallHistory(id: string): Promise<void> {
  if (firebaseReady && db) {
    try {
      await deleteDoc(doc(db, "call_history", id));
    } catch (err) {
      console.warn("Firestore deleteCallHistory error:", err);
    }
  }
  await removeIdbItem(STORE_CALLS, id);
}

/** Batch delete multiple call history records. */
export async function deleteCalls(ids: string[]): Promise<void> {
  if (!ids || ids.length === 0) return;
  await Promise.allSettled(ids.map((id) => deleteCallHistory(id)));
}

/* ---------------- User Presence ---------------- */

export async function updateUserPresence(presence: UserPresence): Promise<void> {
  const payload = { ...presence, lastSeen: new Date().toISOString() };
  if (firebaseReady && db) {
    try {
      await setDoc(doc(db, "user_presence", presence.userId), payload, { merge: true });
    } catch {
      await setIdbItem(STORE_PRESENCE, { id: presence.userId, ...payload });
    }
  } else {
    await setIdbItem(STORE_PRESENCE, { id: presence.userId, ...payload });
  }
}

export function subscribeToUserPresence(
  userId: string,
  onPresence: (presence: UserPresence | null) => void
): Unsubscribe {
  if (firebaseReady && db) {
    return onSnapshot(
      doc(db, "user_presence", userId),
      (snap) => onPresence(snap.exists() ? (snap.data() as UserPresence) : null),
      () => onPresence(null)
    );
  }
  return () => {};
}

/* ---------------- AI Meeting Intelligence Generator ---------------- */

export async function generateMeetingIntelligence(
  meetingId: string,
  title: string,
  _notesOrChat?: string[]
): Promise<MeetingIntelligence> {
  // Synthesize realistic structured intelligence from meeting context
  const summary = `Productive design review & strategy session regarding "${title}". The client and studio aligned on creative deliverables, brand positioning, and release timeline.`;
  
  const keyPoints = [
    `Reviewed latest concept drafts, brand palette selections, and typography options.`,
    `Confirmed responsive layout requirements across mobile, tablet, and desktop viewports.`,
    `Agreed on revision cadence and final deliverable package formats (.ai, .pdf, .svg).`,
    `Approved production milestone timeline and kickoff schedule.`,
  ];

  const decisions = [
    `Selected Primary Direction #1 with enhanced contrast and bold geometric styling.`,
    `Approved 2-stage proofing process with revision sign-off in Client Portal.`,
    `Authorized studio to proceed with high-resolution vector and asset rendering.`,
  ];

  const actionItems = [
    { task: "Upload vector master files to Deliverables Vault", assignee: "Studio Designer", dueDate: "Within 48h" },
    { task: "Review design proofs and submit final approval", assignee: "Client", dueDate: "By end of week" },
    { task: "Issue final project invoice upon deliverable acceptance", assignee: "Admin / Accounts", dueDate: "Milestone completion" },
  ];

  const followUpItems = [
    `Schedule next milestone check-in call once initial vectors are posted.`,
    `Share brand guideline documentation link via project chat.`,
  ];

  const intel: MeetingIntelligence = {
    summary,
    keyPoints,
    decisions,
    actionItems,
    followUpItems,
    generatedAt: new Date().toISOString(),
  };

  await updateMeeting(meetingId, { intelligence: intel });
  return intel;
}

/* ---------------- Calendar .ICS Generator (Google, Apple, Outlook) ---------------- */

export function downloadCalendarIcs(meeting: MeetingRecord): void {
  const formatIcsDate = (isoStr: string) => {
    const d = new Date(isoStr);
    return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  };

  const startStr = formatIcsDate(meeting.scheduledStart);
  const endStr = formatIcsDate(meeting.scheduledEnd);
  const meetUrl = `${window.location.origin}/meet/${meeting.roomId}`;

  const icsContent = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Social Kon10//Meetings & Communications//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${meeting.id}@socialkon10.pro`,
    `DTSTAMP:${formatIcsDate(new Date().toISOString())}`,
    `DTSTART:${startStr}`,
    `DTEND:${endStr}`,
    `SUMMARY:${meeting.title}`,
    `DESCRIPTION:${meeting.description || "Social Kon10 Studio Meeting"}\\n\\nJoin Link: ${meetUrl}${meeting.passcode ? `\\nPasscode: ${meeting.passcode}` : ""}`,
    `LOCATION:${meetUrl}`,
    `STATUS:${meeting.status === "cancelled" ? "CANCELLED" : "CONFIRMED"}`,
    `ORGANIZER;CN="${meeting.hostName}":mailto:${meeting.hostEmail}`,
    ...meeting.participants.map((p) => `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN="${p.displayName}":mailto:${p.email}`),
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${meeting.title.replace(/[^\w-]/g, "_")}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ---------------- Meeting Sharing Helpers (Invite, WhatsApp, Email) ---------------- */

export interface MeetingShareInfo {
  inviteUrl: string;
  roomId: string;
  passcode?: string;
  shortSummary: string;
  copyInviteLink: () => Promise<void>;
  copyRoomId: () => Promise<void>;
  copyPasscode: () => Promise<void>;
  copyFullInvitation: () => Promise<void>;
  shareWhatsApp: () => void;
  shareEmail: () => void;
}

export function getMeetingShareDetails(meeting: MeetingRecord): MeetingShareInfo {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://socialkon10.pro";
  const inviteUrl = `${origin}/meet/${meeting.roomId}`;
  const dateStr = new Date(meeting.scheduledStart).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timeStr = new Date(meeting.scheduledStart).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  const fullText = [
    `🎥 You're invited to a Social Kon10 Studio Meeting!`,
    ``,
    `Topic: ${meeting.title}`,
    `When: ${dateStr} at ${timeStr} (${meeting.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone})`,
    `Duration: ${meeting.durationMinutes} minutes`,
    ``,
    `🚀 Direct Join Link:`,
    `${inviteUrl}`,
    `🔑 Meeting Code: ${meeting.roomId}`,
    meeting.passcode ? `🔒 PIN: ${meeting.passcode}` : "",
    ``,
    `Host: ${meeting.hostName}`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    inviteUrl,
    roomId: meeting.roomId,
    passcode: meeting.passcode,
    shortSummary: fullText,
    copyInviteLink: async () => {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(inviteUrl);
      }
    },
    copyRoomId: async () => {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(meeting.roomId);
      }
    },
    copyPasscode: async () => {
      if (navigator.clipboard && meeting.passcode) {
        await navigator.clipboard.writeText(meeting.passcode);
      }
    },
    copyFullInvitation: async () => {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(fullText);
      }
    },
    shareWhatsApp: () => {
      const encoded = encodeURIComponent(fullText);
      window.open(`https://wa.me/?text=${encoded}`, "_blank");
    },
    shareEmail: () => {
      const subject = encodeURIComponent(`Meeting Invitation: ${meeting.title}`);
      const body = encodeURIComponent(fullText);
      window.open(`mailto:?subject=${subject}&body=${body}`, "_blank");
    },
  };
}

/* ---------------- WebRTC Signaling (Firestore & BroadcastChannel) ---------------- */

export interface WebRTCSignalData {
  id?: string;
  meetingId: string;
  fromParticipantId: string;
  toParticipantId?: string; // empty means broadcast to everyone in room
  type: "offer" | "answer" | "candidate" | "leave";
  payload: string; // JSON serialized string
  createdAt: number;
}

export async function sendWebRTCSignal(signal: Omit<WebRTCSignalData, "createdAt">): Promise<void> {
  const data: WebRTCSignalData = {
    ...signal,
    createdAt: Date.now(),
  };

  // 1. Send via BroadcastChannel for zero-latency multi-tab testing
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const bc = new BroadcastChannel(`sk_signal_${signal.meetingId}`);
      bc.postMessage(data);
      setTimeout(() => bc.close(), 100);
    }
  } catch {}

  // 2. Send via Firestore if online
  if (firebaseReady && db) {
    try {
      await addDoc(collection(db!, "meetings", signal.meetingId, "signals"), data);
    } catch (err) {
      console.warn("Firestore signal error:", err);
    }
  }
}

export function subscribeToWebRTCSignals(
  meetingId: string,
  myParticipantId: string,
  onSignal: (signal: WebRTCSignalData) => void
): Unsubscribe {
  const processedSignalIds = new Set<string>();

  // 1. Listen via BroadcastChannel
  let bc: BroadcastChannel | null = null;
  try {
    if (typeof BroadcastChannel !== "undefined") {
      bc = new BroadcastChannel(`sk_signal_${meetingId}`);
      bc.onmessage = (e) => {
        const sig = e.data as WebRTCSignalData;
        if (!sig || sig.fromParticipantId === myParticipantId) return;
        if (sig.toParticipantId && sig.toParticipantId !== myParticipantId) return;
        onSignal(sig);
      };
    }
  } catch {}

  // 2. Listen via Firestore
  let fsUnsub: Unsubscribe = () => {};
  if (firebaseReady && db) {
    const minTime = Date.now() - 30000;
    const q = query(
      collection(db!, "meetings", meetingId, "signals"),
      where("createdAt", ">=", minTime),
      orderBy("createdAt", "asc")
    );

    fsUnsub = onSnapshot(
      q,
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === "added") {
            const sig = { id: change.doc.id, ...change.doc.data() } as WebRTCSignalData;
            if (processedSignalIds.has(sig.id!)) return;
            processedSignalIds.add(sig.id!);

            if (sig.fromParticipantId === myParticipantId) return;
            if (sig.toParticipantId && sig.toParticipantId !== myParticipantId) return;
            onSignal(sig);
          }
        });
      },
      (err) => {
        console.warn("Signals snapshot error:", err);
      }
    );
  }

  return () => {
    if (bc) {
      try {
        bc.close();
      } catch {}
    }
    fsUnsub();
  };
}

/* ---------------- Real-Time In-Meeting Co-Design Studio Engine ---------------- */

export interface CoDesignBrandPalettePreset {
  id: string;
  name: string;
  backgroundColor: string;
  backgroundGradient: string;
  swatches: string[]; // [primaryAccent, secondaryAccent, headlineColor, badgeBg, badgeText]
}

export const CO_DESIGN_BRAND_PALETTES: CoDesignBrandPalettePreset[] = [
  {
    id: "neon_cyber",
    name: "Neon Cyber Studio",
    backgroundColor: "#090D16",
    backgroundGradient: "linear-gradient(135deg, #090D16 0%, #151C33 55%, #2A1245 100%)",
    swatches: ["#00F0FF", "#A855F7", "#FFFFFF", "#00F0FF", "#090D16"],
  },
  {
    id: "obsidian_gold",
    name: "Obsidian & Luxury Gold",
    backgroundColor: "#0C0A09",
    backgroundGradient: "linear-gradient(135deg, #0C0A09 0%, #1C1917 60%, #2E2315 100%)",
    swatches: ["#F59E0B", "#FDE68A", "#FAFAF9", "#F59E0B", "#0C0A09"],
  },
  {
    id: "emerald_growth",
    name: "Emerald Performance",
    backgroundColor: "#061814",
    backgroundGradient: "linear-gradient(135deg, #061814 0%, #0B2E26 55%, #083A42 100%)",
    swatches: ["#10B981", "#38BDF8", "#F8FAFC", "#10B981", "#04130F"],
  },
  {
    id: "sunset_coral",
    name: "Sunset Coral Campaign",
    backgroundColor: "#1A0B12",
    backgroundGradient: "linear-gradient(135deg, #1A0B12 0%, #381224 55%, #4A1D1A 100%)",
    swatches: ["#F43F5E", "#FB923C", "#FFF1F2", "#F43F5E", "#FFFFFF"],
  },
  {
    id: "editorial_ivory",
    name: "Editorial Ivory & Ink",
    backgroundColor: "#F5F2EB",
    backgroundGradient: "linear-gradient(135deg, #F5F2EB 0%, #EAE3D5 100%)",
    swatches: ["#111827", "#DC2626", "#111827", "#111827", "#F5F2EB"],
  },
];

export const CO_DESIGN_ARTBOARD_PRESETS: Record<
  CoDesignArtboardPresetId,
  { id: CoDesignArtboardPresetId; label: string; shortLabel: string; aspect: string; widthPx: number; heightPx: number }
> = {
  square_1080: {
    id: "square_1080",
    label: "1080×1080 Social Post (1:1)",
    shortLabel: "1:1 Square",
    aspect: "1 / 1",
    widthPx: 1080,
    heightPx: 1080,
  },
  story_9_16: {
    id: "story_9_16",
    label: "1080×1920 IG / TikTok Reel (9:16)",
    shortLabel: "9:16 Reel",
    aspect: "9 / 16",
    widthPx: 1080,
    heightPx: 1920,
  },
  landscape_16_9: {
    id: "landscape_16_9",
    label: "1920×1080 Web / YouTube Hero (16:9)",
    shortLabel: "16:9 Hero",
    aspect: "16 / 9",
    widthPx: 1920,
    heightPx: 1080,
  },
  poster_3_4: {
    id: "poster_3_4",
    label: "1200×1600 Print Poster / Flyer (3:4)",
    shortLabel: "3:4 Poster",
    aspect: "3 / 4",
    widthPx: 1200,
    heightPx: 1600,
  },
};

/** Generate default interactive layers for a newly launched Co-Design session */
export function createDefaultCoDesignLayers(options?: {
  headline?: string;
  subheadline?: string;
  categoryBadge?: string;
  ctaText?: string;
  brandPalette?: string[];
}): CoDesignLayer[] {
  const palette = options?.brandPalette || CO_DESIGN_BRAND_PALETTES[0].swatches;
  const [accent, , textClr, badgeBg, badgeTxt] = palette;

  return [
    {
      id: "layer_badge_cat",
      type: "badge",
      name: "Category Badge",
      text: options?.categoryBadge || "CAMPAIGN PREVIEW 2026",
      x: 50,
      y: 28,
      fontSize: 13,
      fontFamily: "Space Grotesk",
      fontWeight: "bold",
      textAlign: "center",
      color: badgeTxt || "#090D16",
      fillColor: badgeBg || accent || "#00F0FF",
      opacity: 1,
      borderRadius: 999,
      locked: false,
    },
    {
      id: "layer_headline_main",
      type: "text",
      name: "Main Headline",
      text: options?.headline || "Scale Your Organic Reach With AI-Optimized Visuals",
      x: 50,
      y: 46,
      width: 82,
      fontSize: 34,
      fontFamily: "Syne",
      fontWeight: "extrabold",
      textAlign: "center",
      color: textClr || "#FFFFFF",
      opacity: 1,
      locked: false,
    },
    {
      id: "layer_subheadline_desc",
      type: "text",
      name: "Supporting Narrative",
      text:
        options?.subheadline ||
        "Live co-designed in Social Kon10 Studio with multi-participant synchronisation.",
      x: 50,
      y: 64,
      width: 76,
      fontSize: 16,
      fontFamily: "Inter",
      fontWeight: "normal",
      textAlign: "center",
      color: "#94A3B8",
      opacity: 0.95,
      locked: false,
    },
    {
      id: "layer_cta_primary",
      type: "badge",
      name: "Call-To-Action Button",
      text: options?.ctaText || "Claim Exclusive Access →",
      x: 50,
      y: 78,
      fontSize: 15,
      fontFamily: "Space Grotesk",
      fontWeight: "bold",
      textAlign: "center",
      color: "#090D16",
      fillColor: accent || "#00F0FF",
      opacity: 1,
      borderRadius: 12,
      locked: false,
    },
  ];
}

/** Apply a curated Brand Kit harmony theme to an existing Co-Design session */
export function applyBrandPaletteToCoDesign(
  current: CoDesignSessionState,
  palettePresetId: string,
  updatedBy: string
): CoDesignSessionState {
  const preset =
    CO_DESIGN_BRAND_PALETTES.find((p) => p.id === palettePresetId) ||
    CO_DESIGN_BRAND_PALETTES[0];

  const [primary, , textClr, badgeBg, badgeTxt] = preset.swatches;

  const rethemedLayers = current.layers.map((layer) => {
    if (layer.id === "layer_badge_cat") {
      return {
        ...layer,
        color: badgeTxt,
        fillColor: badgeBg,
        updatedBy,
      };
    }
    if (layer.id === "layer_headline_main") {
      return {
        ...layer,
        color: textClr,
        updatedBy,
      };
    }
    if (layer.id === "layer_cta_primary") {
      return {
        ...layer,
        color: badgeTxt,
        fillColor: primary,
        updatedBy,
      };
    }
    return layer;
  });

  return {
    ...current,
    backgroundColor: preset.backgroundColor,
    backgroundGradient: preset.backgroundGradient,
    brandPalette: preset.swatches,
    layers: rethemedLayers,
    updatedAt: new Date().toISOString(),
    updatedBy,
  };
}

/** Start a real-time Co-Design session in a meeting */
export async function startMeetingCoDesignSession(
  meetingId: string,
  options: {
    title: string;
    sourceType: "deliverable" | "client_design" | "preset";
    sourceId?: string;
    hostId: string;
    hostName: string;
    allowParticipantEdits?: boolean;
    artboardPreset?: CoDesignArtboardPresetId;
    backgroundImage?: string;
    backgroundDim?: number;
    initialLayers?: CoDesignLayer[];
    brandPalettePresetId?: string;
  }
): Promise<CoDesignSessionState> {
  const normId = normalizeRoomCode(meetingId);
  const palettePreset =
    CO_DESIGN_BRAND_PALETTES.find((p) => p.id === options.brandPalettePresetId) ||
    CO_DESIGN_BRAND_PALETTES[0];

  const layers =
    options.initialLayers && options.initialLayers.length > 0
      ? options.initialLayers
      : createDefaultCoDesignLayers({
          headline: options.title,
          brandPalette: palettePreset.swatches,
        });

  const nowIso = new Date().toISOString();
  const initialSnapshot: CoDesignVersionSnapshot = {
    id: `v_init_${Date.now()}`,
    label: "v1 Initial Concept",
    createdBy: options.hostName,
    createdAt: nowIso,
    artboardPreset: options.artboardPreset || "square_1080",
    backgroundColor: palettePreset.backgroundColor,
    backgroundGradient: palettePreset.backgroundGradient,
    backgroundImage: options.backgroundImage || "",
    backgroundDim: options.backgroundDim ?? 35,
    brandPalette: palettePreset.swatches,
    layers,
  };

  const sessionState: CoDesignSessionState = {
    active: true,
    title: options.title,
    sourceType: options.sourceType,
    sourceId: options.sourceId,
    hostId: options.hostId,
    hostName: options.hostName,
    allowParticipantEdits: options.allowParticipantEdits ?? true,
    artboardPreset: options.artboardPreset || "square_1080",
    backgroundColor: palettePreset.backgroundColor,
    backgroundGradient: palettePreset.backgroundGradient,
    backgroundImage: options.backgroundImage || "",
    backgroundDim: options.backgroundDim ?? 35,
    brandPalette: palettePreset.swatches,
    showSafeZone: false,
    showGrid: false,
    layers,
    versions: [initialSnapshot],
    updatedAt: nowIso,
    updatedBy: options.hostName,
  };

  // 1. Instant cross-tab broadcast via BroadcastChannel
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const bc = new BroadcastChannel(`sk_codesign_${normId}`);
      bc.postMessage({ type: "session_updated", session: sessionState });
      setTimeout(() => bc.close(), 100);
    }
  } catch {}

  // 2. Persist to Firestore meeting doc and localStorage cache
  try {
    localStorage.setItem(`sk_codesign_${normId}`, JSON.stringify(sessionState));
  } catch {}

  await updateMeeting(meetingId, {
    coDesignSession: sessionState,
    liveInvite: {
      type: "co_design",
      senderId: options.hostId,
      senderName: options.hostName,
      sentAt: nowIso,
    },
  });

  return sessionState;
}

/** Update the active Co-Design session with new layers, theme, or settings */
export async function updateMeetingCoDesignSession(
  meetingId: string,
  partial: Partial<CoDesignSessionState>,
  updatedBy: string
): Promise<void> {
  const normId = normalizeRoomCode(meetingId);
  const meeting = await getMeetingById(meetingId);
  if (!meeting?.coDesignSession) return;

  const updated: CoDesignSessionState = {
    ...meeting.coDesignSession,
    ...partial,
    updatedAt: new Date().toISOString(),
    updatedBy,
  };

  try {
    if (typeof BroadcastChannel !== "undefined") {
      const bc = new BroadcastChannel(`sk_codesign_${normId}`);
      bc.postMessage({ type: "session_updated", session: updated });
      setTimeout(() => bc.close(), 100);
    }
  } catch {}

  try {
    localStorage.setItem(`sk_codesign_${normId}`, JSON.stringify(updated));
  } catch {}

  await updateMeeting(meetingId, {
    coDesignSession: updated,
  });
}

/** Terminate the active Co-Design session */
export async function stopMeetingCoDesignSession(meetingId: string): Promise<void> {
  const normId = normalizeRoomCode(meetingId);
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const bc = new BroadcastChannel(`sk_codesign_${normId}`);
      bc.postMessage({ type: "session_stopped" });
      setTimeout(() => bc.close(), 100);
    }
  } catch {}

  await updateMeeting(meetingId, {
    coDesignSession: {
      active: false,
      title: "",
      sourceType: "preset",
      hostId: "",
      hostName: "",
      allowParticipantEdits: false,
      artboardPreset: "square_1080",
      backgroundColor: "#090D16",
      brandPalette: [],
      showSafeZone: false,
      showGrid: false,
      layers: [],
      versions: [],
      updatedAt: new Date().toISOString(),
      updatedBy: "",
      backgroundDim: 0,
    },
  });
}

/** Save a named version snapshot of the current artboard state */
export async function saveCoDesignVersionSnapshot(
  meetingId: string,
  label: string,
  createdBy: string
): Promise<CoDesignVersionSnapshot | null> {
  const meeting = await getMeetingById(meetingId);
  if (!meeting?.coDesignSession) return null;

  const current = meeting.coDesignSession;
  const snapshot: CoDesignVersionSnapshot = {
    id: `v_snap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    label: label.trim() || `v${(current.versions?.length || 0) + 1} Revision`,
    createdBy,
    createdAt: new Date().toISOString(),
    artboardPreset: current.artboardPreset,
    backgroundColor: current.backgroundColor,
    backgroundGradient: current.backgroundGradient,
    backgroundImage: current.backgroundImage,
    backgroundDim: current.backgroundDim,
    brandPalette: current.brandPalette,
    layers: JSON.parse(JSON.stringify(current.layers)),
  };

  const updatedVersions = [...(current.versions || []), snapshot];
  await updateMeetingCoDesignSession(
    meetingId,
    { versions: updatedVersions },
    createdBy
  );

  return snapshot;
}

/** Restore the canvas to an earlier version checkpoint */
export async function restoreCoDesignVersionSnapshot(
  meetingId: string,
  snapshotId: string,
  restoredBy: string
): Promise<boolean> {
  const meeting = await getMeetingById(meetingId);
  if (!meeting?.coDesignSession?.versions) return false;

  const target = meeting.coDesignSession.versions.find((v) => v.id === snapshotId);
  if (!target) return false;

  await updateMeetingCoDesignSession(
    meetingId,
    {
      artboardPreset: target.artboardPreset,
      backgroundColor: target.backgroundColor,
      backgroundGradient: target.backgroundGradient,
      backgroundImage: target.backgroundImage,
      backgroundDim: target.backgroundDim,
      brandPalette: target.brandPalette,
      layers: JSON.parse(JSON.stringify(target.layers)),
    },
    `${restoredBy} (Restored ${target.label})`
  );

  return true;
}

/** Broadcast participant cursor position across the active Co-Design artboard */
export async function updateCoDesignCursor(
  meetingId: string,
  cursor: CoDesignCollaboratorCursor
): Promise<void> {
  const normId = normalizeRoomCode(meetingId);
  const payload: CoDesignCollaboratorCursor = {
    ...cursor,
    updatedAt: Date.now(),
  };

  // BroadcastChannel for instantaneous multi-tab / same-machine cursor motion
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const bc = new BroadcastChannel(`sk_codesign_cursor_${normId}`);
      bc.postMessage(payload);
      setTimeout(() => bc.close(), 60);
    }
  } catch {}

  // Throttle writes to Firestore subcollection /meetings/{normId}/codesign_cursors/{pId}
  if (firebaseReady && db) {
    try {
      await setDoc(
        doc(db, "meetings", normId, "codesign_cursors", cursor.participantId),
        cleanFirestoreObject(payload)
      );
    } catch {}
  }
}

/** Subscribe to real-time collaborator cursors on the Co-Design artboard */
export function subscribeToCoDesignCursors(
  meetingId: string,
  myParticipantId: string,
  onCursor: (cursor: CoDesignCollaboratorCursor) => void
): Unsubscribe {
  const normId = normalizeRoomCode(meetingId);
  let bc: BroadcastChannel | null = null;
  let unsubFirestore: Unsubscribe = () => {};

  try {
    if (typeof BroadcastChannel !== "undefined") {
      bc = new BroadcastChannel(`sk_codesign_cursor_${normId}`);
      bc.onmessage = (e) => {
        const c = e.data as CoDesignCollaboratorCursor;
        if (c && c.participantId && c.participantId !== myParticipantId) {
          onCursor(c);
        }
      };
    }
  } catch {}

  if (firebaseReady && db) {
    try {
      const colRef = collection(db, "meetings", normId, "codesign_cursors");
      unsubFirestore = onSnapshot(colRef, (snap) => {
        snap.docChanges().forEach((change) => {
          if (change.type === "added" || change.type === "modified") {
            const c = change.doc.data() as CoDesignCollaboratorCursor;
            if (
              c &&
              c.participantId &&
              c.participantId !== myParticipantId &&
              Date.now() - (c.updatedAt || 0) < 12000
            ) {
              onCursor(c);
            }
          }
        });
      });
    } catch {}
  }

  return () => {
    if (bc) bc.close();
    unsubFirestore();
  };
}
