import { describe, it, expect } from "vitest";
import { mergeParticipantUpdate, type MeetingParticipant } from "../meetings";
import { isPolitePeer } from "../webrtc";

const makeP = (over: Partial<MeetingParticipant>): MeetingParticipant => ({
  id: "p_x",
  meetingId: "m1",
  email: "",
  displayName: "User",
  role: "participant",
  status: "joined",
  ...over,
});

describe("mergeParticipantUpdate", () => {
  it("upserts an existing participant matched by id without duplicating", () => {
    const list = [makeP({ id: "p_1", displayName: "Alice" })];
    const merged = mergeParticipantUpdate(list, "p_1", { isMuted: true });
    expect(merged).toHaveLength(1);
    expect(merged[0].isMuted).toBe(true);
    expect(merged[0].displayName).toBe("Alice");
  });

  it("appends a genuinely new participant (join flow)", () => {
    const list = [makeP({ id: "host_1", role: "host" })];
    const merged = mergeParticipantUpdate(list, "p_guest", {
      meetingId: "m1",
      email: "g@guest.local",
      displayName: "Guest",
      role: "participant",
      status: "waiting",
    });
    expect(merged).toHaveLength(2);
    expect(merged.find((p) => p.id === "p_guest")?.status).toBe("waiting");
  });

  it("matches the host by role when the session id differs (no phantom hosts)", () => {
    const list = [makeP({ id: "p_admin_1", role: "host", displayName: "Studio" })];
    const merged = mergeParticipantUpdate(list, "p_random_new", {
      role: "host",
      status: "joined",
      isMuted: true,
    } as Partial<MeetingParticipant>);
    const hosts = merged.filter((p) => p.role === "host");
    expect(hosts).toHaveLength(1);
    expect(hosts[0].isMuted).toBe(true);
  });

  it("matches by email for signed-in users joining from a new session", () => {
    const list = [makeP({ id: "p_old", email: "client@acme.com", displayName: "Client" })];
    const merged = mergeParticipantUpdate(list, "p_new_session", {
      email: "Client@Acme.com",
      status: "joined",
    });
    expect(merged).toHaveLength(1);
    expect(merged[0].status).toBe("joined");
    expect(merged[0].id).toBe("p_new_session");
  });

  it("does NOT match synthetic @guest.local emails against each other", () => {
    const list = [makeP({ id: "p_a", email: "bob@guest.local" })];
    const merged = mergeParticipantUpdate(list, "p_b", { email: "bob@guest.local" });
    expect(merged).toHaveLength(2);
  });

  it("keeps at most one host even if the update would introduce a second", () => {
    const list = [makeP({ id: "h1", role: "host" }), makeP({ id: "h2", role: "host" })];
    const merged = mergeParticipantUpdate(list, "p_1", { status: "left" });
    expect(merged.filter((p) => p.role === "host")).toHaveLength(1);
  });

  it("deduplicates repeated session ids, keeping the first occurrence", () => {
    const list = [makeP({ id: "p_1", displayName: "First" }), makeP({ id: "p_1", displayName: "Dupe" })];
    const merged = mergeParticipantUpdate(list, "p_other", { status: "joined" });
    const ones = merged.filter((p) => p.id === "p_1");
    expect(ones).toHaveLength(1);
    expect(ones[0].displayName).toBe("First");
  });

  it("two concurrent joins merge cleanly (no lost update)", () => {
    const base = [makeP({ id: "host_1", role: "host" })];
    const afterA = mergeParticipantUpdate(base, "p_a", { status: "joined", displayName: "A" });
    // Simulate B's write landing on the already-updated list (transaction retry)
    const afterB = mergeParticipantUpdate(afterA, "p_b", { status: "joined", displayName: "B" });
    expect(afterB.map((p) => p.id)).toEqual(["host_1", "p_a", "p_b"]);
  });
});

describe("isPolitePeer (perfect negotiation)", () => {
  it("is deterministic and asymmetric — exactly one side is polite", () => {
    expect(isPolitePeer("p_b", "p_a")).toBe(true);
    expect(isPolitePeer("p_a", "p_b")).toBe(false);
    expect(isPolitePeer("p_a", "p_b")).not.toBe(isPolitePeer("p_b", "p_a"));
  });

  it("host-style ids and guest session ids resolve consistently", () => {
    // "p_1..." < "p_admin..." because '1' (0x31) < 'a' (0x61)
    expect(isPolitePeer("p_admin_1", "p_1700000000000_ab")).toBe(true);
    expect(isPolitePeer("p_1700000000000_ab", "p_admin_1")).toBe(false);
  });
});
