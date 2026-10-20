import { describe, it, expect } from "vitest";
import {
  cleanFirestoreObject,
  mergeParticipantUpdate,
  normalizeRoomCode,
  distributeParticipantsEvenly,
  createDefaultCoDesignLayers,
  applyBrandPaletteToCoDesign,
  CO_DESIGN_BRAND_PALETTES,
  CO_DESIGN_ARTBOARD_PRESETS,
  type CoDesignSessionState,
  type MeetingParticipant,
  type MeetingBreakoutRoom,
} from "../meetings";
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

  it("strips undefined fields (joinedAt, userId) when a guest joins the waiting room", () => {
    const base = [makeP({ id: "host_1", role: "host", email: "admin@socialkon10.pro" })];
    const merged = mergeParticipantUpdate(base, "p_guest_1", {
      id: "p_guest_1",
      meetingId: "SK-ABC-1234-XYZ",
      userId: undefined,
      email: "visitor@guest.local",
      displayName: "Visitor",
      role: "participant",
      status: "waiting",
      joinedAt: undefined,
    });
    const guest = merged.find((p) => p.id === "p_guest_1")!;
    expect(guest).toBeDefined();
    expect(guest.status).toBe("waiting");
    expect("joinedAt" in guest).toBe(false);
    expect("userId" in guest).toBe(false);

    const payload = cleanFirestoreObject({ participants: merged, updatedAt: "2026-10-20T00:00:00Z" });
    for (const p of payload.participants) {
      for (const [, v] of Object.entries(p)) {
        expect(v).not.toBeUndefined();
      }
    }
  });

  it("never overwrites the host record when a non-host participant shares email or userId", () => {
    const base = [makeP({ id: "host_1", role: "host", email: "studio@acme.com", userId: "u_1" })];
    const merged = mergeParticipantUpdate(base, "p_guest_2", {
      role: "participant",
      status: "waiting",
      email: "studio@acme.com",
      userId: "u_1",
      displayName: "Second Device",
    });
    expect(merged).toHaveLength(2);
    expect(merged.find((p) => p.role === "host")?.status).toBe("joined");
    expect(merged.find((p) => p.id === "p_guest_2")?.status).toBe("waiting");
  });
});

describe("normalizeRoomCode", () => {
  it("normalizes pasted links with query strings and trailing slashes", () => {
    expect(normalizeRoomCode("https://socialkon10.pro/meet/sk-abc-1234-xyz?pass=654321")).toBe("SK-ABC-1234-XYZ");
    expect(normalizeRoomCode("https://www.socialkon10.pro/meet/sk-abc-1234-xyz/")).toBe("SK-ABC-1234-XYZ");
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

describe("Breakout Rooms engine", () => {
  const makeRoom = (id: string, name: string): MeetingBreakoutRoom => ({
    id,
    meetingId: "SK-TEST-1234-XYZ",
    name,
    status: "open",
    assignedParticipants: [],
    activeParticipants: [],
    createdAt: "2026-10-20T00:00:00Z",
  });

  it("distributes participants evenly across rooms in round-robin order and deduplicates IDs", () => {
    const rooms = [makeRoom("r1", "Room 1"), makeRoom("r2", "Room 2")];
    const distributed = distributeParticipantsEvenly(
      ["p1", "p2", "p3", "p4", "p5", "p1"],
      rooms
    );
    expect(distributed[0].assignedParticipants).toEqual(["p1", "p3", "p5"]);
    expect(distributed[1].assignedParticipants).toEqual(["p2", "p4"]);
  });

  it("handles empty room list gracefully when distributing participants", () => {
    expect(distributeParticipantsEvenly(["p1", "p2"], [])).toEqual([]);
  });

  it("preserves currentBreakoutRoomId and helpRequestedRoomId across mergeParticipantUpdate", () => {
    const list = [makeP({ id: "p_alice", displayName: "Alice" })];
    const inRoom = mergeParticipantUpdate(list, "p_alice", {
      currentBreakoutRoomId: "br_1",
      helpRequestedRoomId: "br_1",
    });
    expect(inRoom[0].currentBreakoutRoomId).toBe("br_1");
    expect(inRoom[0].helpRequestedRoomId).toBe("br_1");

    // Returning to Main Stage clears currentBreakoutRoomId
    const backOnMain = mergeParticipantUpdate(inRoom, "p_alice", {
      currentBreakoutRoomId: null,
      helpRequestedRoomId: null,
    });
    expect(backOnMain[0].currentBreakoutRoomId).toBeNull();
    expect(backOnMain[0].helpRequestedRoomId).toBeNull();
  });
});

describe("In-Meeting Co-Design Studio Engine", () => {
  it("creates balanced default vector and typography layers with custom titles", () => {
    const layers = createDefaultCoDesignLayers({
      headline: "Q4 Growth Campaign Launch",
      subheadline: "Accelerating brand metrics with AI-native creative",
      categoryBadge: "EXCLUSIVE 2026",
      ctaText: "Claim Beta Access →",
    });

    expect(layers).toHaveLength(4);

    const badge = layers.find((l) => l.id === "layer_badge_cat");
    expect(badge).toBeDefined();
    expect(badge?.text).toBe("EXCLUSIVE 2026");
    expect(badge?.type).toBe("badge");
    expect(badge?.borderRadius).toBe(999);

    const headline = layers.find((l) => l.id === "layer_headline_main");
    expect(headline).toBeDefined();
    expect(headline?.text).toBe("Q4 Growth Campaign Launch");
    expect(headline?.fontFamily).toBe("Syne");
    expect(headline?.fontSize).toBeGreaterThanOrEqual(28);

    const cta = layers.find((l) => l.id === "layer_cta_primary");
    expect(cta).toBeDefined();
    expect(cta?.text).toBe("Claim Beta Access →");
  });

  it("applies Brand Harmony Palette themes dynamically across artboard and swatches", () => {
    const defaultLayers = createDefaultCoDesignLayers();
    const initialSession: CoDesignSessionState = {
      active: true,
      title: "Brand Campaign",
      sourceType: "preset",
      hostId: "h1",
      hostName: "Creative Director",
      allowParticipantEdits: true,
      artboardPreset: "square_1080",
      backgroundColor: "#090D16",
      backgroundGradient: "linear-gradient(135deg, #090D16 0%, #151C33 55%, #2A1245 100%)",
      backgroundDim: 30,
      brandPalette: CO_DESIGN_BRAND_PALETTES[0].swatches,
      showSafeZone: false,
      showGrid: false,
      layers: defaultLayers,
      versions: [],
      updatedAt: new Date().toISOString(),
      updatedBy: "Creative Director",
    };

    const rethemed = applyBrandPaletteToCoDesign(
      initialSession,
      "obsidian_gold",
      "Designer Alex"
    );

    const goldPalette = CO_DESIGN_BRAND_PALETTES.find((p) => p.id === "obsidian_gold");
    expect(rethemed.backgroundColor).toBe(goldPalette?.backgroundColor);
    expect(rethemed.brandPalette).toEqual(goldPalette?.swatches);
    expect(rethemed.updatedBy).toBe("Designer Alex");

    const rethemedCta = rethemed.layers.find((l) => l.id === "layer_cta_primary");
    expect(rethemedCta?.fillColor).toBe(goldPalette?.swatches[0]);
  });

  it("supports all 4 industry artboard canvas ratios (1:1, 9:16, 16:9, 3:4)", () => {
    expect(CO_DESIGN_ARTBOARD_PRESETS.square_1080.aspect).toBe("1 / 1");
    expect(CO_DESIGN_ARTBOARD_PRESETS.square_1080.widthPx).toBe(1080);
    expect(CO_DESIGN_ARTBOARD_PRESETS.square_1080.heightPx).toBe(1080);

    expect(CO_DESIGN_ARTBOARD_PRESETS.story_9_16.aspect).toBe("9 / 16");
    expect(CO_DESIGN_ARTBOARD_PRESETS.story_9_16.widthPx).toBe(1080);
    expect(CO_DESIGN_ARTBOARD_PRESETS.story_9_16.heightPx).toBe(1920);

    expect(CO_DESIGN_ARTBOARD_PRESETS.landscape_16_9.aspect).toBe("16 / 9");
    expect(CO_DESIGN_ARTBOARD_PRESETS.landscape_16_9.widthPx).toBe(1920);
    expect(CO_DESIGN_ARTBOARD_PRESETS.landscape_16_9.heightPx).toBe(1080);

    expect(CO_DESIGN_ARTBOARD_PRESETS.poster_3_4.aspect).toBe("3 / 4");
    expect(CO_DESIGN_ARTBOARD_PRESETS.poster_3_4.widthPx).toBe(1200);
    expect(CO_DESIGN_ARTBOARD_PRESETS.poster_3_4.heightPx).toBe(1600);
  });

  it("maintains 5 distinct curated brand palettes with valid swatches", () => {
    expect(CO_DESIGN_BRAND_PALETTES.length).toBeGreaterThanOrEqual(5);
    for (const pal of CO_DESIGN_BRAND_PALETTES) {
      expect(pal.swatches.length).toBeGreaterThanOrEqual(5);
      expect(pal.backgroundColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});
