import { describe, it, expect, vi, beforeEach } from "vitest";

/* In-memory Firestore stand-in. The speaker-queue module is transaction
   based, so we mock just enough of firestore + the app's firebase module to
   run the real state machine end to end without a network. */
const store = new Map<string, Record<string, unknown>>();

vi.mock("firebase/firestore", () => {
  const snap = (ref: { path: string }) => ({
    exists: () => store.has(ref.path),
    data: () => store.get(ref.path),
    ref,
  });
  return {
    doc: (_db: unknown, ...parts: string[]) => ({ path: parts.join("/") }),
    collection: (_db: unknown, ...parts: string[]) => ({ path: parts.join("/") }),
    getDoc: async (ref: { path: string }) => snap(ref),
    getDocs: async () => ({ docs: [], empty: true, forEach: () => {} }),
    setDoc: async (ref: { path: string }, data: Record<string, unknown>, opts?: { merge?: boolean }) => {
      const prev = store.get(ref.path) ?? {};
      store.set(ref.path, opts?.merge ? { ...prev, ...data } : data);
    },
    updateDoc: async (ref: { path: string }, data: Record<string, unknown>) => {
      store.set(ref.path, { ...(store.get(ref.path) ?? {}), ...data });
    },
    deleteDoc: async (ref: { path: string }) => {
      store.delete(ref.path);
    },
    addDoc: async (colRef: { path: string }, data: Record<string, unknown>) => {
      const id = `auto_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      store.set(`${colRef.path}/${id}`, data);
      return { id };
    },
    onSnapshot: () => () => {},
    query: (first: unknown) => first,
    where: () => ({}),
    orderBy: () => ({}),
    writeBatch: () => ({ set() {}, update() {}, delete() {}, commit: async () => {} }),
    runTransaction: async (_db: unknown, fn: (tx: unknown) => unknown) => {
      const tx = {
        get: async (ref: { path: string }) => snap(ref),
        update: (ref: { path: string }, data: Record<string, unknown>) => {
          store.set(ref.path, { ...(store.get(ref.path) ?? {}), ...data });
        },
        set: (ref: { path: string }, data: Record<string, unknown>) => {
          store.set(ref.path, data);
        },
        delete: (ref: { path: string }) => {
          store.delete(ref.path);
        },
      };
      return fn(tx);
    },
  };
});

vi.mock("../firebase", () => ({ db: { __mock: true }, firebaseReady: true }));

import {
  normalizeRoomCode,
  queueRaise,
  queueWithdraw,
  queueInviteNext,
  queueAccept,
  queueDecline,
  queueFinish,
  queueSkip,
  type MeetingRecord,
  type SpeakerQueueEntry,
} from "../meetings";

const ROOM = "QROOM1";
const key = () => `meetings/${normalizeRoomCode(ROOM)}`;

const seedMeeting = () => {
  store.set(key(), {
    id: normalizeRoomCode(ROOM),
    roomId: ROOM,
    title: "Queue Test",
    status: "live",
    participants: [
      { id: "host_1", meetingId: ROOM, email: "", displayName: "Host", role: "host", status: "joined" },
      { id: "p_alice", meetingId: ROOM, email: "", displayName: "Alice", role: "participant", status: "joined" },
      { id: "p_bob", meetingId: ROOM, email: "", displayName: "Bob", role: "participant", status: "joined" },
    ],
    speakerQueue: [],
    speakerQueueSequenceCounter: 0,
  } as Partial<MeetingRecord>);
};

const queue = (): SpeakerQueueEntry[] =>
  (store.get(key()) as { speakerQueue?: SpeakerQueueEntry[] })?.speakerQueue ?? [];

beforeEach(() => {
  store.clear();
  seedMeeting();
});

describe("speaker queue state machine", () => {
  it("raise adds a waiting entry, bumps the sequence and raises the hand flag", async () => {
    await queueRaise(ROOM, "p_alice", "Alice");
    expect(queue()).toHaveLength(1);
    expect(queue()[0]).toMatchObject({ participantId: "p_alice", status: "waiting", serverSequence: 1 });
    const m = store.get(key()) as unknown as MeetingRecord;
    expect(m.participants.find((p) => p.id === "p_alice")?.isHandRaised).toBe(true);
  });

  it("raising twice never duplicates the participant", async () => {
    await queueRaise(ROOM, "p_alice", "Alice");
    await queueRaise(ROOM, "p_alice", "Alice");
    expect(queue()).toHaveLength(1);
  });

  it("invite-next picks FIFO order and sets an expiry", async () => {
    await queueRaise(ROOM, "p_bob", "Bob");
    await queueRaise(ROOM, "p_alice", "Alice");
    const invited = await queueInviteNext(ROOM, "host_1");
    expect(invited?.participantId).toBe("p_bob");
    expect(invited?.status).toBe("invited");
    expect(invited?.expiresAt).toBeTruthy();
    expect(queue().find((e) => e.participantId === "p_bob")?.status).toBe("invited");
  });

  it("invite-next is atomic — refuses while someone is invited or speaking", async () => {
    await queueRaise(ROOM, "p_alice", "Alice");
    await queueRaise(ROOM, "p_bob", "Bob");
    await queueInviteNext(ROOM, "host_1");
    const second = await queueInviteNext(ROOM, "host_1");
    expect(second).toBeNull();
    expect(queue().filter((e) => e.status === "invited")).toHaveLength(1);
  });

  it("full lifecycle: raise → invite → accept → finish completes the turn", async () => {
    await queueRaise(ROOM, "p_alice", "Alice");
    await queueInviteNext(ROOM, "host_1");
    await queueAccept(ROOM, "p_alice");
    expect(queue()[0].status).toBe("speaking");

    await queueFinish(ROOM, "p_alice");
    expect(queue()[0].status).toBe("completed");
    const m = store.get(key()) as unknown as MeetingRecord;
    expect(m.participants.find((p) => p.id === "p_alice")?.isHandRaised).toBe(false);

    // next person can now be invited
    await queueRaise(ROOM, "p_bob", "Bob");
    const next = await queueInviteNext(ROOM, "host_1");
    expect(next?.participantId).toBe("p_bob");
  });

  it("accepting an expired invitation is rejected silently (no status flip)", async () => {
    await queueRaise(ROOM, "p_alice", "Alice");
    const invited = await queueInviteNext(ROOM, "host_1");
    // Force expiry into the past
    const expiredQueue = queue().map((e) =>
      e.id === invited!.id ? { ...e, expiresAt: new Date(Date.now() - 5000).toISOString() } : e
    );
    store.set(key(), { ...(store.get(key()) as object), speakerQueue: expiredQueue });
    await queueAccept(ROOM, "p_alice");
    expect(queue()[0].status).toBe("invited"); // unchanged
  });

  it("decline withdraws the invite and lowers the hand", async () => {
    await queueRaise(ROOM, "p_alice", "Alice");
    await queueInviteNext(ROOM, "host_1");
    await queueDecline(ROOM, "p_alice");
    expect(queue()[0].status).toBe("withdrawn");
    const m = store.get(key()) as unknown as MeetingRecord;
    expect(m.participants.find((p) => p.id === "p_alice")?.isHandRaised).toBe(false);
  });

  it("host skip marks the entry skipped", async () => {
    await queueRaise(ROOM, "p_alice", "Alice");
    const entryId = queue()[0].id;
    await queueSkip(ROOM, entryId);
    expect(queue()[0].status).toBe("skipped");
  });

  it("withdraw marks waiting entries withdrawn and lowers the hand", async () => {
    await queueRaise(ROOM, "p_alice", "Alice");
    await queueWithdraw(ROOM, "p_alice");
    expect(queue()[0].status).toBe("withdrawn");
    const m = store.get(key()) as unknown as MeetingRecord;
    expect(m.participants.find((p) => p.id === "p_alice")?.isHandRaised).toBe(false);
  });
});
