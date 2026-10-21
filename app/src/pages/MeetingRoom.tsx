import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Users,
  MessageSquare,
  MonitorUp,
  MonitorOff,
  Palette,
  Hand,
  MoreHorizontal,
  PhoneOff,
  LogOut,
  ChevronUp,
  Settings,
  Maximize2,
  Minimize2,
  Share2,
  Sparkles,
  GitBranch,
  LayoutGrid,
  UserSquare2,
  Volume2,
  Check,
  X,
  Bell,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { useSEO } from "../lib/seo";
import { firebaseReady } from "../lib/firebase";
import {
  type MeetingRecord,
  type MeetingParticipant,
  type MeetingChatMessage,
  type MeetingBreakoutRoom,
  type ParticipantRole,
  type ParticipantStatus,
  type SpeakerQueueEntry,
  type AgendaItem,
  type ActionItemStatus,
  type ScreenShareAnnotationStroke,
  subscribeToMeeting,
  getMeetingById,
  updateMeeting,
  updateParticipant,
  admitParticipant,
  admitAllParticipants,
  removeParticipant,
  setMeetingLock,
  endMeetingForAll,
  createBreakoutRoom,
  createMultipleBreakoutRooms,
  updateBreakoutRoom,
  deleteBreakoutRoom,
  assignParticipantToBreakoutRoom,
  autoAssignParticipantsToBreakoutRooms,
  joinBreakoutRoom,
  openAllBreakoutRooms,
  closeAllBreakoutRooms,
  setBreakoutAllowSelfSelect,
  broadcastToBreakoutRooms,
  requestBreakoutHostHelp,
  sendMeetingChatMessage,
  subscribeToMeetingChat,
  sendMeetingReaction,
  subscribeToMeetingReactions,
  generateMeetingIntelligence,
  isMeetingJoinable,
  getMeetingShareDetails,
  sendWebRTCSignal,
  subscribeToWebRTCSignals,
  downloadCalendarIcs,
  normalizeRoomCode,
  setMeetingLiveProofing,
  updateMeetingLaserPointer,
  subscribeToMeetingLaser,
  submitMeetingProofFeedback,
  addMeetingProofingArtwork,
  removeMeetingProofingArtwork,
  updateMockupAnnotations,
  subscribeToMockupAnnotations,
  sendVanishingStroke,
  subscribeToVanishingStrokes,
  DEFAULT_PROOFING_MOCKUPS,
  type ProofingMockupItem,
  type CanvasStroke,
  type CanvasPin,
  type CoDesignLayer,
  type CoDesignCollaboratorCursor,
  type CoDesignArtboardPresetId,
  CO_DESIGN_BRAND_PALETTES,
  CO_DESIGN_ARTBOARD_PRESETS,
  createDefaultCoDesignLayers,
  applyBrandPaletteToCoDesign,
  startMeetingCoDesignSession,
  updateMeetingCoDesignSession,
  stopMeetingCoDesignSession,
  saveCoDesignVersionSnapshot,
  restoreCoDesignVersionSnapshot,
  updateCoDesignCursor,
  subscribeToCoDesignCursors,
  // PRD modules
  queueRaise,
  queueWithdraw,
  queueInviteNext,
  queueAccept,
  queueDecline,
  queueFinish,
  queueSkip,
  addAgendaItem,
  startAgendaItem,
  pauseAgendaItem,
  resumeAgendaItem,
  completeAgendaItem,
  extendAgendaItemTimer,
  deleteAgendaItem,
  proposeActionItem,
  setActionItemApproval,
  updateActionItemStatus,
  deleteActionItem,
  sendScreenShareStroke,
  subscribeToScreenShareAnnotations,
  clearScreenShareAnnotations,
} from "../lib/meetings";
import {
  getMediaDevices,
  getLocalUserMedia,
  getDisplayMediaStream,
  isDisplayMediaSupported,
  detectSharedSurface,
  applyScreenTrackOptimization,
  stopMediaStream,
  createAudioLevelMeter,
  playSpeakerTestSound,
  playMessageNotificationSound,
  playDoorbellChime,
  playHandRaiseChime,
  playSuccessChime,
  triggerHapticFeedback,
  WebRTCMeshSession,
  getVideoSendProfile,
  ConnectionQualityMonitor,
  type PeerQualitySample,
  type MediaDeviceList,
  type DisplaySurfaceType,
  type ScreenCaptureOptimization,
} from "../lib/webrtc";
import { listAllCustomerDesigns, type CustomerDesign } from "../lib/editor-store";
import { computeGalleryLayout } from "../lib/meeting-layout";

/* ------------------------------------------------------------------
   ROBUST VIDEO TILE COMPONENT (Autoplay + Clean SrcObject Binding)
------------------------------------------------------------------- */

function VideoTile({
  stream,
  muted = false,
  className = "w-full h-full object-cover",
  isMirrored = false,
  videoRefExternal,
}: {
  stream: MediaStream | null;
  muted?: boolean;
  className?: string;
  isMirrored?: boolean;
  videoRefExternal?: React.MutableRefObject<HTMLVideoElement | null>;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (videoRefExternal) {
      videoRefExternal.current = videoEl;
    }
    if (!videoEl) return;
    if (stream) {
      videoEl.srcObject = stream;
      const playPromise = videoEl.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn("Video autoplay notice:", err);
        });
      }

      const handleTrackUpdate = () => {
        if (videoEl && videoEl.paused) {
          videoEl.play().catch(() => {});
        }
      };

      stream.addEventListener("addtrack", handleTrackUpdate);
      stream.addEventListener("removetrack", handleTrackUpdate);
      stream.getVideoTracks().forEach((t) => {
        t.addEventListener("unmute", handleTrackUpdate);
      });

      return () => {
        stream.removeEventListener("addtrack", handleTrackUpdate);
        stream.removeEventListener("removetrack", handleTrackUpdate);
        stream.getVideoTracks().forEach((t) => {
          t.removeEventListener("unmute", handleTrackUpdate);
        });
      };
    } else {
      videoEl.srcObject = null;
    }
  }, [stream, videoRefExternal]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      {...({ "webkit-playsinline": "true" } as any)}
      muted={muted}
      className={`${className} ${isMirrored ? "transform -scale-x-100" : ""}`}
    />
  );
}

/* ------------------------------------------------------------------
   ZOOM-STYLE LIVE MEETING ROOM & LOBBY (2026 Production Standard)
   - Pre-meeting lobby with hardware diagnostics (mic VU meter, cam, speaker)
   - Real-time WebRTC multi-peer video & audio mesh signaling
   - Waiting room with host admission controls
   - Responsive multi-participant video grid & screen share spotlight
   - Real-time in-meeting chat, emoji reactions, hand raising
   - Instant Share Meeting modal (Link, WhatsApp, Email, .ICS)
   - Host moderation: mute, stop video, kick, lock meeting, end for all
------------------------------------------------------------------- */

export type ProofingTool = "laser" | "pen" | "vanishing" | "highlighter" | "arrow" | "rect" | "circle" | "pin";

export default function MeetingRoom() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();

  useSEO({
    title: "Studio Meeting Room | Social Kon10",
    description: "Secure, high-definition studio video conference and live collaboration.",
  });

  // Meeting State
  const [meeting, setMeeting] = useState<MeetingRecord | null>(null);
  const [loadingMeeting, setLoadingMeeting] = useState(true);
  const [passcode, setPasscode] = useState(() => {
    if (typeof window === "undefined") return "";
    const params = new URLSearchParams(window.location.search);
    return (params.get("pass") || params.get("passcode") || "").trim();
  });
  const [displayName, setDisplayName] = useState(user?.displayName || user?.email?.split("@")[0] || "Guest Participant");
  // Stable per-tab participant identity, scoped to the room. Previously a
  // fresh id was minted on EVERY mount — a page refresh or remount appended
  // a duplicate participant record (mergeParticipantUpdate upserts by id,
  // so a stable id turns rejoins into clean updates instead of clones).
  const [sessionId] = useState<string>(() => {
    const roomKey = normalizeRoomCode(decodeURIComponent(roomId || ""));
    const storageKey = `sk_meet_session_${roomKey}`;
    try {
      const existing = sessionStorage.getItem(storageKey);
      if (existing) return existing;
      const fresh = `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      sessionStorage.setItem(storageKey, fresh);
      return fresh;
    } catch {
      // storage blocked (private mode) — fall back to an ephemeral id
      return `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    }
  });

  // Duplicate-tab guard: only ONE tab may hold the live seat for this room
  // (Zoom parity — "join from this device instead"). A heartbeat lock in
  // localStorage coordinates between tabs; a crashed tab's lock goes stale
  // after ~12s and is reclaimed automatically.
  const [tabConflict, setTabConflict] = useState(false);
  const tabLockHeldRef = useRef(false);
  const tabLockKey = `sk_meet_activetab_${normalizeRoomCode(decodeURIComponent(roomId || ""))}`;

  // Phase: "lobby" | "waiting_room" | "in_meeting" | "ended"
  const [phase, setPhase] = useState<"lobby" | "waiting_room" | "in_meeting" | "ended">("lobby");

  // Media Devices & Streams
  const [devices, setDevices] = useState<MediaDeviceList>({ audioInputs: [], videoInputs: [], audioOutputs: [] });
  const [selectedAudioInput, setSelectedAudioInput] = useState<string>("");
  const [selectedVideoInput, setSelectedVideoInput] = useState<string>("");
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [micVolume, setMicVolume] = useState(0); // 0 - 100
  const [isTestingSpeaker, setIsTestingSpeaker] = useState(false);
  const [hardwareError, setHardwareError] = useState<string | null>(null);

  // Live Streams
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());

  // WebRTC Mesh Reference
  const meshRef = useRef<WebRTCMeshSession | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);

  // In-Meeting Drawers & Controls
  const [activeDrawer, setActiveDrawer] = useState<"none" | "chat" | "participants" | "intelligence" | "breakouts" | "proofing" | "queue" | "agenda" | "actions">("none");
  const [chatMessages, setChatMessages] = useState<MeetingChatMessage[]>([]);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const prevChatCount = useRef(0);
  const [chatDraft, setChatDraft] = useState("");
  const [chatRecipient] = useState<string>(""); // "" = everyone
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [floatingReactions, setFloatingReactions] = useState<{ id: string; emoji: string; x: number; senderName?: string }[]>([]);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);

  // PRD Module 1 — Speaker Queue
  const [speakerQueueInvite, setSpeakerQueueInvite] = useState<SpeakerQueueEntry | null>(null);
  const speakerQueueInviteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // PRD Module 2 — Agenda / Focus Timer
  const [agendaTimerTick, setAgendaTimerTick] = useState(0); // tick every second
  const [newAgendaTitle, setNewAgendaTitle] = useState("");
  const [newAgendaDuration, setNewAgendaDuration] = useState(5); // minutes
  const [agendaFormOpen, setAgendaFormOpen] = useState(false);

  // PRD Module 4 — Live Action Board
  const [newActionTitle, setNewActionTitle] = useState("");
  const [newActionAssignee, setNewActionAssignee] = useState("");
  const [actionFormOpen, setActionFormOpen] = useState(false);

  // PRD Module 5 — Screen Share Annotation overlay
  const [ssAnnotEnabled, setSsAnnotEnabled] = useState(false);
  const [ssAnnotTool, setSsAnnotTool] = useState<"pen" | "highlight" | "laser" | "arrow">("pen");
  const [ssAnnotColor, setSsAnnotColor] = useState("#ef4444");
  const [ssAnnotStrokes, setSsAnnotStrokes] = useState<ScreenShareAnnotationStroke[]>([]);
  const ssAnnotCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const ssAnnotDrawing = useRef(false);
  const ssAnnotPoints = useRef<{ x: number; y: number }[]>([]);

  // Spotlight & Fullscreen & Presentation Modes
  const [pinnedParticipantId, setPinnedParticipantId] = useState<string | null>(null);
  const [autoSpotlightActiveSpeaker, setAutoSpotlightActiveSpeaker] = useState(false);
  // Zoom-style view mode + smart gallery layout state (pure UI — never
  // touches media tracks or signaling).
  const [viewMode, setViewMode] = useState<"gallery" | "speaker">("gallery");
  const [galleryPage, setGalleryPage] = useState(0);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const lastManualPinRef = useRef(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showScreenShareMenu, setShowScreenShareMenu] = useState(false);
  const [screenShareOptimizeFor, setScreenShareOptimizeFor] = useState<ScreenCaptureOptimization>("detail");
  const [screenShareWithAudio, setScreenShareWithAudio] = useState<boolean>(true);
  const [sharedSurfaceInfo, setSharedSurfaceInfo] = useState(() => detectSharedSurface(null));
  const [screenStageZoom, setScreenStageZoom] = useState<number>(1);
  const [screenStagePan, setScreenStagePan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const screenStageDragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    pinchStartDist?: number;
    pinchStartZoom?: number;
  }>({ active: false, startX: 0, startY: 0, origX: 0, origY: 0 });
  const meetingContainerRef = useRef<HTMLDivElement>(null);

  // 2026 Creative Live Deliverables Proofing & Showcase Canvas State
  const [activeProofTool, setActiveProofTool] = useState<ProofingTool>("laser");
  const [proofStrokeColor, setProofStrokeColor] = useState("#06b6d4"); // Default Cyan
  const [proofStrokeWidth, setProofStrokeWidth] = useState(3);
  const [canvasBackdrop, setCanvasBackdrop] = useState<"slate" | "black" | "white" | "grid" | "checker">("slate");
  const [safeZoneOverlay, setSafeZoneOverlay] = useState<
    | "none"
    | "tiktok_reels_shorts"
    | "ig_feed_grid"
    | "facebook_feed_ad"
    | "youtube_thumb"
    | "linkedin_post"
    | "print_bleed"
    | "thirds"
    | "golden_ratio"
  >("none");

  // Markup Annotations
  const [mockupStrokes, setMockupStrokes] = useState<CanvasStroke[]>([]);
  const [mockupPins, setMockupPins] = useState<CanvasPin[]>([]);
  const [vanishingStrokes, setVanishingStrokes] = useState<CanvasStroke[]>([]);
  const [undoStack, setUndoStack] = useState<{ strokes: CanvasStroke[]; pins: CanvasPin[] }[]>([]);
  const [redoStack, setRedoStack] = useState<{ strokes: CanvasStroke[]; pins: CanvasPin[] }[]>([]);

  // In-Progress Drawing
  const [isDrawing, setIsDrawing] = useState(false);
  const [activeDrawingPoints, setActiveDrawingPoints] = useState<{ x: number; y: number }[]>([]);

  // Right-Click Context Menu State (Appears right under cursor)
  const [canvasContextMenu, setCanvasContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    canvasX: number;
    canvasY: number;
  } | null>(null);

  // Pin Drop & Comment Details
  const [pendingPinCoord, setPendingPinCoord] = useState<{ x: number; y: number } | null>(null);
  const [pinCommentDraft, setPinCommentDraft] = useState("");
  const [selectedPinDetail, setSelectedPinDetail] = useState<CanvasPin | null>(null);
  const [showClearConfirmModal, setShowClearConfirmModal] = useState(false);

  // Approved Deliverables Archive & Sign-Off State
  const [showApprovedArchiveModal, setShowApprovedArchiveModal] = useState(false);

  // A/B Revision Split Comparison State
  const [compareMode, setCompareMode] = useState(false);
  const [compareMockupIdx, setCompareMockupIdx] = useState(1);
  const [compareSplitPos, setCompareSplitPos] = useState(50); // 0-100%

  const [proofingIndex, setProofingIndex] = useState(0);
  const [laserPointer, setLaserPointer] = useState<{ x: number; y: number; active: boolean; senderName?: string }>({ x: 50, y: 50, active: false });
  const [isProofingMaximized, setIsProofingMaximized] = useState(false);
  const [proofZoom, setProofZoom] = useState(1);
  const [proofFeedbackDraft, setProofFeedbackDraft] = useState("");
  const [dismissedProofBannerKey, setDismissedProofBannerKey] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Live Studio Co-Design & Broadcast State
  const [showStudioCoDesignModal, setShowStudioCoDesignModal] = useState(false);
  const [isStudioBroadcasting, setIsStudioBroadcasting] = useState(false);
  const [clientDesigns, setClientDesigns] = useState<CustomerDesign[]>([]);
  const [loadingClientDesigns, setLoadingClientDesigns] = useState(false);

  // In-Meeting Synchronized Co-Design Studio Stage State
  const [selectedCoDesignLayerId, setSelectedCoDesignLayerId] = useState<string | null>(null);
  const [coDesignCursors, setCoDesignCursors] = useState<Map<string, CoDesignCollaboratorCursor>>(new Map());
  const [showCoDesignSnapshotsModal, setShowCoDesignSnapshotsModal] = useState(false);
  const [newSnapshotLabel, setNewSnapshotLabel] = useState("");
  const [showCoDesignThemeMenu, setShowCoDesignThemeMenu] = useState(false);
  const [showCoDesignPresetsMenu, setShowCoDesignPresetsMenu] = useState(false);
  const [showLayerInspector, setShowLayerInspector] = useState(false);
  const coDesignCanvasRef = useRef<HTMLDivElement>(null);
  const coDesignDragRef = useRef<{
    layerId: string;
    startClientX: number;
    startClientY: number;
    origX: number;
    origY: number;
    containerWidth: number;
    containerHeight: number;
  } | null>(null);

  useEffect(() => {
    if (showStudioCoDesignModal) {
      setLoadingClientDesigns(true);
      listAllCustomerDesigns()
        .then((designs) => setClientDesigns(designs))
        .catch(() => {})
        .finally(() => setLoadingClientDesigns(false));
    }
  }, [showStudioCoDesignModal]);

  // Artwork Upload & Management State
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadCategory, setUploadCategory] = useState("Social Campaign");
  const [uploadNotes, setUploadNotes] = useState("");
  const [uploadImageUrl, setUploadImageUrl] = useState("");
  const [uploadImagePreview, setUploadImagePreview] = useState<string | null>(null);
  const [isUploadingArtwork, setIsUploadingArtwork] = useState(false);
  const artworkFileInputRef = useRef<HTMLInputElement>(null);

  // Dynamic Proofing Mockups from meeting document
  const proofingMockups: ProofingMockupItem[] =
    meeting?.liveProofing?.mockups && meeting.liveProofing.mockups.length > 0
      ? meeting.liveProofing.mockups
      : DEFAULT_PROOFING_MOCKUPS;

  const activeMockup: ProofingMockupItem =
    proofingMockups[Math.min(proofingIndex, proofingMockups.length - 1)] || proofingMockups[0];

  const [showPermissionGuide, setShowPermissionGuide] = useState(false);
  const [showMobileActionsSheet, setShowMobileActionsSheet] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showDeviceSettingsModal, setShowDeviceSettingsModal] = useState(false);
  const [isRequestingMedia, setIsRequestingMedia] = useState(false);

  // Breakout Rooms State
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomTopic, setNewRoomTopic] = useState("");
  const [breakoutTimerMinutes, setBreakoutTimerMinutes] = useState<number>(15);
  const [breakoutQuickCount, setBreakoutQuickCount] = useState<number>(2);
  const [breakoutBroadcastDraft, setBreakoutBroadcastDraft] = useState("");
  const [dismissedBroadcastId, setDismissedBroadcastId] = useState<string | null>(null);
  const [editingBreakoutRoomId, setEditingBreakoutRoomId] = useState<string | null>(null);
  const [editingBreakoutName, setEditingBreakoutName] = useState("");
  const [editingBreakoutTopic, setEditingBreakoutTopic] = useState("");
  const [chatScope, setChatScope] = useState<"room" | "everyone">("room");
  const [breakoutRemainingSeconds, setBreakoutRemainingSeconds] = useState<number | null>(null);

  // Lets the actual host claim host controls when they aren't auto-recognized:
  // demo mode has no auth at all, and live-mode hosts may simply be signed out.
  const [claimedHost, setClaimedHost] = useState(false);

  const isHost = Boolean(
    meeting && (
      isAdmin ||
      claimedHost ||
      user?.email?.toLowerCase().trim() === "socialkon10@gmail.com" ||
      user?.email?.toLowerCase().trim() === "admin@socialkon10.pro" ||
      (user?.email && meeting.hostEmail && user.email.toLowerCase().trim() === meeting.hostEmail.toLowerCase().trim()) ||
      (user?.uid && meeting.hostId && user.uid === meeting.hostId)
    )
  );

  const hostParticipant = meeting?.participants.find((p) => p.role === "host");
  // Single stable identity: the host reuses their Firestore participant record
  // id, guests use their ephemeral session id. This guarantees signaling,
  // remote streams, moderation updates and the people list all key off the
  // SAME id — mismatched dual ids previously made the host invisible to guests.
  const myParticipantId = isHost && hostParticipant ? hostParticipant.id : sessionId;
  const effectiveMyId = myParticipantId;

  const activeParticipants = (meeting?.participants || [])
    .filter((p) => p.status === "joined" || p.status === "admitted")
    .filter((p, idx, arr) => {
      if (p.role === "host") {
        return arr.findIndex((x) => x.role === "host") === idx;
      }
      return arr.findIndex((x) => x.id === p.id) === idx;
    });

  const waitingParticipants = (meeting?.participants || [])
    .filter((p) => p.status === "waiting" && p.role !== "host")
    .filter((p, idx, arr) => arr.findIndex((x) => x.id === p.id) === idx);

  // Breakout Rooms Computed Context
  const breakoutRooms: MeetingBreakoutRoom[] = meeting?.breakoutRooms || [];
  const openBreakoutRooms = breakoutRooms.filter((r) => r.status === "open");
  const myParticipantRecord = activeParticipants.find(
    (p) => p.id === myParticipantId || (isHost && p.role === "host")
  );
  const myCurrentBreakoutRoomId = myParticipantRecord?.currentBreakoutRoomId || null;
  const myActiveBreakoutRoom =
    breakoutRooms.find((r) => r.id === myCurrentBreakoutRoomId && r.status !== "closed") || null;
  const myAssignedBreakoutRoom =
    breakoutRooms.find((r) => (r.assignedParticipants || []).includes(myParticipantId) && r.status === "open") || null;
  const breakoutHelpRequests = activeParticipants.filter((p) => Boolean(p.helpRequestedRoomId));

  const allOtherConnectedParticipants = activeParticipants.filter((p) => {
    if (p.id === effectiveMyId || p.id === myParticipantId) return false;
    if (isHost && p.role === "host") return false;
    if (user?.email && p.email && p.email.toLowerCase().trim() === user.email.toLowerCase().trim()) return false;
    return true;
  });

  // Scope the video/audio stage to participants in the SAME room (Main Stage vs Active Breakout Room)
  const otherConnectedParticipants = allOtherConnectedParticipants.filter(
    (p) => (p.currentBreakoutRoomId || null) === (myActiveBreakoutRoom ? myActiveBreakoutRoom.id : null)
  );

  // 0b. Smart gallery layout — measure the stage and compute the optimal
  // cols/rows (and pagination) from viewport size. Pure layout math; a
  // relayout never renegotiates or remounts media.
  useEffect(() => {
    if (phase !== "in_meeting") return;
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      setStageSize((prev) =>
        Math.abs(prev.width - rect.width) < 1 && Math.abs(prev.height - rect.height) < 1
          ? prev
          : { width: rect.width, height: rect.height }
      );
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [phase]);

  const galleryTileCount = 1 + otherConnectedParticipants.length;
  const galleryLayout = useMemo(
    () =>
      computeGalleryLayout({
        width: stageSize.width || 1280,
        height: stageSize.height || 720,
        count: Math.max(1, galleryTileCount),
      }),
    [stageSize.width, stageSize.height, galleryTileCount]
  );
  const galleryPageSafe = Math.min(galleryPage, Math.max(0, galleryLayout.pages - 1));

  // Page 0 always leads with the local tile, so remotes fill perPage-1 slots
  // there and a full page afterwards. Keys stay the participant id — paging
  // never remounts a tile that is still visible.
  const pagedRemoteParticipants = useMemo(() => {
    const per = galleryLayout.perPage;
    const start = galleryPageSafe === 0 ? 0 : galleryPageSafe * per - 1;
    const take = galleryPageSafe === 0 ? per - 1 : per;
    return otherConnectedParticipants.slice(start, start + take);
  }, [otherConnectedParticipants, galleryLayout.perPage, galleryPageSafe]);

  // 0. Duplicate-Tab Seat Lock — one live tab per room (Zoom parity:
  // "Join from this device"). A heartbeat lock in localStorage coordinates
  // between tabs; a crashed tab's lock goes stale after ~12s and is then
  // reclaimed automatically. handleJoinFromLobby checks readTabLock BEFORE
  // creating a participant record so a second tab never spawns a clone.
  const readTabLock = useCallback((): { sessionId: string; ts: number } | null => {
    try {
      return JSON.parse(localStorage.getItem(tabLockKey) || "null") as { sessionId: string; ts: number } | null;
    } catch {
      return null;
    }
  }, [tabLockKey]);

  const writeTabLock = useCallback(() => {
    try {
      localStorage.setItem(tabLockKey, JSON.stringify({ sessionId, ts: Date.now() }));
    } catch {
      // storage blocked (private mode) — the seat lock is best-effort only
    }
  }, [tabLockKey, sessionId]);

  const leaveMeetingFnRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (tabConflict) return; // takeover screen is up — do not touch the lock
    if (phase !== "waiting_room" && phase !== "in_meeting") return;
    const current = readTabLock();
    if (current && Date.now() - current.ts < 12000 && current.sessionId !== sessionId && !tabLockHeldRef.current) {
      setTabConflict(true);
      return;
    }
    writeTabLock();
    tabLockHeldRef.current = true;
    const heartbeat = setInterval(() => {
      if (tabLockHeldRef.current) writeTabLock();
      const latest = readTabLock();
      if (latest && latest.sessionId !== sessionId) {
        // Another tab took over the seat — bow out gracefully.
        clearInterval(heartbeat);
        tabLockHeldRef.current = false;
        toast.info("You joined this meeting from another tab — this one was disconnected.");
        void leaveMeetingFnRef.current();
      }
    }, 5000);
    return () => {
      clearInterval(heartbeat);
      const latest = readTabLock();
      if (latest?.sessionId === sessionId) {
        try {
          localStorage.removeItem(tabLockKey);
        } catch {
          // best-effort cleanup
        }
      }
      tabLockHeldRef.current = false;
    };
  }, [phase, sessionId, tabConflict, tabLockKey, readTabLock, writeTabLock]);

  // 1. Load & Subscribe to Meeting
  useEffect(() => {
    const cleanRoomId = normalizeRoomCode(decodeURIComponent(roomId || ""));
    if (!cleanRoomId) {
      setLoadingMeeting(false);
      return;
    }
    setLoadingMeeting(true);
    const unsub = subscribeToMeeting(cleanRoomId, (m) => {
      setMeeting(m);
      setLoadingMeeting(false);

      if (m?.status === "completed") {
        setPhase("ended");
      }
    });

    return () => unsub();
  }, [roomId]);

  // 2. Refresh available media devices on load & probe permissions
  const prevAudioDev = useRef<string>("");
  const prevVideoDev = useRef<string>("");

  useEffect(() => {
    getMediaDevices().then((devs) => {
      setDevices(devs);
      if (devs.audioInputs.length > 0 && !selectedAudioInput) {
        prevAudioDev.current = devs.audioInputs[0].deviceId;
        setSelectedAudioInput(devs.audioInputs[0].deviceId);
      }
      if (devs.videoInputs.length > 0 && !selectedVideoInput) {
        prevVideoDev.current = devs.videoInputs[0].deviceId;
        setSelectedVideoInput(devs.videoInputs[0].deviceId);
      }
    });
  }, []);

  // 3. Acquire Local User Media (Persistent across Lobby & Meeting with auto-probe)
  const requestMediaPermissions = async (silentOnMount = false) => {
    setIsRequestingMedia(true);
    try {
      const s = await getLocalUserMedia({
        audioDeviceId: selectedAudioInput || undefined,
        videoDeviceId: selectedVideoInput || undefined,
        audio: true,
        video: true,
      });
      s.getAudioTracks().forEach((t) => (t.enabled = !isMicMuted));
      s.getVideoTracks().forEach((t) => (t.enabled = !isVideoOff));
      setLocalStream(s);
      setHardwareError(null);
      setShowPermissionGuide(false);
      meshRef.current?.setLocalStream(s);
      localStorage.setItem("sk_media_permission_allowed", "true");

      // Re-enumerate devices after permission is granted — browsers only populate
      // real device labels (e.g. "FaceTime Camera") once a getUserMedia call succeeds.
      const refreshedDevices = await getMediaDevices();
      setDevices(refreshedDevices);
      if (refreshedDevices.audioInputs.length > 0 && !selectedAudioInput) {
        setSelectedAudioInput(refreshedDevices.audioInputs[0].deviceId);
      }
      if (refreshedDevices.videoInputs.length > 0 && !selectedVideoInput) {
        setSelectedVideoInput(refreshedDevices.videoInputs[0].deviceId);
      }

      if (!silentOnMount) {
        toast.success("Camera & microphone connected!");
      }
    } catch (err: any) {
      console.warn("Hardware media notice:", err);
      const errMsg = err?.message || String(err);
      const isBlocked =
        errMsg.includes("denied") ||
        errMsg.includes("not allowed") ||
        errMsg.includes("NotAllowedError") ||
        errMsg.includes("Permission");
      if (isBlocked) {
        localStorage.removeItem("sk_media_permission_allowed");
        setHardwareError(
          "Permission blocked in browser settings. Follow the guide below to enable camera access."
        );
        if (!silentOnMount) {
          setShowPermissionGuide(true);
          toast.error("Camera & microphone access blocked in browser settings.");
        }
      } else if (!silentOnMount) {
        setHardwareError("Camera access notice: Tap 'Guide' to allow permissions in your address bar.");
        setShowPermissionGuide(true);
      }
    } finally {
      setIsRequestingMedia(false);
    }
  };

  // Auto-acquire media on mount if permissions were granted or previously allowed
  useEffect(() => {
    let mounted = true;
    const probeAndAcquire = async () => {
      if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) return;
      const previouslyAllowed = localStorage.getItem("sk_media_permission_allowed") === "true";

      let permissionGranted = previouslyAllowed;

      // Permissions API: probe "camera" and "microphone" separately.
      // Firefox does not support these permission names and throws a TypeError —
      // each query is wrapped individually so one failure doesn't block the other.
      if (!permissionGranted && navigator.permissions?.query) {
        try {
          const camQuery = await navigator.permissions.query({ name: "camera" as PermissionName });
          if (camQuery.state === "granted") permissionGranted = true;
        } catch {
          // "camera" not a valid permission name in Firefox — fall through
        }
        if (!permissionGranted) {
          try {
            const micQuery = await navigator.permissions.query({ name: "microphone" as PermissionName });
            if (micQuery.state === "granted") permissionGranted = true;
          } catch {
            // "microphone" not supported — fall through
          }
        }
      }

      if (mounted && permissionGranted) {
        requestMediaPermissions(true);
      }
    };

    probeAndAcquire();
    return () => {
      mounted = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Only re-request if user explicitly changed hardware device in the dropdown
  useEffect(() => {
    if (phase === "ended" || !localStream) return;
    if (
      (selectedAudioInput && selectedAudioInput !== prevAudioDev.current) ||
      (selectedVideoInput && selectedVideoInput !== prevVideoDev.current)
    ) {
      prevAudioDev.current = selectedAudioInput;
      prevVideoDev.current = selectedVideoInput;
      requestMediaPermissions();
    }
  }, [selectedAudioInput, selectedVideoInput, phase]);

  const micVolumeRef = useRef(0);
  useEffect(() => {
    if (!localStream) return;
    const cleanup = createAudioLevelMeter(localStream, (vol) => {
      micVolumeRef.current = vol;
      setMicVolume(vol);
    });
    return () => {
      if (cleanup) cleanup();
    };
  }, [localStream]);

  // Clean up media tracks ONLY when leaving the page entirely
  useEffect(() => {
    return () => {
      stopMediaStream(localStream);
      stopMediaStream(screenStream);
      meshRef.current?.closeAll();
    };
  }, []);

  // Mark "left" when the tab/window closes or navigates away — otherwise the
  // participant record stays "joined" forever and haunts the people list.
  useEffect(() => {
    const onPageHide = () => {
      if (meeting && (phase === "in_meeting" || phase === "waiting_room")) {
        updateParticipant(meeting.id, myParticipantId, {
          status: "left",
          leftAt: new Date().toISOString(),
        });
      }
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [meeting, phase, myParticipantId]);

  // 4. Initialize WebRTC Multi-Peer Mesh during Meeting
  const knownPeersRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!meeting || phase !== "in_meeting") return;
    const knownPeers = knownPeersRef.current;

    const mesh = new WebRTCMeshSession({
      myParticipantId,
      localStream,
      onSignalOut: (targetParticipantId, type, payload) => {
        sendWebRTCSignal({
          meetingId: meeting.id,
          fromParticipantId: myParticipantId,
          toParticipantId: targetParticipantId,
          type,
          payload,
        });
      },
      onRemoteTrack: (partId, stream) => {
        setRemoteStreams((prev) => new Map(prev).set(partId, stream));
      },
      onRemoteTrackRemoved: (partId) => {
        setRemoteStreams((prev) => {
          const next = new Map(prev);
          next.delete(partId);
          return next;
        });
      },
    });

    meshRef.current = mesh;
    knownPeers.clear();

    // Connect to other active participants (negotiation is glare-safe: both
    // sides may offer and the polite/impolite rule resolves collisions)
    meeting.participants
      .filter((p) => p.id !== myParticipantId && (p.status === "joined" || p.status === "admitted"))
      .forEach((p) => {
        knownPeers.add(p.id);
        mesh.connectToPeer(p.id);
      });

    // Subscribe to incoming WebRTC signals
    const unsubSignals = subscribeToWebRTCSignals(meeting.id, myParticipantId, (sig) => {
      mesh.handleIncomingSignal(sig.fromParticipantId, sig.type as any, sig.payload);
    });

    return () => {
      unsubSignals();
      mesh.closeAll();
      meshRef.current = null;
      knownPeers.clear();
    };
  }, [meeting?.id, phase, myParticipantId]);

  // 4b. Keep peer connections in sync as participants join / are admitted /
  // leave mid-meeting. Without this, anyone arriving after the mesh was built
  // would never exchange audio/video with the people already inside.
  useEffect(() => {
    if (!meeting || phase !== "in_meeting" || !meshRef.current) return;
    const mesh = meshRef.current;
    const knownPeers = knownPeersRef.current;

    const activeIds = new Set(
      meeting.participants
        .filter((p) => p.id !== myParticipantId && (p.status === "joined" || p.status === "admitted"))
        .map((p) => p.id)
    );

    activeIds.forEach((id) => {
      if (!knownPeers.has(id)) {
        knownPeers.add(id);
        mesh.connectToPeer(id);
      }
    });

    knownPeers.forEach((id) => {
      if (!activeIds.has(id)) {
        knownPeers.delete(id);
        mesh.closePeer(id);
      }
    });
  }, [meeting, phase, myParticipantId]);

  // 5. Subscribe to In-Meeting Chat with Audio Chime & Haptics
  useEffect(() => {
    if (!meeting || phase !== "in_meeting") return;
    const unsubChat = subscribeToMeetingChat(meeting.id, (msgs) => {
      if (msgs.length > prevChatCount.current && prevChatCount.current > 0) {
        const latest = msgs[msgs.length - 1];
        if (latest.senderId !== myParticipantId) {
          playMessageNotificationSound();
          triggerHapticFeedback(50);
          if (activeDrawer !== "chat") {
            setUnreadChatCount((c) => c + (msgs.length - prevChatCount.current));
          }
        }
      }
      prevChatCount.current = msgs.length;
      setChatMessages(msgs);
    });
    return () => unsubChat();
  }, [meeting?.id, phase, activeDrawer, myParticipantId]);

  // 6. Subscribe to Real-Time Emoji Reactions (Glass Splash Physics)
  useEffect(() => {
    if (!meeting || phase !== "in_meeting") return;
    const unsubRx = subscribeToMeetingReactions(meeting.id, (rx) => {
      setFloatingReactions((prev) => {
        if (prev.some((r) => r.id === rx.id)) return prev;
        return [...prev, { id: rx.id, emoji: rx.emoji, x: rx.x, senderName: rx.senderName }];
      });
      setTimeout(() => {
        setFloatingReactions((prev) => prev.filter((r) => r.id !== rx.id));
      }, 2800);
    });
    return () => unsubRx();
  }, [meeting?.id, phase]);

  // 7. Watch for Hand Raise events (Chime & Haptic Alert)
  const prevRaisedHands = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!meeting || phase !== "in_meeting") return;
    const currentRaised = new Set(
      meeting.participants.filter((p) => p.isHandRaised).map((p) => p.id)
    );
    currentRaised.forEach((id) => {
      if (!prevRaisedHands.current.has(id)) {
        const person = meeting.participants.find((p) => p.id === id);
        if (person && person.id !== myParticipantId) {
          playHandRaiseChime();
          triggerHapticFeedback([200, 100, 200]);
          toast.info(`✋ ${person.displayName} raised their hand!`, { duration: 4500 });
        }
      }
    });
    prevRaisedHands.current = currentRaised;
  }, [meeting?.participants, phase, myParticipantId]);

  // 8. Watch Participant Status changes (e.g. host admits or removes participant)
  const localStreamRef = useRef<MediaStream | null>(null);
  localStreamRef.current = localStream;
  const screenStreamRef = useRef<MediaStream | null>(null);
  screenStreamRef.current = screenStream;
  useEffect(() => {
    if (!meeting) return;
    const me = meeting.participants.find((p) => p.id === myParticipantId);
    if (!me) return;

    if (me.status === "admitted" && phase === "waiting_room") {
      setPhase("in_meeting");
      toast.success("You have been admitted to the meeting!");
    } else if (me.status === "removed") {
      stopMediaStream(localStreamRef.current);
      stopMediaStream(screenStreamRef.current);
      meshRef.current?.closeAll();
      setPhase("ended");
      toast.error("You have been removed from the meeting by the host.");
    }
  }, [meeting, myParticipantId, phase]);

  // 8b. Active-speaker detection (Zoom-style green ring). Remote streams get a
  // lightweight VU meter each; the local mic reuses the existing micVolume ref.
  const [speakingIds, setSpeakingIds] = useState<Set<string>>(new Set());
  const speakerLevelsRef = useRef<Map<string, number>>(new Map());
  const isMicMutedRef = useRef(isMicMuted);
  isMicMutedRef.current = isMicMuted;
  useEffect(() => {
    if (phase !== "in_meeting") return;
    const levels = speakerLevelsRef.current;
    const cleanups: (() => void)[] = [];
    remoteStreams.forEach((stream, id) => {
      if (stream.getAudioTracks().length === 0) return;
      cleanups.push(createAudioLevelMeter(stream, (v) => levels.set(id, v)));
    });
    const interval = setInterval(() => {
      setSpeakingIds((prev) => {
        const next = new Set<string>();
        levels.forEach((v, id) => {
          if (v > 12) next.add(id);
        });
        if (!isMicMutedRef.current && micVolumeRef.current > 12) next.add(myParticipantId);
        if (prev.size === next.size && [...prev].every((x) => next.has(x))) return prev;
        return next;
      });
    }, 400);
    return () => {
      cleanups.forEach((c) => c());
      clearInterval(interval);
      levels.clear();
    };
  }, [remoteStreams, phase, myParticipantId]);

  // 8b-2. Speaker view / auto-spotlight follow: pin the loudest current
  // speaker. A manual pin (tile click) holds the stage for a few seconds
  // before follow resumes, so rapid exchanges don't make the view flicker.
  useEffect(() => {
    const follow = viewMode === "speaker" || autoSpotlightActiveSpeaker;
    if (!follow || phase !== "in_meeting") return;
    if (speakingIds.size === 0) return;
    if (Date.now() - lastManualPinRef.current < 4000) return;
    let bestId: string | null = null;
    let bestLevel = -1;
    speakingIds.forEach((id) => {
      const lvl = id === myParticipantId ? micVolumeRef.current : speakerLevelsRef.current.get(id) ?? 0;
      if (lvl > bestLevel) {
        bestLevel = lvl;
        bestId = id;
      }
    });
    if (bestId && bestId !== pinnedParticipantId) {
      setPinnedParticipantId(bestId);
    }
  }, [speakingIds, viewMode, autoSpotlightActiveSpeaker, phase, myParticipantId, pinnedParticipantId]);

  // 8b-3. Zoom-style keyboard shortcuts: M = mic, V = camera, H = hand.
  // Ignored while typing in any field or when a drawer input has focus.
  useEffect(() => {
    if (phase !== "in_meeting") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      const key = e.key.toLowerCase();
      if (key === "m") {
        e.preventDefault();
        handleToggleMic();
      } else if (key === "v") {
        e.preventDefault();
        handleToggleVideo();
      } else if (key === "h") {
        e.preventDefault();
        handleToggleRaiseHand();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);
  // 8b-4. Adaptive video send profile (2026 mesh best practice): outgoing
  // camera quality steps DOWN as the room fills — mesh uplink cost scales
  // ~N², and an uncapped 720p stream per peer is exactly what makes audio
  // choppy. Screen share keeps full resolution for legible text. Applies
  // live via sender parameters — no renegotiation, no media restart.
  useEffect(() => {
    if (phase !== "in_meeting") return;
    meshRef.current?.setVideoProfile(
      getVideoSendProfile({ participantCount: activeParticipants.length, isScreenSharing })
    );
  }, [phase, activeParticipants.length, isScreenSharing]);

  // 8b-5. Connection quality telemetry + gentle auto-degrade. Polls inbound
  // RTP stats per peer every 3s; two consecutive "poor" readings halve the
  // outgoing bitrate (floor 150 kbps), sustained "good" restores it. This
  // is the same congestion-response loop Zoom/Meet run, adapted for mesh.
  const [peerQuality, setPeerQuality] = useState<Record<string, PeerQualitySample>>({});
  const qualityMonitorRef = useRef<ConnectionQualityMonitor | null>(null);
  const poorStreakRef = useRef(0);
  const bitrateScaleRef = useRef(1);
  useEffect(() => {
    if (phase !== "in_meeting") return;
    if (!qualityMonitorRef.current) qualityMonitorRef.current = new ConnectionQualityMonitor();
    const monitor = qualityMonitorRef.current;
    let cancelled = false;
    const poll = async () => {
      const mesh = meshRef.current;
      if (!mesh || cancelled) return;
      const entries: [string, PeerQualitySample][] = [];
      for (const id of mesh.getPeerIds()) {
        const pc = mesh.getPeerConnection(id);
        if (!pc) continue;
        const sample = await monitor.sample(pc);
        if (sample.score > 0) entries.push([id, sample]);
      }
      if (cancelled || entries.length === 0) return;
      setPeerQuality((prev) => {
        const next = { ...prev };
        entries.forEach(([id, s]) => {
          next[id] = s;
        });
        return next;
      });
      const worst = entries.reduce((m, [, s]) => Math.min(m, s.score), 3);
      if (worst === 1) {
        poorStreakRef.current += 1;
        if (poorStreakRef.current >= 2) {
          bitrateScaleRef.current = Math.max(0.25, bitrateScaleRef.current / 2);
        }
      } else {
        poorStreakRef.current = 0;
        if (worst >= 3) {
          bitrateScaleRef.current = Math.min(1, bitrateScaleRef.current * 1.25);
        }
      }
      if (bitrateScaleRef.current < 1) {
        const base = getVideoSendProfile({ participantCount: activeParticipants.length, isScreenSharing });
        mesh.setVideoProfile({
          ...base,
          maxBitrate: Math.max(150_000, Math.round(base.maxBitrate * bitrateScaleRef.current)),
        });
      }
    };
    const interval = setInterval(() => void poll(), 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [phase, activeParticipants.length, isScreenSharing]);

  // 8b-6. Video health watchdog + visibility recovery. Browsers aggressively
  // throttle hidden tabs: decoders freeze, <video> elements end up paused,
  // and nothing fires an event when you come back — the classic "I switched
  // apps and my video was gone" symptom. On visibility/focus restore AND on
  // a light 5s interval, revive any paused video whose stream is still live,
  // and rebind decoders that report playing but carry no frames.
  useEffect(() => {
    if (phase !== "in_meeting") return;
    const reviveVideos = () => {
      document.querySelectorAll<HTMLVideoElement>("video").forEach((v) => {
        const s = v.srcObject as MediaStream | null;
        if (!s) return;
        const liveVideo = s.getVideoTracks().some((t) => t.readyState === "live" && t.enabled && !t.muted);
        const liveAudio = s.getAudioTracks().some((t) => t.readyState === "live" && t.enabled);
        if (!liveVideo && !liveAudio) return;
        if (v.paused) {
          v.play().catch(() => {});
          return;
        }
        // Decoder stall: claims to be playing but has no frame data.
        // Rebinding srcObject forces the pipeline to reattach.
        if (liveVideo && v.readyState < 2) {
          const src = v.srcObject;
          v.srcObject = null;
          v.srcObject = src;
          v.play().catch(() => {});
        }
      });
    };
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      // Two passes: a quick one for the common case, a delayed one that
      // catches tracks which finish renegotiating a moment later.
      setTimeout(reviveVideos, 250);
      setTimeout(reviveVideos, 1500);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    const interval = setInterval(reviveVideos, 5000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      clearInterval(interval);
    };
  }, [phase]);

  // 8b-7. Local track resurrection. Mobile OSes (iOS Safari especially)
  // silently END the camera/mic track while the app is backgrounded; the
  // stream object stays but produces black frames forever. On return,
  // re-acquire dead tracks and swap them into every peer via replaceTrack —
  // no renegotiation, no rejoin, the call just comes back to life.
  const isVideoOffRef = useRef(isVideoOff);
  isVideoOffRef.current = isVideoOff;
  const selectedAudioInputRef = useRef(selectedAudioInput);
  selectedAudioInputRef.current = selectedAudioInput;
  const selectedVideoInputRef = useRef(selectedVideoInput);
  selectedVideoInputRef.current = selectedVideoInput;
  useEffect(() => {
    if (phase !== "in_meeting") return;
    let recovering = false;
    const recoverLocalTracks = async () => {
      if (document.visibilityState !== "visible" || recovering) return;
      const stream = localStreamRef.current;
      if (!stream) return;
      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];
      const videoDead = !isVideoOffRef.current && (!videoTrack || videoTrack.readyState === "ended");
      const audioDead = !isMicMutedRef.current && (!audioTrack || audioTrack.readyState === "ended");
      if (!videoDead && !audioDead) return;
      recovering = true;
      try {
        const fresh = await getLocalUserMedia({
          audioDeviceId: selectedAudioInputRef.current || undefined,
          videoDeviceId: selectedVideoInputRef.current || undefined,
          audio: true,
          video: true,
        });
        fresh.getAudioTracks().forEach((t) => (t.enabled = !isMicMutedRef.current));
        fresh.getVideoTracks().forEach((t) => (t.enabled = !isVideoOffRef.current));
        stopMediaStream(stream);
        setLocalStream(fresh);
        meshRef.current?.setLocalStream(fresh);
        toast.success(videoDead ? "Camera reconnected" : "Microphone reconnected");
      } catch (err) {
        console.warn("Local track recovery failed:", err);
        if (videoDead) setIsVideoOff(true);
        toast.error("Camera/microphone was lost while away — tap to re-enable.", { duration: 6000 });
      } finally {
        recovering = false;
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        // Give the OS a beat to release/re-grant the device before probing.
        setTimeout(() => void recoverLocalTracks(), 400);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [phase]);

  // 8c. Host moderation honored locally: a host flipping your isMuted flag
  // force-mutes your microphone (and an unmute request pings you to speak).
  const prevUnmuteReqRef = useRef<string>("");
  useEffect(() => {
    if (!meeting || phase !== "in_meeting") return;
    const me = meeting.participants.find((p) => p.id === myParticipantId);
    if (!me) return;

    if (me.isMuted && !isMicMuted) {
      setIsMicMuted(true);
      localStream?.getAudioTracks().forEach((t) => (t.enabled = false));
      toast.info("🔇 The host muted your microphone.", { duration: 4500 });
    }

    if (me.unmuteRequestedAt && me.unmuteRequestedAt !== prevUnmuteReqRef.current) {
      prevUnmuteReqRef.current = me.unmuteRequestedAt;
      if (isMicMuted) {
        playHandRaiseChime();
        triggerHapticFeedback([120, 60, 120]);
        toast.info("🎙️ The host is asking you to unmute — tap the mic button to speak.", { duration: 7000 });
      }
    }
  }, [meeting, phase, myParticipantId, isMicMuted, localStream]);

  // 8d. "Come watch live" invitation when someone starts presenting or opens
  // Live Co-Design — everyone else gets a chime + toast + auto-focus banner.
  const prevInviteAtRef = useRef<string>("");
  useEffect(() => {
    const inv = meeting?.liveInvite;
    if (!meeting || phase !== "in_meeting" || !inv) return;
    if (inv.senderId === myParticipantId) return; // the presenter already knows
    if (inv.sentAt === prevInviteAtRef.current) return;
    prevInviteAtRef.current = inv.sentAt;
    if (Date.now() - new Date(inv.sentAt).getTime() > 120000) return;
    playDoorbellChime();
    triggerHapticFeedback([120, 60, 180]);
    const what =
      inv.type === "co_design" ? "launched Live Co-Design" :
      inv.type === "proofing" ? "opened Live Proofing" :
      "started presenting their screen";
    toast.info(`🔴 ${inv.senderName} ${what} — watch the live stage above!`, { duration: 8000 });
  }, [meeting, phase, myParticipantId]);

  // 9. Watch for incoming Waiting Room participants (Host Doorbell Notification)
  // Chime + haptic + PERSISTENT actionable toast + OS Notification + Tab Title Flash
  // Works in both "lobby" (pre-join preview) and "in_meeting" phases so hosts
  // never miss a guest knocking.
  const prevWaitingIdsRef = useRef<Set<string>>(new Set());
  const prevNotifiedPhaseRef = useRef<string>("");
  useEffect(() => {
    if (!meeting || !isHost || (phase !== "in_meeting" && phase !== "lobby")) return;
    if (prevNotifiedPhaseRef.current !== phase) {
      prevNotifiedPhaseRef.current = phase;
      prevWaitingIdsRef.current = new Set();
    }
    const knocking = (meeting.participants || []).filter((p) => p.status === "waiting" && p.role !== "host");
    const currentIds = new Set(knocking.map((p) => p.id));
    const newlyArrived = knocking.filter((p) => !prevWaitingIdsRef.current.has(p.id));
    prevWaitingIdsRef.current = currentIds;

    if (newlyArrived.length > 0) {
      playDoorbellChime();
      triggerHapticFeedback([150, 80, 200]);
      const count = knocking.length;
      const names = knocking.map((p) => p.displayName).join(", ");
      toast.warning(`🔔 ${names} ${count > 1 ? "are" : "is"} waiting in the lobby`, {
        duration: 15000,
        action: {
          label: count > 1 ? "Admit All" : "Admit",
          onClick: () => void admitAllParticipants(meeting.id),
        },
      });

      // Browser / OS Notification when tab is backgrounded or screen-sharing another window
      if (typeof window !== "undefined" && "Notification" in window) {
        if (Notification.permission === "granted") {
          try {
            const n = new Notification(`🔔 Waiting Room: ${meeting.title}`, {
              body: `${names} ${count > 1 ? "are" : "is"} waiting to be admitted.`,
              icon: "/favicon.ico",
              tag: `waiting_${meeting.id}`,
            });
            n.onclick = () => {
              window.focus();
              n.close();
            };
          } catch {
            // ignore notification restrictions
          }
        } else if (Notification.permission === "default") {
          Notification.requestPermission().catch(() => {});
        }
      }
    }
  }, [meeting, isHost, phase]);

  // 9b. Flashing Tab Title & Periodic Gentle Reminder Chime while guests remain waiting
  useEffect(() => {
    if (!meeting || !isHost || (phase !== "in_meeting" && phase !== "lobby")) return;
    const waiting = (meeting.participants || []).filter((p) => p.status === "waiting" && p.role !== "host");
    if (waiting.length === 0) return;

    const baseTitle = `${meeting.title} — Social Kon10 Meet`;
    let toggle = false;
    const titleInterval = window.setInterval(() => {
      toggle = !toggle;
      document.title = toggle
        ? `🔔 (${waiting.length}) Waiting in Lobby! — ${meeting.title}`
        : baseTitle;
    }, 1200);

    // Replay a reminder chime every 35s if someone is still waiting un-admitted
    const reminderInterval = window.setInterval(() => {
      playDoorbellChime();
      triggerHapticFeedback([100, 60, 140]);
    }, 35000);

    return () => {
      window.clearInterval(titleInterval);
      window.clearInterval(reminderInterval);
      document.title = baseTitle;
    };
  }, [meeting, isHost, phase]);

  // 9c. Safety net: reconcile with the server every 3s for both host (in lobby /
  // room) and guests (in waiting_room). Also self-heals a guest's waiting entry
  // if Firestore ever missed or dropped their initial knock.
  const meetingKeyRef = useRef<string>("");
  useEffect(() => {
    meetingKeyRef.current = meeting?.id || "";
  }, [meeting?.id]);
  const waitingGuestInfoRef = useRef({ myParticipantId, displayName, userUid: user?.uid, userEmail: user?.email });
  waitingGuestInfoRef.current = { myParticipantId, displayName, userUid: user?.uid, userEmail: user?.email };
  useEffect(() => {
    if (phase !== "in_meeting" && phase !== "lobby" && phase !== "waiting_room") return;
    let stopped = false;
    const tick = async () => {
      const key = meetingKeyRef.current;
      if (!key) return;
      try {
        const fresh = await getMeetingById(key);
        if (stopped || !fresh) return;
        setMeeting((prev) => {
          if (!prev) return fresh;
          const sig = (m: MeetingRecord) => {
            const pSig = (m.participants || [])
              .map(
                (p) =>
                  `${p.id}:${p.status}:${p.displayName}:${p.currentBreakoutRoomId || ""}:${p.helpRequestedRoomId || ""}`
              )
              .sort()
              .join("|");
            const bSig = (m.breakoutRooms || [])
              .map(
                (r) =>
                  `${r.id}:${r.name}:${r.status}:${(r.assignedParticipants || []).join(",")}:${(r.activeParticipants || []).join(",")}:${r.endsAt || ""}`
              )
              .join("|");
            return `${pSig}#${bSig}#${m.breakoutBroadcast?.id || ""}#${Boolean(m.breakoutAllowSelfSelect)}#${m.coDesignSession?.updatedAt || ""}:${m.coDesignSession?.active ? 1 : 0}`;
          };
          return sig(prev) === sig(fresh) ? prev : fresh;
        });

        // Self-healing knock: if a guest is sitting in the waiting room and their
        // "waiting" record isn't on the server yet, push it immediately.
        if (phase === "waiting_room" && !isHost) {
          const info = waitingGuestInfoRef.current;
          const meOnServer = (fresh.participants || []).find((p) => p.id === info.myParticipantId);
          if (!meOnServer || (meOnServer.status !== "waiting" && meOnServer.status !== "admitted" && meOnServer.status !== "joined" && meOnServer.status !== "removed")) {
            await updateParticipant(fresh.id, info.myParticipantId, {
              id: info.myParticipantId,
              meetingId: fresh.id,
              userId: info.userUid,
              email: info.userEmail || `${(info.displayName || "guest").toLowerCase().replace(/\s+/g, ".")}@guest.local`,
              displayName: (info.displayName || "").trim() || "Participant",
              role: "participant",
              status: "waiting",
              cameraAllowed: true,
              microphoneAllowed: true,
              screenShareAllowed: fresh.screenShareMode !== "disabled",
              chatAllowed: fresh.chatEnabled,
              connectionQuality: "excellent",
            });
          }
        }
      } catch {
        // transient network error — try again next tick
      }
    };
    const timer = window.setInterval(tick, 3000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [isHost, phase]);

  // 10. Listen for Fullscreen State Change
  useEffect(() => {
    const handleFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", handleFs);
    return () => document.removeEventListener("fullscreenchange", handleFs);
  }, []);

  // 10b. Breakout Rooms: Host Broadcast Alert, Help Request Alert, Assignment Prompt & Countdown Timer
  const prevBroadcastIdRef = useRef<string>("");
  useEffect(() => {
    const bc = meeting?.breakoutBroadcast;
    if (!meeting || phase !== "in_meeting" || !bc) return;
    if (bc.id === prevBroadcastIdRef.current) return;
    prevBroadcastIdRef.current = bc.id;
    if (Date.now() - new Date(bc.sentAt).getTime() > 120000) return;
    playMessageNotificationSound();
    triggerHapticFeedback([120, 60, 120]);
    toast.info(`📢 ${bc.senderName} (Broadcast): "${bc.message}"`, { duration: 10000 });
  }, [meeting, phase]);

  const prevHelpRequestsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!meeting || !isHost || phase !== "in_meeting") return;
    const currentSet = new Set<string>();
    const roomsMap = new Map((meeting.breakoutRooms || []).map((r) => [r.id, r]));
    (meeting.participants || []).forEach((p) => {
      if (p.helpRequestedRoomId && p.id !== myParticipantId) {
        const key = `${p.id}:${p.helpRequestedRoomId}`;
        currentSet.add(key);
        if (!prevHelpRequestsRef.current.has(key)) {
          const room = roomsMap.get(p.helpRequestedRoomId);
          playHandRaiseChime();
          triggerHapticFeedback([180, 80, 180]);
          toast.warning(
            `🆘 ${p.displayName} is asking for Host help in "${room?.name || "Breakout Room"}"`,
            {
              duration: 15000,
              action: {
                label: "Join Room",
                onClick: () => {
                  void joinBreakoutRoom(meeting.id, myParticipantId, p.helpRequestedRoomId!);
                  void requestBreakoutHostHelp(meeting.id, p.id, null);
                },
              },
            }
          );
        }
      }
    });
    prevHelpRequestsRef.current = currentSet;
  }, [meeting, isHost, phase, myParticipantId]);

  const prevAssignedRoomIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!meeting || phase !== "in_meeting") return;
    const assignedId = myAssignedBreakoutRoom?.id || null;
    if (
      assignedId &&
      assignedId !== prevAssignedRoomIdRef.current &&
      myCurrentBreakoutRoomId !== assignedId
    ) {
      playDoorbellChime();
      triggerHapticFeedback([100, 60, 120]);
      toast.info(`🔀 You have been assigned to "${myAssignedBreakoutRoom?.name}"`, {
        duration: 12000,
        action: {
          label: "Join Room",
          onClick: () => void joinBreakoutRoom(meeting.id, myParticipantId, assignedId),
        },
      });
    }
    prevAssignedRoomIdRef.current = assignedId;
  }, [meeting, phase, myAssignedBreakoutRoom, myCurrentBreakoutRoomId, myParticipantId]);

  // Live 1s countdown ticker when any open breakout room has an active timer (`endsAt`)
  useEffect(() => {
    const timedRoom = myActiveBreakoutRoom?.endsAt
      ? myActiveBreakoutRoom
      : openBreakoutRooms.find((r) => Boolean(r.endsAt));
    if (!timedRoom?.endsAt || phase !== "in_meeting") {
      setBreakoutRemainingSeconds(null);
      return;
    }
    const updateTicker = () => {
      const diffSec = Math.max(0, Math.floor((new Date(timedRoom.endsAt!).getTime() - Date.now()) / 1000));
      setBreakoutRemainingSeconds(diffSec);
      if (diffSec === 0 && isHost && meeting) {
        void closeAllBreakoutRooms(meeting.id);
        toast.info("⏱️ Breakout timer completed — recalling all participants to the Main Stage.");
      }
    };
    updateTicker();
    const timer = window.setInterval(updateTicker, 1000);
    return () => window.clearInterval(timer);
  }, [myActiveBreakoutRoom, openBreakoutRooms, phase, isHost, meeting]);

  // 11. Synchronize Live Proofing state across host and clients
  const prevProofingActive = useRef(false);
  useEffect(() => {
    if (!meeting || phase !== "in_meeting") return;
    const proofing = meeting.liveProofing;
    if (!proofing) return;

    if (typeof proofing.mockupIndex === "number") {
      setProofingIndex(proofing.mockupIndex);
    }

    if (proofing.laserPointer && Date.now() - proofing.laserPointer.updatedAt < 6000) {
      setLaserPointer({
        x: proofing.laserPointer.x,
        y: proofing.laserPointer.y,
        active: true,
        senderName: proofing.laserPointer.senderName,
      });
    }

    // Audio / chime notification to attendees when host initializes proofing session
    if (proofing.active && !prevProofingActive.current && !isHost) {
      playDoorbellChime();
      triggerHapticFeedback(100);
      toast.info(`🎨 ${proofing.presenterName || "Host"} initialized Live Deliverables Proofing!`, { duration: 6000 });
    }
    prevProofingActive.current = !!proofing.active;
  }, [meeting?.liveProofing, phase, isHost]);

  // 11b. Concept Approval & Sign-Off Real-Time Notification for Host & Attendees
  const prevApprovalsCount = useRef(0);
  useEffect(() => {
    if (!meeting || phase !== "in_meeting") return;
    const approvals = meeting.liveProofing?.approvedDeliverables || [];
    if (approvals.length > prevApprovalsCount.current && prevApprovalsCount.current >= 0) {
      const latest = approvals[approvals.length - 1];
      if (latest) {
        if (latest.approved) {
          playSuccessChime();
          triggerHapticFeedback([100, 50, 100, 50, 200]);
          toast.success(
            `🎉 Concept Approved: "${latest.mockupTitle}" signed off by ${latest.approvedBy}! (${latest.pinsCount} pin notes preserved)`
          );
        } else {
          toast.info(
            `📝 Revision Requested: "${latest.mockupTitle}" by ${latest.approvedBy} (${latest.pinsCount} pin notes recorded)`
          );
        }
      }
    }
    prevApprovalsCount.current = approvals.length;
  }, [meeting?.liveProofing?.approvedDeliverables, phase]);

  // 12. High-speed Laser Pointer Channel
  useEffect(() => {
    if (!meeting || phase !== "in_meeting") return;
    const unsubLaser = subscribeToMeetingLaser(meeting.id, (l) => {
      setLaserPointer({ x: l.x, y: l.y, active: true, senderName: l.senderName });
      setTimeout(() => {
        setLaserPointer((prev) => (prev.x === l.x && prev.y === l.y ? { ...prev, active: false } : prev));
      }, 3500);
    });
    return () => unsubLaser();
  }, [meeting?.id, phase]);

  // 12b. Real-Time In-Meeting Co-Design Session Sync & Announcements
  const prevCoDesignActive = useRef(false);
  useEffect(() => {
    if (!meeting || phase !== "in_meeting") return;
    const session = meeting.coDesignSession;
    if (session?.active && !prevCoDesignActive.current && !isHost) {
      playDoorbellChime();
      triggerHapticFeedback([120, 60, 180]);
      toast.info(`🎨 ${session.hostName || "Host"} launched Live Studio Co-Design!`, {
        duration: 7000,
        action: {
          label: "View Stage",
          onClick: () => {
            setActiveDrawer("none");
            setIsProofingMaximized(false);
          },
        },
      });
    }
    prevCoDesignActive.current = Boolean(session?.active);
  }, [meeting?.coDesignSession?.active, phase, isHost]);

  // 12c. Real-Time Collaborator Cursors on Co-Design Artboard
  useEffect(() => {
    if (!meeting || phase !== "in_meeting" || !meeting.coDesignSession?.active) return;
    const unsubCursors = subscribeToCoDesignCursors(meeting.id, myParticipantId, (c) => {
      setCoDesignCursors((prev) => {
        const next = new Map(prev);
        next.set(c.participantId, c);
        return next;
      });
    });
    const timer = window.setInterval(() => {
      const cutoff = Date.now() - 10000;
      setCoDesignCursors((prev) => {
        let changed = false;
        const next = new Map();
        for (const [k, v] of prev.entries()) {
          if ((v.updatedAt || 0) >= cutoff) {
            next.set(k, v);
          } else {
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 8000);

    return () => {
      unsubCursors();
      window.clearInterval(timer);
    };
  }, [meeting?.id, meeting?.coDesignSession?.active, myParticipantId, phase]);

  // 13. Auto-scroll chat box when new messages arrive
  useEffect(() => {
    if (activeDrawer === "chat") {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, activeDrawer]);

  // 14. Real-Time Markup Annotations & Vanishing Ink Sync for current artwork
  useEffect(() => {
    if (!meeting || phase !== "in_meeting" || !activeMockup?.id) return;

    const unsubAnn = subscribeToMockupAnnotations(meeting.id, activeMockup.id, (data) => {
      setMockupStrokes(data.strokes || []);
      setMockupPins(data.pins || []);
    });

    const unsubVanish = subscribeToVanishingStrokes(meeting.id, activeMockup.id, (stroke) => {
      setVanishingStrokes((prev) => [...prev, stroke]);
      setTimeout(() => {
        setVanishingStrokes((prev) => prev.filter((s) => s.id !== stroke.id));
      }, 3500);
    });

    return () => {
      unsubAnn();
      unsubVanish();
    };
  }, [meeting?.id, activeMockup?.id, phase]);

  // 15. Close Canvas Context Menu on global click or Escape
  useEffect(() => {
    const handleGlobalClick = () => {
      if (canvasContextMenu?.visible) {
        setCanvasContextMenu(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setCanvasContextMenu(null);
        setPendingPinCoord(null);
        setSelectedPinDetail(null);
      }
    };
    window.addEventListener("click", handleGlobalClick);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("click", handleGlobalClick);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [canvasContextMenu]);

  // 16. Agenda timer tick — drives countdown display from server deadlineAt.
  // Only ticks while an agenda item is actually running; previously this
  // re-rendered the whole meeting room every second even with no agenda.
  const agendaTimerRunning = (meeting?.agendaItems ?? []).some((it) => it.status === "active");
  useEffect(() => {
    if (!agendaTimerRunning) return;
    const id = setInterval(() => setAgendaTimerTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [agendaTimerRunning]);

  // 17. Speaker Queue — watch for invitation addressed to me
  useEffect(() => {
    if (!meeting || phase !== "in_meeting") return;
    const myInvite = (meeting.speakerQueue ?? []).find(
      (e) => e.participantId === myParticipantId && e.status === "invited"
    );
    if (myInvite) {
      setSpeakerQueueInvite(myInvite);
      playHandRaiseChime();
      // Auto-expire banner at expiresAt
      if (myInvite.expiresAt) {
        const ttl = new Date(myInvite.expiresAt).getTime() - Date.now();
        if (speakerQueueInviteTimerRef.current) clearTimeout(speakerQueueInviteTimerRef.current);
        speakerQueueInviteTimerRef.current = setTimeout(() => {
          setSpeakerQueueInvite(null);
        }, Math.max(ttl, 0));
      }
    } else {
      setSpeakerQueueInvite(null);
    }
    return () => {
      if (speakerQueueInviteTimerRef.current) {
        clearTimeout(speakerQueueInviteTimerRef.current);
        speakerQueueInviteTimerRef.current = null;
      }
    };
  }, [meeting?.speakerQueue, myParticipantId, phase]);

  // 18. Screen Share Annotation — subscribe while ANY participant is sharing,
  // not just the local presenter. Previously the condition was `isScreenSharing`
  // only, so guests silently never received the presenter's strokes.
  const anyScreenShareActive =
    isScreenSharing ||
    Boolean(
      meeting?.participants?.some(
        (p) =>
          p.isScreenSharing &&
          (p.status === "joined" || p.status === "admitted") &&
          p.id !== myParticipantId
      )
    );
  useEffect(() => {
    if (!meeting || !anyScreenShareActive) {
      setSsAnnotStrokes([]);
      return;
    }
    const unsub = subscribeToScreenShareAnnotations(
      meeting.id,
      (stroke) => {
        setSsAnnotStrokes((prev) => {
          const idx = prev.findIndex((s) => s.id === stroke.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = stroke;
            return next;
          }
          return [...prev, stroke];
        });
        if (stroke.vanishAt) {
          const ttl = stroke.vanishAt - Date.now();
          if (ttl > 0) {
            setTimeout(() => {
              setSsAnnotStrokes((prev) => prev.filter((s) => s.id !== stroke.id));
            }, ttl);
          }
        }
      },
      () => setSsAnnotStrokes([])
    );
    return unsub;
  }, [meeting?.id, anyScreenShareActive]);

  // Handlers
  const handleToggleFullscreen = () => {
    const el = document.fullscreenElement ? null : (meetingContainerRef.current || document.documentElement);
    if (!document.fullscreenElement) {
      if (el?.requestFullscreen) {
        el.requestFullscreen().catch(() => {});
      } else if ((el as any)?.webkitRequestFullscreen) {
        (el as any).webkitRequestFullscreen();
      }
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      } else if ((document as any)?.webkitExitFullscreen) {
        (document as any).webkitExitFullscreen();
      }
      setIsFullscreen(false);
    }
  };

  const handleTestSpeaker = async () => {
    setIsTestingSpeaker(true);
    await playSpeakerTestSound();
    setIsTestingSpeaker(false);
  };

  const handleJoinFromLobby = async (audioOnly: boolean = false) => {
    if (!meeting) return;

    // Duplicate-tab guard: refuse to create a second seat for this room.
    // Route to the takeover screen instead of spawning a clone participant.
    const activeLock = readTabLock();
    if (activeLock && Date.now() - activeLock.ts < 12000 && activeLock.sessionId !== sessionId && !tabLockHeldRef.current) {
      setTabConflict(true);
      return;
    }

    // Check joinability
    const check = isMeetingJoinable(meeting);
    if (!check.canJoin && !isHost) {
      toast.error(check.reason || "Meeting is not currently joinable.");
      return;
    }

    // Check passcode if protected
    if (meeting.passcode && meeting.passcode.trim() !== passcode.trim() && !isHost) {
      toast.error("Invalid meeting passcode.");
      return;
    }

    // Voice-only sessions never request the camera
    if (meeting.allowCamera === false) {
      audioOnly = true;
    }

    if (audioOnly && localStream) {
      localStream.getVideoTracks().forEach((t) => (t.enabled = false));
      setIsVideoOff(true);
    }

    const myRole: ParticipantRole = isHost ? "host" : isAdmin ? "cohost" : "participant";

    // Host clicked a button (user gesture) — the one moment browsers allow us
    // to ask for OS notification permission, so knocks can reach them even
    // when this tab is in the background.
    if (isHost && typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
    const initialStatus: ParticipantStatus = (meeting.waitingRoomEnabled && !isHost) ? "waiting" : "joined";

    const hostParticipant = meeting.participants.find((p) => p.role === "host");
    const activeParticipantId = isHost && hostParticipant ? hostParticipant.id : myParticipantId;

    const participantData: MeetingParticipant = {
      id: activeParticipantId,
      meetingId: meeting.id,
      userId: user?.uid,
      email: user?.email || (isHost ? meeting.hostEmail : `${displayName.toLowerCase().replace(/\s+/g, ".")}@guest.local`),
      displayName: isHost ? (user?.displayName || meeting.hostName || "Host (Studio)") : (displayName.trim() || "Participant"),
      role: myRole,
      status: initialStatus,
      joinedAt: initialStatus === "joined" ? new Date().toISOString() : undefined,
      isMuted: isMicMuted,
      isVideoOff: audioOnly || isVideoOff,
      cameraAllowed: true,
      microphoneAllowed: true,
      screenShareAllowed: meeting.screenShareMode !== "disabled",
      chatAllowed: meeting.chatEnabled,
      connectionQuality: "excellent",
    };

    await updateParticipant(meeting.id, activeParticipantId, participantData);

    if (initialStatus === "waiting") {
      setPhase("waiting_room");
      toast.info("You are in the waiting room. The host will admit you shortly.");
    } else {
      setPhase("in_meeting");
      toast.success(`Connected to "${meeting.title}"`);
    }
  };

  const handleToggleMic = async () => {
    const next = !isMicMuted;
    setIsMicMuted(next);
    if (localStream && localStream.getAudioTracks().length > 0) {
      localStream.getAudioTracks().forEach((t) => (t.enabled = !next));
    } else if (!next) {
      try {
        const newStream = await getLocalUserMedia({
          audioDeviceId: selectedAudioInput || undefined,
          videoDeviceId: selectedVideoInput || undefined,
          audio: true,
          video: !isVideoOff,
        });
        newStream.getAudioTracks().forEach((t) => (t.enabled = true));
        newStream.getVideoTracks().forEach((t) => (t.enabled = !isVideoOff));
        setLocalStream(newStream);
        meshRef.current?.setLocalStream(newStream);
      } catch (err) {
        console.warn("Could not acquire mic track:", err);
        setIsMicMuted(true);
        toast.error("Microphone access unavailable. Check browser permissions.");
        return;
      }
    }
    if (meeting && phase === "in_meeting") {
      await updateParticipant(meeting.id, myParticipantId, { isMuted: next });
    }
    toast.info(next ? "Microphone Muted" : "Microphone Active");
  };

  const handleToggleVideo = async () => {
    const next = !isVideoOff;
    setIsVideoOff(next);
    if (localStream && localStream.getVideoTracks().length > 0) {
      localStream.getVideoTracks().forEach((t) => (t.enabled = !next));
    } else if (!next) {
      try {
        const newStream = await getLocalUserMedia({
          audioDeviceId: selectedAudioInput || undefined,
          videoDeviceId: selectedVideoInput || undefined,
          audio: !isMicMuted,
          video: true,
        });
        newStream.getVideoTracks().forEach((t) => (t.enabled = true));
        newStream.getAudioTracks().forEach((t) => (t.enabled = !isMicMuted));
        setLocalStream(newStream);
        meshRef.current?.setLocalStream(newStream);
      } catch (err) {
        console.warn("Could not acquire video track:", err);
        setIsVideoOff(true);
        toast.error("Camera access unavailable. Check browser permissions.");
        return;
      }
    }
    if (meeting && phase === "in_meeting") {
      await updateParticipant(meeting.id, myParticipantId, { isVideoOff: next });
    }
    toast.info(next ? "Camera Stopped" : "Camera Active");
  };

  const screenAudioCtxRef = useRef<AudioContext | null>(null);

  const stopActiveScreenShare = () => {
    stopMediaStream(screenStreamRef.current);
    setScreenStream(null);
    setIsScreenSharing(false);
    setIsStudioBroadcasting(false);
    setSharedSurfaceInfo(detectSharedSurface(null));
    setScreenStageZoom(1);
    setScreenStagePan({ x: 0, y: 0 });
    try {
      screenAudioCtxRef.current?.close();
    } catch {
      // audio graph teardown is best-effort
    }
    screenAudioCtxRef.current = null;
    meshRef.current?.setLocalStream(localStreamRef.current);
    if (meeting) updateParticipant(meeting.id, myParticipantId, { isScreenSharing: false });
  };

  const handleStartScreenShare = async (
    preferWindowOrOptions:
      | boolean
      | {
          surface?: DisplaySurfaceType;
          optimizeFor?: ScreenCaptureOptimization;
          withAudio?: boolean;
          replaceActive?: boolean;
        } = false,
    inviteType: "screen_share" | "co_design" = "screen_share"
  ) => {
    setShowScreenShareMenu(false);

    const isOptionsObj = typeof preferWindowOrOptions === "object" && preferWindowOrOptions !== null;
    const replaceActive = isOptionsObj ? Boolean(preferWindowOrOptions.replaceActive) : false;

    if (isScreenSharing && !replaceActive) {
      stopActiveScreenShare();
      return;
    }

    // Enforce the meeting's screen-share policy (host_only / host_and_cohost / everyone / disabled)
    if (meeting) {
      const mode = meeting.screenShareMode;
      const myRole: ParticipantRole = isHost ? "host" : isAdmin ? "cohost" : "participant";
      const allowed =
        mode === "everyone" ||
        (mode === "host_and_cohost" && (myRole === "host" || myRole === "cohost")) ||
        (mode === "host_only" && myRole === "host");
      if (!allowed) {
        toast.error("Screen sharing is not permitted for your role in this meeting.");
        return;
      }
    }

    if (!isDisplayMediaSupported()) {
      toast.info(
        "Direct OS screen capture isn't supported on this mobile browser. Opening Live Proofing Canvas so you can share designs & screenshots!",
        { duration: 6000 }
      );
      setShowUploadModal(true);
      return;
    }

    const targetSurface: DisplaySurfaceType | undefined = isOptionsObj
      ? preferWindowOrOptions.surface
      : preferWindowOrOptions
      ? "window"
      : undefined;
    const optimizeFor: ScreenCaptureOptimization = isOptionsObj
      ? preferWindowOrOptions.optimizeFor ?? screenShareOptimizeFor
      : screenShareOptimizeFor;
    const withAudio = isOptionsObj
      ? preferWindowOrOptions.withAudio ?? screenShareWithAudio
      : screenShareWithAudio;

    try {
      const stream = await getDisplayMediaStream({
        surface: targetSurface,
        preferWindow: targetSurface === "window",
        optimizeFor,
        withAudio,
      });
      if (!stream) return;

      // Clean up any previous screen stream if switching apps/windows live
      if (screenStreamRef.current && screenStreamRef.current !== stream) {
        stopMediaStream(screenStreamRef.current);
      }
      try {
        screenAudioCtxRef.current?.close();
      } catch {
        // ignore
      }
      screenAudioCtxRef.current = null;

      const surfaceMeta = detectSharedSurface(stream);
      setSharedSurfaceInfo(surfaceMeta);
      setScreenStream(stream);
      setIsScreenSharing(true);
      setScreenStageZoom(1);
      setScreenStagePan({ x: 0, y: 0 });

      // Outbound = screen VIDEO + the microphone. Never let system audio
      // replace the mic — when the shared tab/window has sound, MIX it with
      // the mic so guests keep hearing the presenter speak (Zoom-style).
      const micTracks = localStream?.getAudioTracks() ?? [];
      const sysAudioTracks = stream.getAudioTracks();
      let outboundAudioTracks = micTracks;
      if (sysAudioTracks.length > 0 && micTracks.length > 0) {
        try {
          const ctx = new AudioContext();
          const dest = ctx.createMediaStreamDestination();
          ctx.createMediaStreamSource(new MediaStream([micTracks[0]])).connect(dest);
          ctx.createMediaStreamSource(new MediaStream([sysAudioTracks[0]])).connect(dest);
          outboundAudioTracks = dest.stream.getAudioTracks();
          screenAudioCtxRef.current = ctx;
        } catch {
          outboundAudioTracks = micTracks;
        }
      } else if (sysAudioTracks.length > 0) {
        outboundAudioTracks = sysAudioTracks;
      }
      const outbound = new MediaStream([...outboundAudioTracks, ...stream.getVideoTracks()]);
      meshRef.current?.setLocalStream(outbound);

      if (screenVideoRef.current) {
        screenVideoRef.current.srcObject = stream;
        screenVideoRef.current.play().catch(() => {});
      }

      const vTrack = stream.getVideoTracks()[0];
      if (vTrack) {
        vTrack.onended = () => {
          stopActiveScreenShare();
        };
      }

      if (meeting) {
        updateParticipant(meeting.id, myParticipantId, { isScreenSharing: true });
        if (!replaceActive) {
          // Zoom-style "come watch" ping to everyone else in the room
          updateMeeting(meeting.id, {
            liveInvite: {
              type: inviteType,
              senderId: myParticipantId,
              senderName: displayName,
              sentAt: new Date().toISOString(),
            },
          });
        }
      }
      toast.success(
        `${surfaceMeta.icon} Sharing ${surfaceMeta.label}${
          surfaceMeta.resolution ? ` (${surfaceMeta.resolution})` : ""
        }`
      );
    } catch (err: any) {
      if (err?.name !== "NotAllowedError" && err?.name !== "AbortError") {
        toast.error("Could not start screen or application share. Check browser permissions.");
      }
      console.warn("Screen share cancelled or failed:", err);
    }
  };

  const handleSwitchSharedSurface = async (surface: DisplaySurfaceType = "window") => {
    await handleStartScreenShare({
      surface,
      optimizeFor: screenShareOptimizeFor,
      withAudio: screenShareWithAudio,
      replaceActive: true,
    });
  };

  const handleToggleScreenOptimization = () => {
    const next: ScreenCaptureOptimization = screenShareOptimizeFor === "detail" ? "motion" : "detail";
    setScreenShareOptimizeFor(next);
    applyScreenTrackOptimization(screenStream, next);
    toast.info(
      next === "detail"
        ? "🎯 Optimized for Crisp Application UI & Text (1080p/1440p Detail)"
        : "🎬 Optimized for 60fps Video & Smooth Animation"
    );
  };

  const handleToggleScreenPiP = async () => {
    const video = screenVideoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (typeof video.requestPictureInPicture === "function") {
        await video.requestPictureInPicture();
      } else if (typeof (video as any).webkitSetPresentationMode === "function") {
        (video as any).webkitSetPresentationMode("picture-in-picture");
      } else {
        toast.info("Picture-in-Picture is not supported on this browser.");
      }
    } catch {
      toast.error("Could not open Picture-in-Picture window.");
    }
  };

  // 2026 In-Meeting Synchronized Co-Design Studio Handlers
  const handleLaunchInMeetingCoDesign = async (options: {
    title: string;
    sourceType: "deliverable" | "client_design" | "preset";
    sourceId?: string;
    backgroundImage?: string;
    headline?: string;
    subheadline?: string;
    categoryBadge?: string;
    preset?: CoDesignArtboardPresetId;
    paletteId?: string;
  }) => {
    if (!meeting) return;
    setShowStudioCoDesignModal(false);
    setActiveDrawer("none");
    setIsProofingMaximized(false);
    setSelectedCoDesignLayerId(null);

    const initialLayers = createDefaultCoDesignLayers({
      headline: options.headline || options.title,
      subheadline: options.subheadline,
      categoryBadge: options.categoryBadge,
    });

    const newSession = await startMeetingCoDesignSession(meeting.id, {
      title: options.title,
      sourceType: options.sourceType,
      sourceId: options.sourceId,
      hostId: myParticipantId,
      hostName: displayName,
      allowParticipantEdits: true,
      artboardPreset: options.preset || "square_1080",
      backgroundImage: options.backgroundImage,
      initialLayers,
      brandPalettePresetId: options.paletteId || "neon_cyber",
    });
    setMeeting((prev) => (prev ? { ...prev, coDesignSession: newSession } : prev));
    toast.success(`🎨 Launched Live Co-Design: "${options.title}"`);
  };

  const handleUpdateCoDesignLayer = async (
    layerId: string,
    patch: Partial<CoDesignLayer>
  ) => {
    if (!meeting?.coDesignSession) return;
    const session = meeting.coDesignSession;
    const canEdit = isHost || session.allowParticipantEdits;
    if (!canEdit) {
      toast.error("Host has locked co-editing for participants.");
      return;
    }
    const nextLayers = session.layers.map((l) =>
      l.id === layerId ? { ...l, ...patch, updatedBy: displayName } : l
    );
    await updateMeetingCoDesignSession(
      meeting.id,
      { layers: nextLayers },
      displayName
    );
    setMeeting((prev) =>
      prev && prev.coDesignSession
        ? {
            ...prev,
            coDesignSession: {
              ...prev.coDesignSession,
              layers: nextLayers,
            },
          }
        : prev
    );
  };

  const handleAddCoDesignLayer = async (
    type: "text" | "badge" | "shape",
    shapeKind?: "rect" | "circle" | "pill"
  ) => {
    if (!meeting?.coDesignSession) return;
    const session = meeting.coDesignSession;
    const canEdit = isHost || session.allowParticipantEdits;
    if (!canEdit) return;

    const palette = session.brandPalette || CO_DESIGN_BRAND_PALETTES[0].swatches;
    const [primary, , textClr, badgeBg, badgeTxt] = palette;

    const layerCount = session.layers.length + 1;
    const newId = `layer_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    let newLayer: CoDesignLayer;

    if (type === "badge") {
      newLayer = {
        id: newId,
        type: "badge",
        name: `CTA Badge #${layerCount}`,
        text: "ORDER NOW →",
        x: 50,
        y: 50 + (layerCount % 3) * 6,
        fontSize: 14,
        fontFamily: "Space Grotesk",
        fontWeight: "extrabold",
        textAlign: "center",
        color: badgeTxt,
        fillColor: badgeBg,
        opacity: 1,
        borderRadius: 12,
        locked: false,
      };
    } else if (type === "shape") {
      newLayer = {
        id: newId,
        type: "shape",
        name: `${shapeKind || "Rect"} Frame #${layerCount}`,
        shapeKind: shapeKind || "rect",
        x: 50,
        y: 50,
        width: 60,
        height: 40,
        fontSize: 14,
        fontFamily: "Inter",
        fontWeight: "normal",
        color: primary,
        fillColor: `${primary}20`,
        opacity: 0.8,
        borderRadius: shapeKind === "circle" ? 999 : 16,
        locked: false,
      };
    } else {
      newLayer = {
        id: newId,
        type: "text",
        name: `Text Layer #${layerCount}`,
        text: "Add custom headline or copy here",
        x: 50,
        y: 50 + (layerCount % 3) * 5,
        width: 75,
        fontSize: 22,
        fontFamily: "Syne",
        fontWeight: "bold",
        textAlign: "center",
        color: textClr || "#FFFFFF",
        opacity: 1,
        locked: false,
      };
    }

    const nextLayers = [...session.layers, newLayer];
    setSelectedCoDesignLayerId(newId);
    setShowLayerInspector(true);
    await updateMeetingCoDesignSession(
      meeting.id,
      { layers: nextLayers },
      displayName
    );
    setMeeting((prev) =>
      prev && prev.coDesignSession
        ? {
            ...prev,
            coDesignSession: {
              ...prev.coDesignSession,
              layers: nextLayers,
            },
          }
        : prev
    );
    toast.success(`+ Added ${newLayer.name}`);
  };

  const handleDeleteCoDesignLayer = async (layerId: string) => {
    if (!meeting?.coDesignSession) return;
    const session = meeting.coDesignSession;
    const canEdit = isHost || session.allowParticipantEdits;
    if (!canEdit) return;

    const nextLayers = session.layers.filter((l) => l.id !== layerId);
    if (selectedCoDesignLayerId === layerId) {
      setSelectedCoDesignLayerId(null);
      setShowLayerInspector(false);
    }
    await updateMeetingCoDesignSession(
      meeting.id,
      { layers: nextLayers },
      displayName
    );
    setMeeting((prev) =>
      prev && prev.coDesignSession
        ? {
            ...prev,
            coDesignSession: {
              ...prev.coDesignSession,
              layers: nextLayers,
            },
          }
        : prev
    );
    toast.info("Layer removed");
  };

  const handleDuplicateCoDesignLayer = async (layerId: string) => {
    if (!meeting?.coDesignSession) return;
    const session = meeting.coDesignSession;
    const target = session.layers.find((l) => l.id === layerId);
    if (!target) return;

    const duplicated: CoDesignLayer = {
      ...target,
      id: `layer_${Date.now()}_copy`,
      name: `${target.name} (Copy)`,
      x: Math.min(90, target.x + 4),
      y: Math.min(90, target.y + 4),
    };
    const nextLayers = [...session.layers, duplicated];
    setSelectedCoDesignLayerId(duplicated.id);
    await updateMeetingCoDesignSession(
      meeting.id,
      { layers: nextLayers },
      displayName
    );
    setMeeting((prev) =>
      prev && prev.coDesignSession
        ? {
            ...prev,
            coDesignSession: {
              ...prev.coDesignSession,
              layers: nextLayers,
            },
          }
        : prev
    );
    toast.success("Layer duplicated");
  };

  const handleReorderCoDesignLayer = async (
    layerId: string,
    direction: "front" | "back"
  ) => {
    if (!meeting?.coDesignSession) return;
    const session = meeting.coDesignSession;
    const idx = session.layers.findIndex((l) => l.id === layerId);
    if (idx === -1) return;

    const target = session.layers[idx];
    const without = session.layers.filter((l) => l.id !== layerId);
    const nextLayers =
      direction === "front" ? [...without, target] : [target, ...without];

    await updateMeetingCoDesignSession(
      meeting.id,
      { layers: nextLayers },
      displayName
    );
    setMeeting((prev) =>
      prev && prev.coDesignSession
        ? {
            ...prev,
            coDesignSession: {
              ...prev.coDesignSession,
              layers: nextLayers,
            },
          }
        : prev
    );
  };

  /** Render the Co-Design artboard layers to an off-screen canvas and capture PNG */
  const captureCoDesignCanvasSnapshot = async (): Promise<string | null> => {
    if (!meeting?.coDesignSession) return null;
    const session = meeting.coDesignSession;
    const preset =
      CO_DESIGN_ARTBOARD_PRESETS[session.artboardPreset] ||
      CO_DESIGN_ARTBOARD_PRESETS.square_1080;

    const canvas = document.createElement("canvas");
    canvas.width = preset.widthPx;
    canvas.height = preset.heightPx;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // 1. Draw Background
    if (session.backgroundImage) {
      try {
        const img = new Image();
        img.crossOrigin = "anonymous";
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject();
          img.src = session.backgroundImage!;
        });
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      } catch {
        ctx.fillStyle = session.backgroundColor || "#090D16";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      if (session.backgroundDim > 0) {
        ctx.fillStyle = `rgba(0, 0, 0, ${session.backgroundDim / 100})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    } else {
      ctx.fillStyle = session.backgroundColor || "#090D16";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // 2. Draw Vector & Text Layers
    for (const layer of session.layers) {
      if (layer.hidden) continue;
      const cx = (layer.x / 100) * canvas.width;
      const cy = (layer.y / 100) * canvas.height;
      const scaleFactor = canvas.width / 420; // Scale relative to mobile/desktop preview

      ctx.save();
      ctx.globalAlpha = layer.opacity ?? 1;
      ctx.translate(cx, cy);
      if (layer.rotation) {
        ctx.rotate((layer.rotation * Math.PI) / 180);
      }

      const layerW = ((layer.width || 70) / 100) * canvas.width;
      const layerH = ((layer.height || 20) / 100) * canvas.height;

      if (layer.type === "shape") {
        ctx.strokeStyle = layer.color;
        ctx.lineWidth = 3 * scaleFactor;
        ctx.fillStyle = layer.fillColor || "transparent";
        ctx.beginPath();
        if (layer.shapeKind === "circle") {
          ctx.arc(0, 0, Math.min(layerW, layerH) / 2, 0, Math.PI * 2);
        } else {
          const r = (layer.borderRadius || 12) * scaleFactor;
          const x0 = -layerW / 2;
          const y0 = -layerH / 2;
          ctx.roundRect(x0, y0, layerW, layerH, r);
        }
        if (layer.fillColor && layer.fillColor !== "transparent") ctx.fill();
        ctx.stroke();
      } else if (layer.type === "badge") {
        const text = layer.text || "";
        const scaledFont = Math.round(layer.fontSize * scaleFactor);
        ctx.font = `${layer.fontWeight === "extrabold" ? 800 : 700} ${scaledFont}px "${layer.fontFamily}", sans-serif`;
        const metrics = ctx.measureText(text);
        const padX = 22 * scaleFactor;
        const padY = 12 * scaleFactor;
        const badgeW = metrics.width + padX * 2;
        const badgeH = scaledFont + padY * 2;
        const radius = Math.min(badgeH / 2, (layer.borderRadius || 12) * scaleFactor);

        ctx.fillStyle = layer.fillColor || "#00F0FF";
        ctx.beginPath();
        ctx.roundRect(-badgeW / 2, -badgeH / 2, badgeW, badgeH, radius);
        ctx.fill();

        ctx.fillStyle = layer.color || "#000000";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, 0, 0);
      } else if (layer.type === "text") {
        const text = layer.text || "";
        const scaledFont = Math.round(layer.fontSize * scaleFactor);
        ctx.font = `${layer.fontWeight === "extrabold" ? 800 : layer.fontWeight === "bold" ? 700 : 400} ${scaledFont}px "${layer.fontFamily}", sans-serif`;
        ctx.fillStyle = layer.color || "#FFFFFF";
        ctx.textAlign = (layer.textAlign as any) || "center";
        ctx.textBaseline = "middle";

        // Multi-line word wrapping
        const words = text.split(" ");
        let line = "";
        const lines: string[] = [];
        const maxLineW = layerW;

        for (let n = 0; n < words.length; n++) {
          const testLine = line + words[n] + " ";
          const testWidth = ctx.measureText(testLine).width;
          if (testWidth > maxLineW && n > 0) {
            lines.push(line);
            line = words[n] + " ";
          } else {
            line = testLine;
          }
        }
        lines.push(line);

        const lineHeight = scaledFont * 1.25;
        const startY = -((lines.length - 1) * lineHeight) / 2;
        lines.forEach((l, idx) => {
          ctx.fillText(l.trim(), 0, startY + idx * lineHeight);
        });
      }

      ctx.restore();
    }

    return canvas.toDataURL("image/png");
  };

  /** Push active Co-Design artboard to Deliverable Proofing Canvas */
  const handleSnapCoDesignToProof = async () => {
    if (!meeting?.coDesignSession) return;
    try {
      const dataUrl = await captureCoDesignCanvasSnapshot();
      if (!dataUrl) {
        toast.error("Could not capture canvas render.");
        return;
      }
      const title = `${meeting.coDesignSession.title} (v${meeting.coDesignSession.versions?.length || 1})`;
      await addMeetingProofingArtwork(meeting.id, {
        title,
        category: "Live Studio Co-Design",
        image: dataUrl,
        uploadedBy: `${displayName} (Live Studio)`,
        notes: "Real-time vector and typography co-design snapshot pushed to client proofing canvas.",
      });
      toast.success(`📸 Co-Design artwork pushed to Proof Canvas as "${title}"!`);
      setActiveDrawer("proofing");
    } catch {
      toast.error("Failed to snapshot Co-Design canvas.");
    }
  };

  /** Open Full KON10 Vector Studio in external tab & launch app screen share */
  const handleStartStudioCoDesign = async (templateSlug?: string) => {
    setShowStudioCoDesignModal(false);
    const targetSlug = templateSlug || "new";
    const editorUrl = `/editor/${targetSlug}`;
    window.open(editorUrl, "_blank");

    toast.info("Opening KON10 Studio... Select your browser tab or window to broadcast to client!", { duration: 6000 });
    setIsStudioBroadcasting(true);
    await handleStartScreenShare({ surface: "browser", optimizeFor: "detail", withAudio: true }, "co_design");
  };

  const handleSnapScreenToProof = async () => {
    const video = screenVideoRef.current;
    if (!video || video.videoWidth === 0) {
      toast.error("No active studio video stream to capture.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/png");

    if (!meeting) return;
    const title = `Live Studio Revision (${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })})`;
    try {
      await addMeetingProofingArtwork(meeting.id, {
        title,
        category: "Live Studio Co-Design",
        image: dataUrl,
        uploadedBy: `${displayName} (Live Studio)`,
        notes: "Live co-design revision snapshot captured directly from meeting broadcast.",
      });
      toast.success(`📸 Snapshot saved to Proofing Canvas as "${title}"!`);
      setActiveDrawer("proofing");
    } catch (err) {
      toast.error("Failed to push snapshot to proofing canvas.");
    }
  };

  const formatBreakoutCountdown = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatDraft.trim() || !meeting) return;
    const text = chatDraft.trim();
    setChatDraft("");
    const role: ParticipantRole = isHost ? "host" : isAdmin ? "cohost" : "participant";
    const targetBreakoutId =
      myActiveBreakoutRoom && chatScope === "room" ? myActiveBreakoutRoom.id : undefined;
    const targetBreakoutName =
      myActiveBreakoutRoom && chatScope === "room" ? myActiveBreakoutRoom.name : undefined;

    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const optimisticMsg: MeetingChatMessage = {
      id: tempId,
      meetingId: meeting.id,
      senderId: myParticipantId,
      senderName: displayName,
      senderRole: role,
      recipientId: chatRecipient || undefined,
      breakoutRoomId: targetBreakoutId,
      breakoutRoomName: targetBreakoutName,
      message: text,
      createdAt: new Date().toISOString(),
    };

    setChatMessages((prev) => [...prev, optimisticMsg]);

    try {
      const sent = await sendMeetingChatMessage(
        meeting.id,
        myParticipantId,
        displayName,
        role,
        text,
        chatRecipient || undefined,
        targetBreakoutId,
        targetBreakoutName
      );
      setChatMessages((prev) => prev.map((m) => (m.id === tempId ? sent : m)));
    } catch (err: any) {
      console.error("Chat send error:", err);
      toast.error("Failed to send message. Please retry.");
    }
  };

  const handleSelectProof = async (newIdx: number) => {
    const clamped = Math.max(0, Math.min(proofingMockups.length - 1, newIdx));
    setProofingIndex(clamped);
    if (meeting) {
      await setMeetingLiveProofing(meeting.id, {
        mockupIndex: clamped,
        active: true,
        presenterId: myParticipantId,
        presenterName: displayName,
      });
    }
  };

  const getCanvasCoords = (
    e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement> | React.PointerEvent<HTMLDivElement>,
    target: HTMLElement
  ): { x: number; y: number } | null => {
    const rect = target.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    let clientX = 0;
    let clientY = 0;
    if ("clientX" in e && typeof e.clientX === "number") {
      clientX = e.clientX;
      clientY = e.clientY;
    } else if ("touches" in e && (e as any).touches?.length > 0) {
      clientX = (e as any).touches[0].clientX;
      clientY = (e as any).touches[0].clientY;
    }
    const x = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100));
    return { x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) };
  };

  const handleLaserClick = async (e: React.MouseEvent<HTMLDivElement> | React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    setLaserPointer({ x, y, active: true, senderName: displayName });
    if (meeting) {
      await updateMeetingLaserPointer(meeting.id, x, y, displayName);
    }
  };

  const handleCanvasContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const canvasX = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const canvasY = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));

    const posX = Math.min(window.innerWidth - 270, Math.max(10, e.clientX));
    const posY = Math.min(window.innerHeight - 440, Math.max(10, e.clientY));

    setCanvasContextMenu({
      visible: true,
      x: posX,
      y: posY,
      canvasX,
      canvasY,
    });
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button === 2) return; // Right-click handled by onContextMenu
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore if not supported
    }
    const coords = getCanvasCoords(e, e.currentTarget);
    if (!coords) return;

    if (activeProofTool === "laser") {
      handleLaserClick(e);
      return;
    }

    if (activeProofTool === "pin") {
      setPendingPinCoord(coords);
      return;
    }

    setIsDrawing(true);
    setActiveDrawingPoints([coords]);
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const coords = getCanvasCoords(e, e.currentTarget);
    if (!coords) return;

    if (activeProofTool === "laser" && e.buttons === 1) {
      handleLaserClick(e);
      return;
    }

    if (!isDrawing) return;

    setActiveDrawingPoints((prev) => {
      const last = prev[prev.length - 1];
      if (!last) return [coords];
      const dist = Math.hypot(coords.x - last.x, coords.y - last.y);
      if (dist > 0.2) {
        return [...prev, coords];
      }
      return prev;
    });
  };

  const handleCanvasPointerUp = async (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {}

    if (!isDrawing || activeDrawingPoints.length === 0 || !meeting || !activeMockup) {
      setIsDrawing(false);
      setActiveDrawingPoints([]);
      return;
    }

    const isVanishing = activeProofTool === "vanishing";
    const newStroke: CanvasStroke = {
      id: `stroke_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      tool: isVanishing ? "pen" : (activeProofTool as any),
      color: proofStrokeColor,
      width: proofStrokeWidth,
      points: activeDrawingPoints,
      vanishing: isVanishing,
      senderName: displayName,
      createdAt: new Date().toISOString(),
    };

    setIsDrawing(false);
    setActiveDrawingPoints([]);

    if (isVanishing) {
      setVanishingStrokes((prev) => [...prev, newStroke]);
      sendVanishingStroke(meeting.id, activeMockup.id, newStroke);
      setTimeout(() => {
        setVanishingStrokes((prev) => prev.filter((s) => s.id !== newStroke.id));
      }, 3500);
    } else {
      const updatedStrokes = [...mockupStrokes, newStroke];
      setUndoStack((prev) => [...prev, { strokes: mockupStrokes, pins: mockupPins }]);
      setRedoStack([]);
      setMockupStrokes(updatedStrokes);
      await updateMockupAnnotations(meeting.id, activeMockup.id, {
        strokes: updatedStrokes,
        pins: mockupPins,
      });
    }
  };

  const renderCanvasStroke = (stroke: CanvasStroke) => {
    if (!stroke.points || stroke.points.length < 2) return null;
    const p0 = stroke.points[0];
    const p1 = stroke.points[stroke.points.length - 1];

    if (stroke.tool === "rect") {
      const x = Math.min(p0.x, p1.x);
      const y = Math.min(p0.y, p1.y);
      const w = Math.abs(p1.x - p0.x);
      const h = Math.abs(p1.y - p0.y);
      return (
        <rect
          key={stroke.id}
          x={x}
          y={y}
          width={w}
          height={h}
          fill="none"
          stroke={stroke.color}
          strokeWidth={stroke.width}
          strokeDasharray={stroke.width >= 4 ? "3 1.5" : "2 1"}
          vectorEffect="non-scaling-stroke"
        />
      );
    }

    if (stroke.tool === "circle") {
      const cx = (p0.x + p1.x) / 2;
      const cy = (p0.y + p1.y) / 2;
      const rx = Math.abs(p1.x - p0.x) / 2;
      const ry = Math.abs(p1.y - p0.y) / 2;
      return (
        <ellipse
          key={stroke.id}
          cx={cx}
          cy={cy}
          rx={rx}
          ry={ry}
          fill="none"
          stroke={stroke.color}
          strokeWidth={stroke.width}
          vectorEffect="non-scaling-stroke"
        />
      );
    }

    if (stroke.tool === "arrow") {
      const angle = Math.atan2(p1.y - p0.y, p1.x - p0.x);
      const headLen = Math.max(2, Math.min(5, Math.hypot(p1.x - p0.x, p1.y - p0.y) * 0.25));
      const angleSpread = Math.PI / 6;
      const arrowP1 = `${p1.x},${p1.y}`;
      const arrowP2 = `${p1.x - headLen * Math.cos(angle - angleSpread)},${p1.y - headLen * Math.sin(angle - angleSpread)}`;
      const arrowP3 = `${p1.x - headLen * Math.cos(angle + angleSpread)},${p1.y - headLen * Math.sin(angle + angleSpread)}`;
      return (
        <g key={stroke.id}>
          <line
            x1={p0.x}
            y1={p0.y}
            x2={p1.x}
            y2={p1.y}
            stroke={stroke.color}
            strokeWidth={stroke.width}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          <polygon points={`${arrowP1} ${arrowP2} ${arrowP3}`} fill={stroke.color} />
        </g>
      );
    }

    const pathData = stroke.points
      .map((pt, i) => `${i === 0 ? "M" : "L"} ${pt.x} ${pt.y}`)
      .join(" ");

    return (
      <path
        key={stroke.id}
        d={pathData}
        fill="none"
        stroke={stroke.color}
        strokeWidth={stroke.tool === "highlighter" ? stroke.width * 3 : stroke.width}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={stroke.tool === "highlighter" ? 0.4 : 1}
        vectorEffect="non-scaling-stroke"
        className={stroke.vanishing ? "animate-pulse" : ""}
      />
    );
  };

  const renderActiveStrokePreview = () => {
    if (!isDrawing || activeDrawingPoints.length < 2) return null;
    const p0 = activeDrawingPoints[0];
    const p1 = activeDrawingPoints[activeDrawingPoints.length - 1];

    if (activeProofTool === "rect") {
      const x = Math.min(p0.x, p1.x);
      const y = Math.min(p0.y, p1.y);
      const w = Math.abs(p1.x - p0.x);
      const h = Math.abs(p1.y - p0.y);
      return (
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          fill="none"
          stroke={proofStrokeColor}
          strokeWidth={proofStrokeWidth}
          strokeDasharray="3 1.5"
          vectorEffect="non-scaling-stroke"
        />
      );
    }

    if (activeProofTool === "circle") {
      const cx = (p0.x + p1.x) / 2;
      const cy = (p0.y + p1.y) / 2;
      const rx = Math.abs(p1.x - p0.x) / 2;
      const ry = Math.abs(p1.y - p0.y) / 2;
      return (
        <ellipse
          cx={cx}
          cy={cy}
          rx={rx}
          ry={ry}
          fill="none"
          stroke={proofStrokeColor}
          strokeWidth={proofStrokeWidth}
          vectorEffect="non-scaling-stroke"
        />
      );
    }

    if (activeProofTool === "arrow") {
      const angle = Math.atan2(p1.y - p0.y, p1.x - p0.x);
      const headLen = Math.max(2, Math.min(5, Math.hypot(p1.x - p0.x, p1.y - p0.y) * 0.25));
      const angleSpread = Math.PI / 6;
      const arrowP1 = `${p1.x},${p1.y}`;
      const arrowP2 = `${p1.x - headLen * Math.cos(angle - angleSpread)},${p1.y - headLen * Math.sin(angle - angleSpread)}`;
      const arrowP3 = `${p1.x - headLen * Math.cos(angle + angleSpread)},${p1.y - headLen * Math.sin(angle + angleSpread)}`;
      return (
        <g>
          <line
            x1={p0.x}
            y1={p0.y}
            x2={p1.x}
            y2={p1.y}
            stroke={proofStrokeColor}
            strokeWidth={proofStrokeWidth}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          <polygon points={`${arrowP1} ${arrowP2} ${arrowP3}`} fill={proofStrokeColor} />
        </g>
      );
    }

    const pathData = activeDrawingPoints
      .map((pt, i) => `${i === 0 ? "M" : "L"} ${pt.x} ${pt.y}`)
      .join(" ");

    return (
      <path
        d={pathData}
        fill="none"
        stroke={proofStrokeColor}
        strokeWidth={activeProofTool === "highlighter" ? proofStrokeWidth * 3 : proofStrokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={activeProofTool === "highlighter" ? 0.4 : 1}
        vectorEffect="non-scaling-stroke"
      />
    );
  };

  const renderSafeZoneOverlay = (overlay: typeof safeZoneOverlay) => {
    if (overlay === "none") return null;

    if (overlay === "tiktok_reels_shorts") {
      return (
        <div className="absolute inset-0 pointer-events-none z-[15] border-2 border-pink-500/50 select-none">
          <div className="absolute top-0 inset-x-0 h-[14%] bg-pink-500/15 border-b border-pink-500/40 flex items-center justify-between px-3 text-pink-300 font-meta text-[8.5px]">
            <span className="font-bold">📱 TikTok / IG Reels Header Safe Zone</span>
            <span className="opacity-75">14% Clearance</span>
          </div>
          <div className="absolute bottom-0 inset-x-0 h-[22%] bg-pink-500/15 border-t border-pink-500/40 flex items-center justify-between px-3 text-pink-300 font-meta text-[8.5px]">
            <span className="font-bold">💬 Bottom Safe Zone (Caption &amp; Audio Bar)</span>
            <span className="opacity-75">22% Clearance</span>
          </div>
          <div className="absolute right-0 top-[18%] bottom-[22%] w-[16%] bg-pink-500/15 border-l border-pink-500/40 flex items-center justify-center text-pink-300 font-meta text-[8px] [writing-mode:vertical-lr] text-center font-bold tracking-wider">
            ❤️ 💬 ↗️ Interaction Rail Safe Zone
          </div>
          <div className="absolute top-[14%] bottom-[22%] left-0 right-[16%] border border-dashed border-cyan-400/40 pointer-events-none" />
        </div>
      );
    }

    if (overlay === "ig_feed_grid") {
      return (
        <div className="absolute inset-0 pointer-events-none z-[15] flex items-center justify-center select-none">
          <div className="relative w-full h-full border-2 border-amber-400/60">
            <div className="absolute top-0 inset-x-0 h-[10%] bg-black/40 border-b border-dashed border-amber-400/60 flex items-center justify-center font-meta text-[8px] text-amber-300 font-bold">
              ✂️ 1:1 Profile Grid Crop Margin (Top 10%)
            </div>
            <div className="absolute top-[10%] bottom-[10%] inset-x-0 border-2 border-amber-400 bg-amber-400/5 flex items-center justify-center font-meta text-[9px] text-amber-300 font-bold">
              <span className="bg-black/80 px-2 py-0.5 rounded border border-amber-400/50">
                📸 1:1 Instagram Profile Grid Preview (1080x1080)
              </span>
            </div>
            <div className="absolute bottom-0 inset-x-0 h-[10%] bg-black/40 border-t border-dashed border-amber-400/60 flex items-center justify-center font-meta text-[8px] text-amber-300 font-bold">
              ✂️ 1:1 Profile Grid Crop Margin (Bottom 10%)
            </div>
          </div>
        </div>
      );
    }

    if (overlay === "facebook_feed_ad") {
      return (
        <div className="absolute inset-0 pointer-events-none z-[15] border-2 border-blue-500/50 select-none">
          <div className="absolute top-0 inset-x-0 h-[10%] bg-blue-500/15 border-b border-blue-500/40 flex items-center justify-between px-3 text-blue-300 font-meta text-[8.5px]">
            <span className="font-bold">👥 Facebook Primary Text Safe Margin</span>
            <span className="opacity-75">10%</span>
          </div>
          <div className="absolute bottom-0 inset-x-0 h-[18%] bg-blue-500/15 border-t border-blue-500/40 flex items-center justify-between px-3 text-blue-300 font-meta text-[8.5px]">
            <span className="font-bold">🔘 Headline &amp; CTA Button Safe Zone</span>
            <span className="opacity-75">18%</span>
          </div>
          <div className="absolute top-[10%] bottom-[18%] inset-x-0 border border-dashed border-blue-400/40" />
        </div>
      );
    }

    if (overlay === "youtube_thumb") {
      return (
        <div className="absolute inset-0 pointer-events-none z-[15] border-2 border-red-500/50 select-none">
          <div className="absolute bottom-2 right-2 w-[24%] h-[18%] bg-red-950/90 border-2 border-red-500 rounded-lg flex flex-col items-center justify-center text-red-200 font-meta text-[8px] font-bold shadow-lg">
            <span>⏱️ 04:12</span>
            <span className="text-[6.5px] uppercase">Duration Badge Safe Zone</span>
          </div>
          <div className="absolute top-0 left-0 w-[45%] h-[14%] bg-red-500/15 border-r border-b border-red-500/40 flex items-center px-2 text-red-300 font-meta text-[8px] font-bold">
            ▶️ Title &amp; Channel Watch Later Zone
          </div>
        </div>
      );
    }

    if (overlay === "linkedin_post") {
      return (
        <div className="absolute inset-0 pointer-events-none z-[15] border-2 border-sky-500/50 select-none">
          <div className="absolute inset-[6%] border border-dashed border-sky-400/60 flex items-center justify-center">
            <span className="bg-black/80 px-2 py-0.5 rounded text-[8px] font-meta text-sky-300 font-bold border border-sky-500/40">
              💼 LinkedIn Post &amp; Carousel Core Safe Area
            </span>
          </div>
        </div>
      );
    }

    if (overlay === "print_bleed") {
      return (
        <div className="absolute inset-0 pointer-events-none z-[15] border-4 border-red-500 select-none">
          <div className="absolute inset-0 border-2 border-red-500/80 flex items-start justify-start p-1 text-[7px] text-red-400 font-mono font-bold">
            🔴 0.125" BLEED LINE
          </div>
          <div className="absolute inset-[3.5%] border-2 border-dashed border-cyan-400 flex items-start justify-start p-1 text-[7px] text-cyan-300 font-mono font-bold">
            ✂️ TRIM CUT LINE
          </div>
          <div className="absolute inset-[7%] border-2 border-emerald-500 flex items-center justify-center text-[8px] text-emerald-300 font-mono font-bold">
            <span className="bg-black/80 px-2 py-0.5 rounded border border-emerald-500/50">
              ✅ INNER CONTENT SAFE ZONE
            </span>
          </div>
        </div>
      );
    }

    if (overlay === "thirds") {
      return (
        <div className="absolute inset-0 pointer-events-none z-[15] grid grid-cols-3 grid-rows-3 border border-yellow-400/40 select-none">
          <div className="border-r border-b border-yellow-400/30 relative"><div className="absolute -bottom-1 -right-1 w-2 h-2 rounded-full bg-yellow-400 shadow-sm" /></div>
          <div className="border-r border-b border-yellow-400/30 relative"><div className="absolute -bottom-1 -right-1 w-2 h-2 rounded-full bg-yellow-400 shadow-sm" /></div>
          <div className="border-b border-yellow-400/30" />
          <div className="border-r border-b border-yellow-400/30 relative"><div className="absolute -bottom-1 -right-1 w-2 h-2 rounded-full bg-yellow-400 shadow-sm" /></div>
          <div className="border-r border-b border-yellow-400/30 relative"><div className="absolute -bottom-1 -right-1 w-2 h-2 rounded-full bg-yellow-400 shadow-sm" /></div>
          <div className="border-b border-yellow-400/30" />
          <div className="border-r border-yellow-400/30" />
          <div className="border-r border-yellow-400/30" />
          <div />
        </div>
      );
    }

    if (overlay === "golden_ratio") {
      return (
        <div className="absolute inset-0 pointer-events-none z-[15] border border-amber-400/40 select-none">
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-amber-400/40 -translate-x-1/2" />
          <div className="absolute top-1/2 left-0 right-0 h-px bg-amber-400/40 -translate-y-1/2" />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full border border-amber-400 flex items-center justify-center font-meta text-[6px] text-amber-300 font-bold">
            🎯 Optical
          </div>
          <div className="absolute left-[38.2%] top-0 bottom-0 w-px border-l border-dashed border-amber-300/30" />
          <div className="absolute left-[61.8%] top-0 bottom-0 w-px border-l border-dashed border-amber-300/30" />
          <div className="absolute top-[38.2%] left-0 right-0 h-px border-t border-dashed border-amber-300/30" />
          <div className="absolute top-[61.8%] left-0 right-0 h-px border-t border-dashed border-amber-300/30" />
        </div>
      );
    }

    return null;
  };

  const handleSaveNewPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingPinCoord || !meeting || !activeMockup || !pinCommentDraft.trim()) return;

    const newPin: CanvasPin = {
      id: `pin_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      number: mockupPins.length + 1,
      x: pendingPinCoord.x,
      y: pendingPinCoord.y,
      text: pinCommentDraft.trim(),
      resolved: false,
      senderName: displayName,
      createdAt: new Date().toISOString(),
    };

    const updatedPins = [...mockupPins, newPin];
    setUndoStack((prev) => [...prev, { strokes: mockupStrokes, pins: mockupPins }]);
    setRedoStack([]);
    setMockupPins(updatedPins);
    setPendingPinCoord(null);
    setPinCommentDraft("");

    await updateMockupAnnotations(meeting.id, activeMockup.id, {
      strokes: mockupStrokes,
      pins: updatedPins,
    });
    toast.success(`Pin #${newPin.number} dropped!`);
  };

  const handleToggleResolvePin = async (pinId: string) => {
    if (!meeting || !activeMockup) return;
    const updated = mockupPins.map((p) => (p.id === pinId ? { ...p, resolved: !p.resolved } : p));
    setMockupPins(updated);
    await updateMockupAnnotations(meeting.id, activeMockup.id, {
      strokes: mockupStrokes,
      pins: updated,
    });
  };

  const handleDeletePin = async (pinId: string) => {
    if (!meeting || !activeMockup) return;
    const updated = mockupPins.filter((p) => p.id !== pinId);
    setMockupPins(updated);
    if (selectedPinDetail?.id === pinId) setSelectedPinDetail(null);
    await updateMockupAnnotations(meeting.id, activeMockup.id, {
      strokes: mockupStrokes,
      pins: updated,
    });
    toast.info("Pin removed.");
  };

  const handleUndoAnnotations = async () => {
    if (undoStack.length === 0 || !meeting || !activeMockup) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((stack) => stack.slice(0, -1));
    setRedoStack((stack) => [...stack, { strokes: mockupStrokes, pins: mockupPins }]);
    setMockupStrokes(prev.strokes);
    setMockupPins(prev.pins);
    await updateMockupAnnotations(meeting.id, activeMockup.id, prev);
    toast.info("Undo markup");
  };

  const handleRedoAnnotations = async () => {
    if (redoStack.length === 0 || !meeting || !activeMockup) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((stack) => stack.slice(0, -1));
    setUndoStack((stack) => [...stack, { strokes: mockupStrokes, pins: mockupPins }]);
    setMockupStrokes(next.strokes);
    setMockupPins(next.pins);
    await updateMockupAnnotations(meeting.id, activeMockup.id, next);
    toast.info("Redo markup");
  };

  const handleClearAnnotations = () => {
    if (!meeting || !activeMockup) return;
    if (mockupStrokes.length === 0 && mockupPins.length === 0) {
      toast.info("Canvas is already clear.");
      return;
    }
    if (mockupPins.length > 0) {
      setShowClearConfirmModal(true);
    } else {
      handleClearDrawingsOnly();
    }
  };

  const handleClearDrawingsOnly = async () => {
    if (!meeting || !activeMockup) return;
    setUndoStack((prev) => [...prev, { strokes: mockupStrokes, pins: mockupPins }]);
    setRedoStack([]);
    setMockupStrokes([]);
    setShowClearConfirmModal(false);
    await updateMockupAnnotations(meeting.id, activeMockup.id, {
      strokes: [],
      pins: mockupPins,
    });
    toast.success("Drawings cleared (Pins preserved)");
  };

  const handleClearAllAnnotations = async () => {
    if (!meeting || !activeMockup) return;
    setUndoStack((prev) => [...prev, { strokes: mockupStrokes, pins: mockupPins }]);
    setRedoStack([]);
    setMockupStrokes([]);
    setMockupPins([]);
    setShowClearConfirmModal(false);
    await updateMockupAnnotations(meeting.id, activeMockup.id, {
      strokes: [],
      pins: [],
    });
    toast.info("All drawings and pins cleared.");
  };

  const handleExportMarkedProof = () => {
    if (!activeMockup) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = activeMockup.image;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1400, img.naturalWidth || 1400);
      canvas.height = Math.max(900, img.naturalHeight || 900);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      if (canvasBackdrop === "black") {
        ctx.fillStyle = "#000000";
      } else if (canvasBackdrop === "white") {
        ctx.fillStyle = "#ffffff";
      } else {
        ctx.fillStyle = "#0a0a0a";
      }
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      mockupStrokes.forEach((stroke) => {
        if (!stroke.points || stroke.points.length < 2) return;
        ctx.save();
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.width * (canvas.width / 900);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        if (stroke.tool === "highlighter") ctx.globalAlpha = 0.45;

        if (stroke.tool === "rect" && stroke.points.length >= 2) {
          const p0 = stroke.points[0];
          const p1 = stroke.points[stroke.points.length - 1];
          const x = (p0.x / 100) * canvas.width;
          const y = (p0.y / 100) * canvas.height;
          const w = ((p1.x - p0.x) / 100) * canvas.width;
          const h = ((p1.y - p0.y) / 100) * canvas.height;
          ctx.strokeRect(x, y, w, h);
        } else if (stroke.tool === "circle" && stroke.points.length >= 2) {
          const p0 = stroke.points[0];
          const p1 = stroke.points[stroke.points.length - 1];
          const cx = ((p0.x + p1.x) / 2 / 100) * canvas.width;
          const cy = ((p0.y + p1.y) / 2 / 100) * canvas.height;
          const rx = Math.abs((p1.x - p0.x) / 2 / 100) * canvas.width;
          const ry = Math.abs((p1.y - p0.y) / 2 / 100) * canvas.height;
          ctx.beginPath();
          ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.beginPath();
          stroke.points.forEach((pt, i) => {
            const px = (pt.x / 100) * canvas.width;
            const py = (pt.y / 100) * canvas.height;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          });
          ctx.stroke();
        }
        ctx.restore();
      });

      mockupPins.forEach((pin) => {
        const px = (pin.x / 100) * canvas.width;
        const py = (pin.y / 100) * canvas.height;
        ctx.save();
        ctx.fillStyle = pin.resolved ? "#10b981" : "#06b6d4";
        ctx.beginPath();
        ctx.arc(px, py, 14 * (canvas.width / 900), 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 2 * (canvas.width / 900);
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();
        ctx.fillStyle = "#ffffff";
        ctx.font = `bold ${11 * (canvas.width / 900)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(pin.number), px, py);
        ctx.restore();
      });

      // Studio Footer Stamping
      ctx.fillStyle = "rgba(0,0,0,0.85)";
      ctx.fillRect(0, canvas.height - 40, canvas.width, 40);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 13px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`Social Kon10 Studio · ${activeMockup.title} · ${new Date().toLocaleDateString()}`, 20, canvas.height - 15);

      const link = document.createElement("a");
      link.download = `proof-${activeMockup.title.toLowerCase().replace(/\s+/g, "-")}-review.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      toast.success("Marked Proof Exported!");
    };
    img.onerror = () => {
      toast.error("Could not load image for export.");
    };
  };

  const handleArtworkFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Artwork file size must be under 8MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setUploadImagePreview(result);
      if (!uploadTitle) {
        setUploadTitle(file.name.replace(/\.[^/.]+$/, ""));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAddArtworkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!meeting) return;
    const finalImage = uploadImagePreview || uploadImageUrl.trim();
    if (!finalImage) {
      toast.error("Please upload an image file or enter an image URL.");
      return;
    }
    if (!uploadTitle.trim()) {
      toast.error("Please enter a title for this deliverable.");
      return;
    }

    setIsUploadingArtwork(true);
    try {
      await addMeetingProofingArtwork(meeting.id, {
        title: uploadTitle.trim(),
        category: uploadCategory,
        image: finalImage,
        notes: uploadNotes.trim() || "Live review draft",
        uploadedBy: displayName,
      });

      toast.success("Artwork added to Live Proofing Canvas!");
      setShowUploadModal(false);
      setUploadTitle("");
      setUploadNotes("");
      setUploadImageUrl("");
      setUploadImagePreview(null);
    } catch (err: any) {
      console.error("Add artwork error:", err);
      toast.error("Failed to add artwork. Please try again.");
    } finally {
      setIsUploadingArtwork(false);
    }
  };

  const handleRemoveArtwork = async (artworkId: string) => {
    if (!meeting) return;
    try {
      await removeMeetingProofingArtwork(meeting.id, artworkId);
      toast.info("Artwork removed from proofing canvas.");
    } catch (err: any) {
      console.error("Remove artwork error:", err);
      toast.error("Failed to remove artwork.");
    }
  };

  const handleSampleColorEyeDropper = async () => {
    if (typeof window !== "undefined" && "EyeDropper" in window) {
      try {
        const eyeDropper = new (window as any).EyeDropper();
        const result = await eyeDropper.open();
        if (result?.sRGBHex) {
          setProofStrokeColor(result.sRGBHex);
          navigator.clipboard.writeText(result.sRGBHex).catch(() => {});
          toast.success(`Color sampled & copied: ${result.sRGBHex}`);
        }
      } catch {
        // Canceled
      }
    } else {
      toast.info("Click a color from the quick palette to select.");
    }
  };

  const handleSubmitProofFeedback = async (approved: boolean) => {
    if (!meeting) return;
    const text = proofFeedbackDraft.trim() || (approved ? "Deliverable concept approved by client!" : "Revision requested.");
    setProofFeedbackDraft("");
    await submitMeetingProofFeedback(
      meeting.id,
      displayName,
      text,
      approved,
      activeMockup,
      mockupPins,
      mockupStrokes.length
    );
    toast.success(
      approved
        ? `✓ Approved: ${activeMockup.title} (${mockupPins.length} pin ${mockupPins.length === 1 ? 'note' : 'notes'} saved)`
        : `Revision recorded: ${activeMockup.title} (${mockupPins.length} pin ${mockupPins.length === 1 ? 'note' : 'notes'} saved)`
    );
  };

  const handleToggleProofingSession = async () => {
    if (!meeting) return;
    const nextActive = !(meeting.liveProofing?.active ?? false);
    await setMeetingLiveProofing(meeting.id, {
      active: nextActive,
      mockupIndex: proofingIndex,
      presenterId: myParticipantId,
      presenterName: displayName,
    });
    if (nextActive) {
      setActiveDrawer("proofing");
      toast.success("Live Deliverables Proofing broadcast started!");
    } else {
      toast.info("Proofing session stopped.");
    }
  };

  const handleSendReaction = async (emoji: "thumbs_up" | "heart" | "laugh" | "clap" | "celebrate" | "question") => {
    const symbolMap = {
      thumbs_up: "👍",
      heart: "❤️",
      laugh: "😂",
      clap: "👏",
      celebrate: "🎉",
      question: "❓",
    };
    const id = `rx_${Date.now()}_${Math.random()}`;
    const x = Math.floor(Math.random() * 60) + 20; // 20% to 80% left
    setFloatingReactions((prev) => [...prev, { id, emoji: symbolMap[emoji], x, senderName: displayName }]);
    setTimeout(() => {
      setFloatingReactions((prev) => prev.filter((r) => r.id !== id));
    }, 2800);

    if (meeting) {
      await sendMeetingReaction(meeting.id, myParticipantId, displayName, symbolMap[emoji], x);
    }
  };

  const handleToggleRaiseHand = () => {
    const next = !isHandRaised;
    setIsHandRaised(next);
    if (next) {
      playHandRaiseChime();
      triggerHapticFeedback([180, 80, 180]);
    }
    if (meeting) {
      if (next) {
        queueRaise(meeting.id, myParticipantId, displayName).catch(() => {
          // fallback to simple boolean if queue fails
          updateParticipant(meeting.id, myParticipantId, { isHandRaised: true });
        });
      } else {
        queueWithdraw(meeting.id, myParticipantId).catch(() => {
          updateParticipant(meeting.id, myParticipantId, { isHandRaised: false });
        });
      }
    }
    toast.info(next ? "Hand raised ✋" : "Hand lowered");
  };

  const handleHostInviteNextSpeaker = async () => {
    if (!meeting || !isHost) return;
    try {
      const invited = await queueInviteNext(meeting.id, myParticipantId);
      if (!invited) {
        toast.info("No one waiting in the queue.");
      } else {
        toast.success(`Invited ${invited.displayName} to speak.`);
      }
    } catch (e) {
      toast.error("Failed to invite next speaker.");
    }
  };

  const handleAcceptSpeakerInvite = async () => {
    if (!meeting) return;
    try {
      await queueAccept(meeting.id, myParticipantId);
      setSpeakerQueueInvite(null);
      toast.success("You're now speaking! 🎤");
    } catch { toast.error("Could not accept — invite may have expired."); }
  };

  const handleDeclineSpeakerInvite = async () => {
    if (!meeting) return;
    try {
      await queueDecline(meeting.id, myParticipantId);
      setSpeakerQueueInvite(null);
      setIsHandRaised(false);
    } catch { toast.error("Could not decline."); }
  };

  const handleFinishSpeaking = async () => {
    if (!meeting) return;
    await queueFinish(meeting.id, myParticipantId);
    setIsHandRaised(false);
    toast.info("Turn complete.");
  };

  const handleSkipQueueEntry = async (entryId: string) => {
    if (!meeting || !isHost) return;
    await queueSkip(meeting.id, entryId);
  };

  // Agenda handlers
  const handleAddAgendaItem = async () => {
    if (!meeting || !newAgendaTitle.trim()) return;
    try {
      await addAgendaItem(meeting.id, {
        title: newAgendaTitle.trim(),
        plannedDurationSeconds: newAgendaDuration * 60,
      });
      setNewAgendaTitle("");
      setNewAgendaDuration(5);
      setAgendaFormOpen(false);
      toast.success("Agenda item added.");
    } catch { toast.error("Failed to add agenda item."); }
  };

  const handleStartAgendaItem = async (itemId: string) => {
    if (!meeting || !isHost) return;
    await startAgendaItem(meeting.id, itemId);
    toast.info("Timer started.");
  };

  const handlePauseAgendaItem = async (itemId: string) => {
    if (!meeting || !isHost) return;
    await pauseAgendaItem(meeting.id, itemId);
  };

  const handleResumeAgendaItem = async (itemId: string) => {
    if (!meeting || !isHost) return;
    await resumeAgendaItem(meeting.id, itemId);
  };

  const handleCompleteAgendaItem = async (itemId: string) => {
    if (!meeting || !isHost) return;
    await completeAgendaItem(meeting.id, itemId);
  };

  const handleExtendAgendaTimer = async (itemId: string, secs: number) => {
    if (!meeting || !isHost) return;
    await extendAgendaItemTimer(meeting.id, itemId, secs);
    toast.success(`+${secs / 60} min added.`);
  };

  const handleDeleteAgendaItem = async (itemId: string) => {
    if (!meeting || !isHost) return;
    await deleteAgendaItem(meeting.id, itemId);
  };

  // Action board handlers
  const handleProposeAction = async () => {
    if (!meeting || !newActionTitle.trim()) return;
    try {
      await proposeActionItem(meeting.id, {
        title: newActionTitle.trim(),
        proposedBy: myParticipantId,
        proposedByName: displayName,
        assigneeName: newActionAssignee.trim() || undefined,
      });
      setNewActionTitle("");
      setNewActionAssignee("");
      setActionFormOpen(false);
      toast.success("Action item proposed.");
    } catch { toast.error("Failed to propose action item."); }
  };

  const handleApproveAction = async (itemId: string) => {
    if (!meeting) return;
    await setActionItemApproval(meeting.id, itemId, "approved", displayName);
    toast.success("Action approved ✓");
  };

  const handleRejectAction = async (itemId: string) => {
    if (!meeting) return;
    await setActionItemApproval(meeting.id, itemId, "rejected", displayName);
  };

  const handleUpdateActionStatus = async (itemId: string, status: ActionItemStatus) => {
    if (!meeting) return;
    await updateActionItemStatus(meeting.id, itemId, status);
  };

  const handleDeleteAction = async (itemId: string) => {
    if (!meeting || !isHost) return;
    await deleteActionItem(meeting.id, itemId);
  };

  const handleLowerParticipantHand = (participantId: string) => {
    if (!meeting || !isHost) return;
    updateParticipant(meeting.id, participantId, { isHandRaised: false });
    toast.info("Hand lowered.");
  };

  const handleSpotlightParticipant = (participantId: string | null) => {
    lastManualPinRef.current = Date.now();
    setPinnedParticipantId((prev) => (prev === participantId ? null : participantId));
    if (participantId) {
      const p = meeting?.participants.find((x) => x.id === participantId);
      toast.info(`Spotlight: ${p?.displayName || "Participant"}`);
    } else {
      setViewMode("gallery");
      toast.info("Spotlight cleared. Grid view active.");
    }
  };

  const handleViewModeChange = (next: "gallery" | "speaker") => {
    setViewMode(next);
    if (next === "speaker" && !pinnedParticipantId) {
      // Default the stage to the host, else the first remote participant,
      // else self — speaker-follow takes over as soon as someone talks.
      const fallback =
        activeParticipants.find((p) => p.role === "host")?.id ??
        otherConnectedParticipants[0]?.id ??
        myParticipantId;
      setPinnedParticipantId(fallback);
    }
    if (next === "gallery") {
      setPinnedParticipantId(null);
    }
  };

  const handleGenerateAiSummary = async () => {
    if (!meeting) return;
    setIsGeneratingAi(true);
    try {
      const messages = chatMessages.map((m) => `${m.senderName}: ${m.message}`);
      await generateMeetingIntelligence(meeting.id, meeting.title, messages);
      toast.success("AI Meeting Summary & Decisions generated!");
    } catch {
      toast.error("Failed to generate AI summary.");
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const handleLeaveMeeting = async () => {
    if (meeting) {
      await updateParticipant(meeting.id, myParticipantId, {
        status: "left",
        leftAt: new Date().toISOString(),
      });
    }
    stopMediaStream(localStream);
    stopMediaStream(screenStream);
    setPhase("ended");
  };

  // Keep the seat-lock heartbeat able to invoke the LATEST leave handler
  // (it is defined far below the lock effect, so a ref avoids stale closures).
  useEffect(() => {
    leaveMeetingFnRef.current = handleLeaveMeeting;
  });

  const handleEndForAll = async () => {
    if (!meeting || !isHost) return;
    // Dangerous action — always confirm first (Zoom parity).
    if (!window.confirm("End this meeting for ALL participants? Everyone will be disconnected.")) return;
    await endMeetingForAll(meeting.id);
    stopMediaStream(localStream);
    stopMediaStream(screenStream);
    setPhase("ended");
    toast.info("Meeting ended for all participants.");
  };

  // Duplicate-tab takeover screen (Zoom parity: "Join from this device").
  // Shown when another tab already holds this room's live seat.
  if (tabConflict) {
    return (
      <div className="min-h-[85vh] flex flex-col items-center justify-center p-4 sm:p-6 text-center max-w-md mx-auto">
        <div className="w-16 h-16 rounded-2xl bg-[var(--dept-soft)] border border-[var(--dept)]/40 flex items-center justify-center text-3xl mx-auto mb-4 dept-accent shadow-sm">
          ⚠️
        </div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold uppercase">Already Joined Elsewhere</h1>
        <p className="text-xs text-[var(--muted)] mt-1.5 max-w-sm">
          This meeting is already open in another tab or window. Joining here will disconnect the other one.
        </p>
        <div className="w-full mt-6 p-6 border border-[var(--line)] bg-[var(--panel)] rounded-2xl shadow-xl space-y-3">
          <button
            type="button"
            className="btn btn-dept w-full !py-3 font-display text-xs font-bold uppercase tracking-wider shadow-md"
            onClick={() => {
              // Take over the seat — the other tab's heartbeat notices the
              // foreign lock within ~5s and leaves gracefully.
              writeTabLock();
              tabLockHeldRef.current = true;
              setTabConflict(false);
            }}
          >
            Join Here Instead
          </button>
          <button
            type="button"
            className="btn btn-ghost w-full !py-2 !px-4 text-xs"
            onClick={() => navigate(-1)}
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // Direct Code Entry when landing on /meet without a roomId
  if (!roomId) {
    return (
      <div className="min-h-[85vh] flex flex-col items-center justify-center p-4 sm:p-6 text-center max-w-md mx-auto">
        <div className="w-16 h-16 rounded-2xl bg-[var(--dept-soft)] border border-[var(--dept)]/40 flex items-center justify-center text-3xl mx-auto mb-4 dept-accent shadow-sm">
          🎥
        </div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold uppercase">Join a Studio Meeting</h1>
        <p className="text-xs text-[var(--muted)] mt-1.5 max-w-sm">
          Enter the Meeting Code or Room PIN shared by your designer or host.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget as HTMLFormElement;
            const codeInput = (form.elements.namedItem("meetingCode") as HTMLInputElement).value.trim();
            const passInput = (form.elements.namedItem("passcode") as HTMLInputElement).value.trim();
            const cleanCode = codeInput
              .replace(/^https?:\/\/[^\/]+\/meet\//i, "")
              .replace(/^socialkon10\.pro\/meet\//i, "")
              .replace(/^www\.socialkon10\.pro\/meet\//i, "")
              .replace(/^\/meet\//i, "")
              .trim();
            if (!cleanCode) {
              toast.error("Please enter a meeting code or link.");
              return;
            }
            navigate(`/meet/${cleanCode}${passInput ? `?pass=${encodeURIComponent(passInput)}` : ""}`);
          }}
          className="w-full mt-6 p-6 border border-[var(--line)] bg-[var(--panel)] rounded-2xl shadow-xl text-left space-y-4"
        >
          <div>
            <label className="font-meta text-[9px] uppercase font-bold text-[var(--muted)] block mb-1">
              Meeting Code or URL *
            </label>
            <input
              name="meetingCode"
              type="text"
              required
              placeholder="e.g. sk-748-291 or paste link"
              className="w-full bg-[var(--bg)] border border-[var(--line)] px-3.5 py-2.5 text-xs rounded-lg outline-none focus:border-[var(--dept)] font-mono"
            />
          </div>

          <div>
            <label className="font-meta text-[9px] uppercase font-bold text-[var(--muted)] block mb-1">
              Meeting Passcode / PIN (Optional)
            </label>
            <input
              name="passcode"
              type="text"
              placeholder="6-digit PIN if required"
              className="w-full bg-[var(--bg)] border border-[var(--line)] px-3.5 py-2.5 text-xs rounded-lg outline-none focus:border-[var(--dept)] font-mono"
            />
          </div>

          <button
            type="submit"
            className="btn btn-dept w-full !py-3 font-display text-xs font-bold uppercase tracking-wider shadow-md"
          >
            Enter Meeting Room →
          </button>
        </form>

        <p className="font-meta text-[10px] text-[var(--muted)] mt-6">
          Registered client? Visit the <button onClick={() => navigate("/client")} className="underline font-bold text-[var(--ink)]">Client Portal</button> to view all your scheduled sessions.
        </p>
      </div>
    );
  }

  if (tabConflict) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto space-y-4">
        <span className="text-4xl">💻</span>
        <h2 className="font-display text-xl font-bold uppercase">Already Connected in Another Tab</h2>
        <p className="text-xs text-[var(--muted)]">
          You are already active in this meeting room in another browser tab or window. Only one active seat is allowed per participant.
        </p>
        <div className="flex items-center gap-3 justify-center pt-2">
          <button
            type="button"
            onClick={() => {
              writeTabLock();
              tabLockHeldRef.current = true;
              setTabConflict(false);
              toast.info("Switched to this tab.");
            }}
            className="btn btn-dept !py-2.5 !px-5 font-display text-xs font-bold uppercase tracking-wider shadow-md"
          >
            Use This Tab Instead
          </button>
          <button
            type="button"
            onClick={() => navigate("/meet")}
            className="btn btn-outline !py-2.5 !px-4 font-display text-xs font-bold uppercase"
          >
            Back to Meetings
          </button>
        </div>
      </div>
    );
  }

  if (loadingMeeting) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center p-6 text-center">
        <svg className="animate-spin h-8 w-8 text-[var(--dept)] mb-4" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
        <p className="font-display text-sm font-bold uppercase tracking-wider">Connecting to Studio Secure Room…</p>
        <p className="font-meta text-[10px] text-[var(--muted)] mt-1">Verifying room ID and security credentials</p>
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto space-y-4">
        <span className="text-4xl">📡</span>
        <h2 className="font-display text-xl font-bold uppercase">Meeting Not Found or Inactive</h2>
        <p className="text-xs text-[var(--muted)]">
          The requested meeting room code <code className="text-[var(--ink)] font-bold">"{roomId}"</code> was not found. Please double-check the code or re-enter below.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget as HTMLFormElement;
            const inputVal = (form.elements.namedItem("reCode") as HTMLInputElement).value.trim();
            const clean = normalizeRoomCode(inputVal);
            if (clean) navigate(`/meet/${clean}`);
          }}
          className="w-full p-4 bg-[var(--panel)] border border-[var(--line)] rounded-xl flex gap-2 shadow-sm"
        >
          <input
            name="reCode"
            type="text"
            required
            placeholder="Paste code or link (e.g. SK-ZZM-NQSU-WUZ)"
            className="flex-1 bg-[var(--bg)] border border-[var(--line)] px-3 py-2 text-xs rounded-lg outline-none font-mono focus:border-[var(--dept)]"
          />
          <button type="submit" className="btn btn-dept !py-2 !px-3 font-display text-[10px] font-bold uppercase shrink-0">
            Join →
          </button>
        </form>

        <div className="flex items-center justify-center gap-3 pt-2">
          <button onClick={() => navigate("/client")} className="btn btn-ghost !py-2 !px-4 text-xs">
            Return to Client Portal
          </button>
        </div>
      </div>
    );
  }

  /* -------------------------------------------------------------
     STATE 1: PRE-MEETING HARDWARE LOBBY
  ------------------------------------------------------------- */
  if (phase === "lobby") {
    const formattedDate = new Date(meeting.scheduledStart).toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const formattedTime = new Date(meeting.scheduledStart).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    return (
      <div className="min-h-[100dvh] pt-4 sm:pt-8 pb-16 px-3 sm:px-6 max-w-5xl mx-auto flex flex-col justify-start">
        {/* Header */}
        <div className="text-center mb-5 sm:mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-[var(--dept-soft)] border border-[var(--dept)]/30 rounded-full mb-2 sm:mb-3">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-meta text-[10px] uppercase font-bold text-[var(--dept)] tracking-wider">
              {meeting.type === "instant_voice_call" ? "Instant Voice Session" : "Studio Video Conference"}
            </span>
          </div>
          <h1 className="font-display text-xl sm:text-3xl font-bold uppercase tracking-tight">{meeting.title}</h1>
          <p className="font-meta text-[11px] sm:text-xs text-[var(--muted)] mt-1">
            Host: <strong className="text-[var(--ink)]">{meeting.hostName}</strong> · {formattedDate} at {formattedTime} ({userTimezone})
          </p>
        </div>

        {/* Host Waiting Room Banner in Lobby */}
        {isHost && waitingParticipants.length > 0 && (
          <div className="mb-6 p-4 sm:p-5 bg-amber-500/15 border-2 border-amber-500/50 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg animate-pulse">
            <div className="flex items-center gap-3">
              <span className="text-3xl">⏳</span>
              <div>
                <h3 className="font-display text-sm font-bold uppercase text-amber-300">
                  {waitingParticipants.length} Participant{waitingParticipants.length > 1 ? "s" : ""} in Waiting Room
                </h3>
                <p className="font-meta text-[10px] text-neutral-300 mt-0.5">
                  {waitingParticipants.map((p) => p.displayName).join(", ")} {waitingParticipants.length > 1 ? "are" : "is"} waiting to be admitted.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={async () => {
                  await admitAllParticipants(meeting.id);
                  handleJoinFromLobby();
                }}
                className="btn btn-dept w-full sm:w-auto !py-2.5 !px-4 font-display text-xs font-bold uppercase shadow-md"
              >
                ⚡ Admit &amp; Enter Room →
              </button>
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-12 gap-6 sm:gap-8 items-start">
          {/* LEFT: Video Preview & Volume Level */}
          <div className="lg:col-span-7 border border-[var(--line)] rounded-2xl bg-[var(--panel)] overflow-hidden shadow-lg p-3.5 sm:p-6">
            <div className="relative aspect-video min-h-[200px] sm:min-h-[240px] bg-neutral-950 rounded-xl overflow-hidden flex items-center justify-center border border-[var(--line)]">
              {!isVideoOff && localStream ? (
                <VideoTile stream={localStream} muted={true} isMirrored={true} />
              ) : (
                <div className="text-center p-4 sm:p-6 flex flex-col items-center justify-center w-full h-full">
                  {!localStream ? (
                    <div className="space-y-2.5 sm:space-y-3 w-full max-w-sm flex flex-col items-center">
                      <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-[var(--dept-soft)] border-2 border-[var(--dept)] flex items-center justify-center text-2xl sm:text-3xl dept-accent shadow-md">
                        🎙️
                      </div>
                      <div>
                        <p className="font-display text-xs sm:text-sm font-bold uppercase text-white">
                          Camera &amp; Microphone
                        </p>
                        <p
                          className="text-[11px] text-neutral-300 mt-0.5"
                          role={hardwareError ? "alert" : undefined}
                          aria-live="polite"
                        >
                          {hardwareError || "Tap below to grant access or join in listen mode."}
                        </p>
                      </div>
                      <div className="flex flex-col gap-2 w-full pt-1">
                        <button
                          type="button"
                          disabled={isRequestingMedia}
                          onClick={() => requestMediaPermissions(false)}
                          className="btn btn-dept w-full !py-2.5 sm:!py-3 font-display text-xs font-bold uppercase tracking-wider shadow-lg flex items-center justify-center gap-2"
                        >
                          {isRequestingMedia ? (
                            <>
                              <span className="animate-spin">⏳</span> Requesting Permissions...
                            </>
                          ) : (
                            <>
                              <span>🎙️</span> Tap to Enable Camera &amp; Mic
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowPermissionGuide(true)}
                          className="font-meta text-[9.5px] sm:text-[10px] py-1.5 px-3 rounded-lg border border-neutral-700 bg-neutral-800 text-neutral-300 hover:text-white"
                        >
                          📱 How to Allow on iPhone / Android
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-[var(--dept)]/20 border border-[var(--dept)] flex items-center justify-center text-xl sm:text-2xl font-bold mx-auto mb-2 dept-accent">
                        {displayName.slice(0, 2).toUpperCase()}
                      </div>
                      <p className="font-meta text-xs text-neutral-400">Camera is turned off</p>
                    </>
                  )}
                </div>
              )}

              {/* In-Preview Controls (Only shown when localStream is active) */}
              {localStream && (
                <div className="absolute bottom-3 sm:bottom-4 left-1/2 transform -translate-x-1/2 flex items-center gap-2.5 sm:gap-3 bg-neutral-900/90 backdrop-blur-md px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-full border border-neutral-700/80 shadow-lg">
                  <button
                    type="button"
                    onClick={handleToggleMic}
                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                      isMicMuted ? "bg-red-500 text-white" : "bg-neutral-800 text-white hover:bg-neutral-700 border border-neutral-700"
                    }`}
                    title={isMicMuted ? "Unmute Microphone" : "Mute Microphone"}
                    aria-label={isMicMuted ? "Unmute Microphone" : "Mute Microphone"}
                  >
                    {isMicMuted ? <MicOff className="w-4 h-4" strokeWidth={2} /> : <Mic className="w-4 h-4" strokeWidth={2} />}
                  </button>
                  <button
                    type="button"
                    onClick={handleToggleVideo}
                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                      isVideoOff ? "bg-red-500 text-white" : "bg-neutral-800 text-white hover:bg-neutral-700 border border-neutral-700"
                    }`}
                    title={isVideoOff ? "Turn Video On" : "Turn Video Off"}
                    aria-label={isVideoOff ? "Turn Video On" : "Turn Video Off"}
                  >
                    {isVideoOff ? <VideoOff className="w-4 h-4" strokeWidth={2} /> : <Video className="w-4 h-4" strokeWidth={2} />}
                  </button>
                </div>
              )}
            </div>

            {/* Live Audio Level Meter */}
            <div className="mt-4 flex items-center gap-3">
              <span className="font-meta text-[9px] uppercase font-bold text-[var(--muted)] shrink-0">Mic Level</span>
              <div className="flex-1 bg-[var(--line)] h-2 rounded-full overflow-hidden">
                <div
                  className="h-full transition-all duration-75"
                  style={{
                    width: `${micVolume}%`,
                    background: micVolume > 75 ? "rgb(239 68 68)" : micVolume > 40 ? "rgb(234 179 8)" : "rgb(16 185 129)",
                  }}
                />
              </div>
              <span className="font-meta text-[9px] text-[var(--muted)] w-8 text-right">{micVolume}%</span>
            </div>
          </div>

          {/* RIGHT: Device Selection & Join Form */}
          <div className="lg:col-span-5 border border-[var(--line)] rounded-2xl bg-[var(--panel)] p-4 sm:p-6 space-y-5 shadow-sm">
            <h3 className="font-display text-sm font-bold uppercase tracking-wider">Device &amp; Join Settings</h3>

            {/* Display Name */}
            <div>
              <label className="font-meta text-[9px] text-[var(--muted)] uppercase font-bold block mb-1">Your Name in Meeting</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter your name"
                className="w-full bg-[var(--bg)] border border-[var(--line)] px-3 py-2 text-xs rounded outline-none focus:border-[var(--dept)]"
              />
            </div>

            {/* Passcode (if required) */}
            {meeting.passcode && !isHost && (
              <div>
                <label className="font-meta text-[9px] text-[var(--muted)] uppercase font-bold block mb-1">Meeting Passcode (Required)</label>
                <input
                  type="text"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="Enter 6-digit passcode"
                  className="w-full bg-[var(--bg)] border border-[var(--line)] px-3 py-2 text-xs rounded outline-none focus:border-[var(--dept)]"
                />
              </div>
            )}

            {/* Microphone Selector */}
            <div>
              <label className="font-meta text-[9px] text-[var(--muted)] uppercase font-bold block mb-1">Microphone</label>
              <select
                value={selectedAudioInput}
                onChange={(e) => setSelectedAudioInput(e.target.value)}
                className="w-full bg-[var(--bg)] border border-[var(--line)] px-3 py-2 text-xs rounded outline-none focus:border-[var(--dept)] truncate"
              >
                {devices.audioInputs.map((d, i) => (
                  <option key={d.deviceId || i} value={d.deviceId}>{d.label || `Microphone ${i + 1}`}</option>
                ))}
              </select>
            </div>

            {/* Camera Selector */}
            <div>
              <label className="font-meta text-[9px] text-[var(--muted)] uppercase font-bold block mb-1">Camera</label>
              <select
                value={selectedVideoInput}
                onChange={(e) => setSelectedVideoInput(e.target.value)}
                className="w-full bg-[var(--bg)] border border-[var(--line)] px-3 py-2 text-xs rounded outline-none focus:border-[var(--dept)] truncate"
              >
                {devices.videoInputs.map((d, i) => (
                  <option key={d.deviceId || i} value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>
                ))}
              </select>
            </div>

            {/* Speaker Sound Test */}
            <div className="pt-1">
              <button
                type="button"
                onClick={handleTestSpeaker}
                disabled={isTestingSpeaker}
                className="w-full font-meta text-[10px] uppercase font-bold py-2 border border-[var(--line)] rounded bg-[var(--bg)] hover:border-[var(--dept)] transition-colors flex items-center justify-center gap-2"
              >
                <span>🔊</span> {isTestingSpeaker ? "Playing Test Chime…" : "Test Speaker Output"}
              </button>
            </div>

            {/* Join Action Buttons */}
            <div className="space-y-2 pt-2">
              <button
                onClick={() => handleJoinFromLobby(false)}
                className="btn btn-dept w-full !py-3 font-display text-xs font-bold uppercase tracking-wider shadow-md"
              >
                {isHost ? "🚀 Start Meeting as Host" : "Join Meeting Room →"}
              </button>

              <button
                type="button"
                onClick={() => handleJoinFromLobby(true)}
                className="w-full font-meta text-[10px] uppercase font-bold py-2 border border-[var(--line)] rounded-lg bg-[var(--bg)] hover:border-[var(--dept)] transition-colors text-[var(--muted)] hover:text-[var(--ink)]"
              >
                🎧 Join with Audio Only / Listener Mode
              </button>
            </div>

            {meeting.waitingRoomEnabled && !isHost && (
              <p className="font-meta text-[9px] text-[var(--muted)] text-center">
                ℹ️ Waiting room is enabled. You will enter the waiting lobby until admitted by the host.
              </p>
            )}

            {/* Host claim — demo mode has no auth, live mode requires sign-in.
                Without this, a host who isn't auto-recognized gets trapped with
                no way to admit waiting guests. */}
            {!isHost && !firebaseReady && (
              <button
                type="button"
                onClick={() => {
                  setClaimedHost(true);
                  toast.success("Host controls enabled (demo mode).");
                }}
                className="w-full font-meta text-[10px] uppercase font-bold py-2 border border-amber-500/50 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-300 hover:bg-amber-500/20 transition-colors"
              >
                👑 I'm the host — enable host controls (demo)
              </button>
            )}
            {!isHost && firebaseReady && !user && (
              <p className="font-meta text-[9.5px] text-[var(--muted)] text-center">
                👑 Hosting this meeting?{" "}
                <button type="button" onClick={() => navigate("/auth")} className="underline dept-accent font-bold">
                  Sign in for host controls
                </button>
              </p>
            )}
          </div>
        </div>

        {/* Camera & Mic Permission Guide Modal — All Platforms */}
        {showPermissionGuide && (
          <div className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-lg bg-[var(--panel)] border border-[var(--line-strong)] p-6 rounded-2xl shadow-2xl text-[var(--ink)] space-y-4 max-h-[90dvh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🎙️</span>
                  <h3 className="font-display text-sm font-bold uppercase">Camera &amp; Microphone Access Guide</h3>
                </div>
                <button onClick={() => setShowPermissionGuide(false)} className="text-[var(--muted)] hover:text-[var(--ink)] text-sm" aria-label="Close permission guide">✕</button>
              </div>

              <div className="space-y-3 text-xs">
                {/* Desktop Chrome */}
                <div className="p-3 bg-[var(--bg)] border border-[var(--line)] rounded-xl space-y-1.5">
                  <p className="font-bold text-[11px] uppercase flex items-center gap-1.5 text-blue-400">
                    <span>🖥️</span> Desktop Chrome / Edge / Brave
                  </p>
                  <ol className="list-decimal list-inside space-y-1 text-[11px] text-[var(--muted)] leading-relaxed">
                    <li>Look for the <strong>camera 📷 icon</strong> or <strong>lock 🔒</strong> in the address bar (far right or far left).</li>
                    <li>Click it, then click <strong>Allow</strong> next to Camera and Microphone.</li>
                    <li>If it says <strong>Blocked</strong>: go to <strong>Settings → Privacy &amp; Security → Site Settings → Camera / Microphone</strong> → remove this site from the blocked list.</li>
                    <li>Refresh and tap <strong>"Allow Media Access"</strong> below.</li>
                  </ol>
                </div>

                {/* Firefox Desktop */}
                <div className="p-3 bg-[var(--bg)] border border-[var(--line)] rounded-xl space-y-1.5">
                  <p className="font-bold text-[11px] uppercase flex items-center gap-1.5 text-orange-400">
                    <span>🦊</span> Firefox (Desktop &amp; Android)
                  </p>
                  <ol className="list-decimal list-inside space-y-1 text-[11px] text-[var(--muted)] leading-relaxed">
                    <li>Click the <strong>Lock 🔒</strong> icon to the left of the address bar.</li>
                    <li>Select <strong>Connection Secure → More Information</strong>.</li>
                    <li>Go to the <strong>Permissions</strong> tab.</li>
                    <li>Set <strong>Use the Camera</strong> and <strong>Use the Microphone</strong> to <strong>Allow</strong>.</li>
                    <li>Reload the page and click <strong>"Try Granting Access Now"</strong> below.</li>
                  </ol>
                </div>

                {/* iPhone / iPad */}
                <div className="p-3 bg-[var(--bg)] border border-[var(--line)] rounded-xl space-y-1.5">
                  <p className="font-bold text-[11px] uppercase flex items-center gap-1.5 text-cyan-400">
                    <span>🍎</span> iPhone / iPad (Safari)
                  </p>
                  <ol className="list-decimal list-inside space-y-1 text-[11px] text-[var(--muted)] leading-relaxed">
                    <li>Look at the URL address bar in Safari.</li>
                    <li>Tap the <strong>"aA"</strong> or <strong>Lock icon (🔒)</strong> next to the web address.</li>
                    <li>Select <strong>Website Settings</strong>.</li>
                    <li>Set <strong>Camera</strong> ➔ <strong>Allow</strong> &amp; <strong>Microphone</strong> ➔ <strong>Allow</strong>.</li>
                    <li>Tap <strong>Done</strong>, then tap <strong>"Try Granting Access Now"</strong> below.</li>
                  </ol>
                </div>

                {/* Android */}
                <div className="p-3 bg-[var(--bg)] border border-[var(--line)] rounded-xl space-y-1.5">
                  <p className="font-bold text-[11px] uppercase flex items-center gap-1.5 text-emerald-400">
                    <span>🤖</span> Android (Chrome)
                  </p>
                  <ol className="list-decimal list-inside space-y-1 text-[11px] text-[var(--muted)] leading-relaxed">
                    <li>Tap the <strong>Lock (🔒)</strong> or <strong>Tune (🎛️)</strong> icon to the left of the URL.</li>
                    <li>Tap <strong>Permissions</strong>.</li>
                    <li>Toggle ON both <strong>Camera</strong> and <strong>Microphone</strong>.</li>
                    <li>Return to the page and tap <strong>"Try Granting Access Now"</strong>.</li>
                  </ol>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <button
                  type="button"
                  disabled={isRequestingMedia}
                  onClick={() => requestMediaPermissions(false)}
                  className="btn btn-dept flex-1 !py-2.5 font-display text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-md"
                >
                  {isRequestingMedia ? (
                    <>
                      <span className="animate-spin">⏳</span> Requesting...
                    </>
                  ) : (
                    <>
                      <span>🎙️</span> Try Granting Access Now
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowPermissionGuide(false)}
                  className="px-4 py-2.5 rounded-lg border border-[var(--line)] text-xs text-[var(--muted)] hover:text-[var(--ink)]"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* -------------------------------------------------------------
     STATE 2: CLIENT WAITING ROOM
  ------------------------------------------------------------- */
  if (phase === "waiting_room") {
    return (
      <div className="min-h-[85vh] flex flex-col items-center justify-center p-6 text-center max-w-lg mx-auto">
        <div className="relative mb-6">
          <div className="w-24 h-24 rounded-full bg-[var(--dept)]/10 border-2 border-[var(--dept)] flex items-center justify-center text-4xl animate-pulse">
            ⏳
          </div>
        </div>
        <h2 className="font-display text-2xl font-bold uppercase">You are in the Waiting Room</h2>
        <p className="text-sm text-[var(--muted)] mt-2 leading-relaxed">
          The host has been notified that you are waiting to join <strong>"{meeting.title}"</strong>.
        </p>
        <div className="mt-8 p-4 border border-[var(--line)] bg-[var(--panel)] rounded-xl w-full text-left space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-[var(--muted)]">Meeting Host:</span>
            <span className="font-bold">{meeting.hostName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--muted)]">Your Name:</span>
            <span className="font-bold">{displayName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--muted)]">Status:</span>
            <span className="dept-accent font-bold">Waiting for host admission…</span>
          </div>
        </div>

        <button
          onClick={() => { setPhase("lobby"); }}
          className="font-meta text-[10px] text-[var(--muted)] hover:text-red-500 mt-6 underline"
        >
          Cancel and return to lobby
        </button>

        {/* Host claim — a host who isn't auto-recognized (demo mode, or signed
            out in live mode) would otherwise be trapped here with no way in. */}
        {!isHost && !firebaseReady && (
          <button
            type="button"
            onClick={async () => {
              setClaimedHost(true);
              await updateParticipant(meeting.id, myParticipantId, {
                role: "host",
                status: "joined",
                joinedAt: new Date().toISOString(),
              });
              setPhase("in_meeting");
              toast.success("Host controls enabled (demo mode) — you are in the meeting.");
            }}
            className="mt-4 font-meta text-[10px] uppercase font-bold px-4 py-2 border border-amber-500/50 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-300 hover:bg-amber-500/20 transition-colors"
          >
            👑 I'm the host — let me in (demo)
          </button>
        )}
        {!isHost && firebaseReady && !user && (
          <p className="font-meta text-[9.5px] text-[var(--muted)] mt-4">
            👑 Hosting this meeting?{" "}
            <button type="button" onClick={() => navigate("/auth")} className="underline dept-accent font-bold">
              Sign in to admit yourself &amp; guests
            </button>
          </p>
        )}
      </div>
    );
  }

  /* -------------------------------------------------------------
     STATE 3: ENDED
  ------------------------------------------------------------- */
  if (phase === "ended") {
    return (
      <div className="min-h-[85vh] flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto">
        <span className="text-5xl mb-4">👋</span>
        <h2 className="font-display text-2xl font-bold uppercase">Meeting Ended</h2>
        <p className="text-xs text-[var(--muted)] mt-2">
          Thank you for joining <strong>"{meeting.title}"</strong>.
        </p>
        {meeting.intelligence && (
          <div className="mt-6 p-4 border border-[var(--dept)]/40 bg-[var(--dept-soft)] rounded-xl text-left text-xs space-y-2">
            <p className="font-display font-bold uppercase dept-accent">✨ AI Meeting Summary</p>
            <p className="text-[var(--muted)] leading-relaxed">{meeting.intelligence.summary}</p>
          </div>
        )}
        <button onClick={() => navigate(isAdmin ? "/admin" : "/client")} className="btn btn-dept mt-8">
          Return to Portal
        </button>
      </div>
    );
  }

  /* -------------------------------------------------------------
     STATE 4: LIVE ZOOM-STYLE MEETING ROOM
  ------------------------------------------------------------- */
  return (
    <div
      ref={meetingContainerRef}
      className="fixed inset-0 z-50 h-[100dvh] max-h-[100dvh] w-screen bg-neutral-950 text-white flex flex-col select-none overflow-hidden"
    >
      {/* Subtle Glassmorphic Emoji Reactions with Particle Burst */}
      <div className="absolute inset-0 pointer-events-none z-50 overflow-hidden">
        {floatingReactions.map((r) => (
          <div
            key={r.id}
            className="absolute bottom-24 flex flex-col items-center gap-1 transition-all pointer-events-none"
            style={{
              left: `${r.x}%`,
              animation: "floatUp 2.8s cubic-bezier(0.16, 1, 0.3, 1) forwards",
            }}
          >
            <div className="relative">
              <div className="absolute -inset-2 rounded-full bg-[var(--dept)]/25 blur-sm animate-ping" />
              <div className="w-12 h-12 rounded-full bg-neutral-900/85 backdrop-blur-md border border-neutral-700/70 shadow-2xl flex items-center justify-center text-2xl animate-in zoom-in-50 duration-200">
                {r.emoji}
              </div>
            </div>
            {r.senderName && (
              <span className="font-meta text-[8px] px-2 py-0.5 rounded-full bg-black/70 backdrop-blur-sm text-neutral-300 border border-neutral-800">
                {r.senderName}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Stacked Floating Top Alerts (Waiting Room + Raised Hands) — high z-index so never hidden by stage overlays */}
      <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[65] flex flex-col items-center gap-2.5 w-[94%] max-w-xl pointer-events-none">
        {/* Floating Waiting Room Admission Banner */}
        {isHost && waitingParticipants.length > 0 && (
          <div
            role="alert"
            aria-live="assertive"
            className="pointer-events-auto w-full bg-neutral-900/95 border border-amber-500/50 ring-1 ring-amber-500/20 backdrop-blur-xl px-4 py-3 rounded-2xl shadow-2xl flex flex-wrap items-center justify-between gap-3 animate-in slide-in-from-top-4 duration-200"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-400 flex items-center justify-center shrink-0">
                <Bell className="w-4 h-4 animate-bounce" strokeWidth={2.2} />
              </div>
              <div className="min-w-0">
                <h4 className="font-display text-xs font-bold uppercase text-amber-300 tracking-wide">
                  {waitingParticipants.length} {waitingParticipants.length > 1 ? "People" : "Person"} Waiting in Lobby
                </h4>
                <p className="font-meta text-[9.5px] text-neutral-300 truncate max-w-xs">
                  {waitingParticipants.map((p) => p.displayName).join(", ")}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {waitingParticipants.map((p) => (
                <div key={p.id} className="flex items-center gap-1 bg-neutral-950/80 p-1 rounded-xl border border-neutral-800">
                  <button
                    type="button"
                    onClick={() => void admitParticipant(meeting.id, p.id)}
                    className="h-7 px-2.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-meta text-[9.5px] font-bold uppercase tracking-wider rounded-lg flex items-center gap-1 transition-all shadow-sm"
                    title={`Admit ${p.displayName}`}
                  >
                    <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                    <span>Admit {p.displayName.split(" ")[0]}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeParticipant(meeting.id, p.id)}
                    className="h-7 w-7 bg-neutral-800 hover:bg-red-600/90 text-neutral-400 hover:text-white rounded-lg flex items-center justify-center transition-colors"
                    title={`Decline ${p.displayName}`}
                    aria-label={`Decline ${p.displayName}`}
                  >
                    <X className="w-3.5 h-3.5" strokeWidth={2.2} />
                  </button>
                </div>
              ))}
              {waitingParticipants.length > 1 && (
                <button
                  type="button"
                  onClick={() => void admitAllParticipants(meeting.id)}
                  className="h-8 px-3 bg-amber-500 hover:bg-amber-400 active:scale-95 text-black font-meta text-[9.5px] font-bold uppercase tracking-wider rounded-xl shadow-sm transition-all"
                >
                  Admit All ({waitingParticipants.length})
                </button>
              )}
            </div>
          </div>
        )}

        {/* PRD Module 1 — Speaker Queue: Invitation banner for invited participant */}
        {speakerQueueInvite && (
          <div className="pointer-events-auto w-full max-w-md bg-neutral-900/98 border-2 border-emerald-400/60 backdrop-blur-xl px-4 py-3 rounded-2xl shadow-2xl flex items-center justify-between gap-4 animate-in slide-in-from-top-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 flex items-center justify-center shrink-0 text-lg animate-bounce">
                🎤
              </div>
              <div className="min-w-0">
                <p className="font-display text-xs font-bold text-emerald-300 uppercase">You're invited to speak!</p>
                <p className="font-meta text-[9px] text-neutral-400">The host has invited you to take the floor.</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button type="button" onClick={handleAcceptSpeakerInvite}
                className="h-8 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-meta text-[9px] font-bold rounded-xl transition-colors">
                Accept
              </button>
              <button type="button" onClick={handleDeclineSpeakerInvite}
                className="h-8 px-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-meta text-[9px] font-bold rounded-xl transition-colors">
                Decline
              </button>
            </div>
          </div>
        )}

        {/* PRD Module 2 — Agenda active item mini chip */}
        {(() => {
          const activeItem = (meeting?.agendaItems ?? []).find((it) => it.status === "active");
          if (!activeItem || activeDrawer === "agenda") return null;
          const remaining = activeItem.deadlineAt
            ? Math.max(0, Math.floor((new Date(activeItem.deadlineAt).getTime() - Date.now()) / 1000))
            : 0;
          const isOver = !!(activeItem.deadlineAt && Date.now() > new Date(activeItem.deadlineAt).getTime());
          const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
          void agendaTimerTick;
          return (
            <button type="button" onClick={() => setActiveDrawer("agenda")}
              className={`pointer-events-auto flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold transition-colors ${
                isOver ? "bg-red-950/80 border-red-500/50 text-red-300 animate-pulse" : "bg-emerald-950/80 border-emerald-500/40 text-emerald-300"
              }`}>
              <span>⏱</span>
              <span className="font-display text-[10px] truncate max-w-[120px]">{activeItem.title}</span>
              <span className="font-meta tabular-nums text-[10px]">{isOver ? "+" : ""}{fmt(remaining)}</span>
            </button>
          );
        })()}

        {/* Floating Attention Alert for Raised Hands */}
        {activeParticipants.some((p) => p.isHandRaised) && (
          <div className="pointer-events-auto w-full max-w-md bg-neutral-900/95 border border-amber-400/50 backdrop-blur-xl px-4 py-2.5 rounded-2xl shadow-2xl flex items-center justify-between gap-4 animate-in slide-in-from-top-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-400/40 text-amber-300 flex items-center justify-center shrink-0">
                <Hand className="w-4 h-4 animate-bounce" strokeWidth={2.2} />
              </div>
              <div className="min-w-0">
                <p className="font-display text-xs font-bold uppercase text-amber-300 truncate">
                  {activeParticipants.filter((p) => p.isHandRaised).map((p) => p.displayName).join(", ")}
                </p>
                <p className="font-meta text-[8.5px] text-neutral-400">Raised hand to speak</p>
              </div>
            </div>

            {isHost && (
              <button
                type="button"
                onClick={() => {
                  activeParticipants
                    .filter((p) => p.isHandRaised)
                    .forEach((p) => handleLowerParticipantHand(p.id));
                }}
                className="h-7 px-3 bg-amber-400 hover:bg-amber-300 text-black font-meta text-[9px] font-bold uppercase tracking-wider rounded-lg shrink-0 transition-colors"
              >
                Lower Hands
              </button>
            )}
          </div>
        )}
      </div>

      {/* Floating Alert When Live Proofing is Active & Drawer is Closed (Attendees Only, Dismissable) */}
      {meeting.liveProofing?.active &&
        !isHost &&
        meeting.liveProofing.presenterId !== myParticipantId &&
        activeDrawer !== "proofing" &&
        !isProofingMaximized &&
        dismissedProofBannerKey !== `${meeting.liveProofing.mockupIndex}` && (
        <div className="absolute top-20 sm:top-24 left-1/2 -translate-x-1/2 z-40 bg-neutral-900/95 border-2 border-[var(--dept)] p-3 rounded-2xl shadow-2xl backdrop-blur-md flex items-center justify-between gap-3 max-w-md w-[92%] animate-in slide-in-from-top-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-[var(--dept)]/20 border border-[var(--dept)]/40 text-[var(--dept)] flex items-center justify-center text-base shrink-0 animate-pulse">
              🎨
            </div>
            <div className="min-w-0">
              <p className="font-display text-xs font-bold uppercase text-white truncate">
                {meeting.liveProofing.presenterName || "Host"} is presenting Proof #{meeting.liveProofing.mockupIndex + 1}
              </p>
              <p className="font-meta text-[9px] text-[var(--muted)] truncate">
                {proofingMockups[meeting.liveProofing.mockupIndex]?.title || "Deliverable Concept"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                setActiveDrawer("proofing");
                setDismissedProofBannerKey(`${meeting.liveProofing?.mockupIndex}`);
              }}
              className="btn btn-dept !py-1.5 !px-3 font-display text-[10px] font-bold uppercase shrink-0 flex items-center gap-1 shadow-md"
            >
              👁️ Open Proof Canvas
            </button>
            <button
              type="button"
              onClick={() => setDismissedProofBannerKey(`${meeting.liveProofing?.mockupIndex}`)}
              className="w-7 h-7 rounded-full bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white flex items-center justify-center text-xs font-bold"
              title="Dismiss notification"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Top Header Bar */}
      <div className="h-12 sm:h-14 px-2.5 sm:px-6 border-b border-neutral-800 bg-neutral-900/90 flex items-center justify-between shrink-0 gap-2">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
          <h2 className="font-display text-xs sm:text-sm font-bold uppercase tracking-wider truncate max-w-[130px] sm:max-w-xs md:max-w-md">
            {meeting.title}
          </h2>
          <span className="font-meta text-[9px] px-2 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-neutral-400 hidden sm:inline shrink-0">
            {activeParticipants.length} Connected
          </span>
          {meeting.liveProofing?.active && (
            <button
              type="button"
              onClick={() => setActiveDrawer("proofing")}
              className={`font-meta text-[9px] px-2 py-0.5 rounded border flex items-center gap-1 transition-colors shrink-0 ${
                activeDrawer === "proofing" || isProofingMaximized
                  ? "bg-[var(--dept)] text-black border-[var(--dept)] font-bold"
                  : "bg-neutral-800 text-cyan-300 border-cyan-500/40 hover:bg-cyan-950/60"
              }`}
              title="Click to open Deliverable Proofing Showcase"
            >
              <span>🎨</span>
              <span className="hidden md:inline">Proof #{meeting.liveProofing.mockupIndex + 1} Active</span>
            </button>
          )}
          {pinnedParticipantId && (
            <span className="font-meta text-[9px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hidden sm:flex items-center gap-1 shrink-0">
              <span>⭐</span> Spotlight View
            </span>
          )}
          {meeting.meetingLocked && (
            <span className="font-meta text-[9px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40 hidden sm:inline shrink-0">
              🔒 Locked
            </span>
          )}
          {/* Live Screen / Studio Presentation Indicator in Header */}
          {(() => {
            const myRoomScope = myActiveBreakoutRoom ? myActiveBreakoutRoom.id : null;
            const remoteSharer = meeting?.participants.find(
              (p) =>
                Boolean(p.isScreenSharing) &&
                p.id !== myParticipantId &&
                p.id !== effectiveMyId &&
                (p.currentBreakoutRoomId || null) === myRoomScope
            );
            if (!remoteSharer && !isScreenSharing) return null;
            return (
              <button
                type="button"
                onClick={() => {
                  setActiveDrawer("none");
                  setIsProofingMaximized(false);
                }}
                className="font-meta text-[9px] px-2 py-0.5 rounded-full bg-cyan-950/80 text-cyan-300 border border-cyan-500/50 flex items-center gap-1 shadow-md animate-pulse font-bold shrink-0"
                title="Click to spotlight live screen presentation"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                <span className="truncate max-w-[90px] sm:max-w-none">{isScreenSharing ? "🔴 Sharing" : `🔴 ${remoteSharer?.displayName}`}</span>
              </button>
            );
          })()}
        </div>

        {/* Top Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Gallery / Speaker view switch (Zoom-style) */}
          <div className="flex items-center rounded-xl border border-neutral-800 bg-neutral-900/90 p-0.5" role="group" aria-label="View mode">
            <button
              type="button"
              onClick={() => handleViewModeChange("gallery")}
              aria-pressed={viewMode === "gallery" && !pinnedParticipantId}
              className={`font-meta text-[9px] px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-all ${
                viewMode === "gallery" && !pinnedParticipantId
                  ? "bg-neutral-800 text-white font-bold shadow-xs border border-neutral-700"
                  : "text-neutral-400 hover:text-white"
              }`}
              title="Gallery view — everyone in an equal grid"
            >
              <LayoutGrid className="w-3.5 h-3.5" strokeWidth={2} />
              <span className="hidden md:inline">Gallery</span>
            </button>
            <button
              type="button"
              onClick={() => handleViewModeChange("speaker")}
              aria-pressed={viewMode === "speaker" || Boolean(pinnedParticipantId)}
              className={`font-meta text-[9px] px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-all ${
                viewMode === "speaker" || pinnedParticipantId
                  ? "bg-neutral-800 text-white font-bold shadow-xs border border-neutral-700"
                  : "text-neutral-400 hover:text-white"
              }`}
              title="Speaker view — stage follows whoever is talking"
            >
              <UserSquare2 className="w-3.5 h-3.5" strokeWidth={2} />
              <span className="hidden md:inline">Speaker</span>
            </button>
          </div>

          {/* Host Auto-Spotlight Toggle */}
          {isHost && (
            <button
              type="button"
              onClick={() => {
                const next = !autoSpotlightActiveSpeaker;
                setAutoSpotlightActiveSpeaker(next);
                toast.info(next ? "Auto-Spotlight Active Speaker: ON" : "Auto-Spotlight: OFF");
              }}
              className={`font-meta text-[9px] h-8 px-2.5 rounded-xl border transition-all hidden md:flex items-center gap-1.5 ${
                autoSpotlightActiveSpeaker
                  ? "bg-cyan-500/15 border-cyan-500/40 text-cyan-300 font-bold"
                  : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-700"
              }`}
              title="Automatically feature who is speaking"
            >
              <Volume2 className="w-3.5 h-3.5" strokeWidth={2} />
              <span>{autoSpotlightActiveSpeaker ? "Auto-Spotlight ON" : "Auto-Spotlight"}</span>
            </button>
          )}

          {/* Live Proofing Button */}
          <button
            type="button"
            onClick={() => setActiveDrawer(activeDrawer === "proofing" ? "none" : "proofing")}
            className={`font-meta text-[9.5px] h-8 px-2.5 sm:px-3 rounded-xl font-bold flex items-center gap-1.5 border transition-all ${
              activeDrawer === "proofing"
                ? "bg-[var(--dept)] text-black border-[var(--dept)] shadow-xs"
                : "bg-neutral-900 border-neutral-800 text-neutral-200 hover:text-white hover:border-neutral-700"
            }`}
          >
            <Palette className="w-3.5 h-3.5" strokeWidth={2} />
            <span className="hidden sm:inline">Proof Canvas</span>
          </button>

          {/* Settings Modal Toggle */}
          <button
            type="button"
            onClick={() => setShowDeviceSettingsModal(true)}
            className="w-8 h-8 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-neutral-700 flex items-center justify-center text-neutral-300 hover:text-white transition-colors"
            title="Audio & Video Settings"
            aria-label="Audio & Video Settings"
          >
            <Settings className="w-3.5 h-3.5" strokeWidth={2} />
          </button>

          {/* Fullscreen Toggle */}
          <button
            type="button"
            onClick={handleToggleFullscreen}
            className="w-8 h-8 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-neutral-700 hidden sm:flex items-center justify-center text-neutral-300 hover:text-white transition-colors"
            title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
            aria-label={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" strokeWidth={2} /> : <Maximize2 className="w-3.5 h-3.5" strokeWidth={2} />}
          </button>

          <button
            type="button"
            onClick={() => setShareModalOpen(true)}
            className="font-meta text-[9.5px] h-8 px-2.5 sm:px-3 rounded-xl bg-[var(--dept)] text-[var(--on-dept)] font-bold flex items-center gap-1.5 hover:brightness-110 shadow-xs transition-all"
          >
            <Share2 className="w-3.5 h-3.5" strokeWidth={2.2} />
            <span className="hidden sm:inline">Invite</span>
          </button>
        </div>
      </div>

      {/* 1. ACTIVE BREAKOUT ROOM CONTROL BAR (Shown when user is inside a Breakout Room) */}
      {myActiveBreakoutRoom && (
        <div className="bg-gradient-to-r from-purple-950/95 via-indigo-950/90 to-purple-950/95 border-b border-purple-500/50 px-3 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-white z-20 shadow-lg shrink-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="h-2.5 w-2.5 rounded-full bg-purple-400 animate-pulse shrink-0" />
            <span className="font-meta text-[9px] px-2 py-0.5 rounded-full bg-purple-500/25 border border-purple-400/50 text-purple-200 font-extrabold uppercase tracking-wider shrink-0">
              🔀 Breakout Room
            </span>
            <p className="font-display text-xs sm:text-sm font-bold uppercase text-white truncate">
              {myActiveBreakoutRoom.name}
            </p>
            {myActiveBreakoutRoom.topic && (
              <span className="font-meta text-[10px] text-purple-200/80 hidden md:inline truncate max-w-xs">
                · {myActiveBreakoutRoom.topic}
              </span>
            )}
            <span className="font-meta text-[9px] px-2 py-0.5 rounded bg-black/40 border border-purple-500/30 text-purple-200 shrink-0">
              {otherConnectedParticipants.length + 1} in room
            </span>
            {breakoutRemainingSeconds !== null && (
              <span
                className={`font-mono text-[10px] px-2 py-0.5 rounded font-bold border shrink-0 ${
                  breakoutRemainingSeconds <= 60
                    ? "bg-red-500/25 border-red-400 text-red-200 animate-pulse"
                    : "bg-amber-500/20 border-amber-400/50 text-amber-200"
                }`}
                title="Breakout session countdown timer"
              >
                ⏱️ {formatBreakoutCountdown(breakoutRemainingSeconds)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {!isHost && (
              <button
                type="button"
                onClick={async () => {
                  const alreadyAsking = myParticipantRecord?.helpRequestedRoomId === myActiveBreakoutRoom.id;
                  const updated = await requestBreakoutHostHelp(
                    meeting.id,
                    myParticipantId,
                    alreadyAsking ? null : myActiveBreakoutRoom.id
                  );
                  if (updated) setMeeting({ ...updated });
                  toast.info(
                    alreadyAsking
                      ? "Host help request cancelled."
                      : `🆘 Alerted the Host to join "${myActiveBreakoutRoom.name}"!`
                  );
                }}
                className={`font-meta text-[9.5px] px-2.5 py-1 rounded-lg border font-bold flex items-center gap-1 transition-all ${
                  myParticipantRecord?.helpRequestedRoomId === myActiveBreakoutRoom.id
                    ? "bg-amber-500 text-black border-amber-300 animate-pulse"
                    : "bg-purple-900/70 hover:bg-purple-800 text-purple-100 border-purple-500/50"
                }`}
                title="Ask the meeting host to visit this breakout room"
              >
                <span>🆘</span>
                <span className="hidden sm:inline">
                  {myParticipantRecord?.helpRequestedRoomId === myActiveBreakoutRoom.id
                    ? "Host Notified"
                    : "Ask Host for Help"}
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setActiveDrawer(activeDrawer === "breakouts" ? "none" : "breakouts")}
              className="font-meta text-[9.5px] px-2.5 py-1 rounded-lg bg-purple-900/70 hover:bg-purple-800 text-purple-100 border border-purple-500/50 font-bold flex items-center gap-1 transition-colors"
            >
              <span>🔀</span>
              <span className="hidden sm:inline">Rooms</span>
            </button>
            <button
              type="button"
              onClick={async () => {
                const updated = await joinBreakoutRoom(meeting.id, myParticipantId, null);
                if (updated) setMeeting({ ...updated });
                toast.success("Returned to Main Stage");
              }}
              className="font-meta text-[9.5px] px-2.5 py-1 rounded-lg bg-white text-purple-950 hover:bg-purple-100 font-extrabold flex items-center gap-1 shadow-sm transition-colors"
              title="Leave this breakout room and return to the Main Stage"
            >
              <span>↩️</span>
              <span>Main Stage</span>
            </button>
          </div>
        </div>
      )}

      {/* 2. ASSIGNED BREAKOUT ROOM INVITATION BANNER (Shown on Main Stage when user has an open assigned room) */}
      {!myActiveBreakoutRoom && myAssignedBreakoutRoom && (
        <div className="bg-gradient-to-r from-purple-950/90 via-neutral-900 to-purple-950/90 border-b border-purple-500/40 px-3 sm:px-6 py-2 flex items-center justify-between gap-2 text-xs text-white z-20 shadow-md shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm shrink-0">🔀</span>
            <p className="font-meta text-[11px] text-purple-200 truncate">
              You are assigned to Breakout Room:{" "}
              <strong className="text-white font-display uppercase">{myAssignedBreakoutRoom.name}</strong>
              {myAssignedBreakoutRoom.topic ? ` — ${myAssignedBreakoutRoom.topic}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={async () => {
                const updated = await joinBreakoutRoom(meeting.id, myParticipantId, myAssignedBreakoutRoom.id);
                if (updated) setMeeting({ ...updated });
                toast.success(`Joined "${myAssignedBreakoutRoom.name}"`);
              }}
              className="btn btn-dept !py-1 !px-3 font-display text-[9.5px] font-bold uppercase shrink-0 shadow-sm"
            >
              🚪 Join Breakout Room
            </button>
          </div>
        </div>
      )}

      {/* 3. HOST BROADCAST ANNOUNCEMENT BANNER (Visible across Main Stage and all Breakout Rooms) */}
      {meeting.breakoutBroadcast &&
        meeting.breakoutBroadcast.id !== dismissedBroadcastId &&
        Date.now() - new Date(meeting.breakoutBroadcast.sentAt).getTime() < 90_000 && (
          <div className="bg-gradient-to-r from-amber-950/95 via-neutral-900 to-amber-950/95 border-b border-amber-400/60 px-3 sm:px-6 py-2 flex items-center justify-between gap-2 text-xs text-white z-20 shadow-lg shrink-0 animate-in slide-in-from-top-2 duration-200">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-base shrink-0">📢</span>
              <p className="font-meta text-[11px] text-amber-200 truncate">
                <strong className="uppercase font-display text-amber-300 mr-1.5">
                  Host Broadcast ({meeting.breakoutBroadcast.senderName}):
                </strong>
                <span className="text-white font-medium">{meeting.breakoutBroadcast.message}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDismissedBroadcastId(meeting.breakoutBroadcast?.id || null)}
              className="w-6 h-6 rounded-full bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white flex items-center justify-center text-[10px] font-bold shrink-0"
              title="Dismiss announcement"
            >
              ✕
            </button>
          </div>
        )}

      {/* Floating Screen Broadcast Alert for Attendees (Only shown when Stage is covered by a Drawer or Maximized Proofing) */}
      {(() => {
        const myRoomScope = myActiveBreakoutRoom ? myActiveBreakoutRoom.id : null;
        const remoteSharer = meeting?.participants.find(
          (p) =>
            Boolean(p.isScreenSharing) &&
            p.id !== myParticipantId &&
            p.id !== effectiveMyId &&
            (p.currentBreakoutRoomId || null) === myRoomScope
        );
        if (!remoteSharer || (activeDrawer === "none" && !isProofingMaximized)) return null;
        return (
          <div className="bg-gradient-to-r from-cyan-950 via-neutral-900 to-cyan-950 border-b border-cyan-500/50 px-3 sm:px-6 py-2 flex items-center justify-between gap-2 text-xs text-white z-20 shadow-lg">
            <div className="flex items-center gap-2 min-w-0">
              <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping shrink-0" />
              <p className="font-display text-[11px] sm:text-xs font-bold uppercase text-cyan-300 truncate">
                🔴 {remoteSharer.displayName} is sharing an application / screen
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setActiveDrawer("none");
                setIsProofingMaximized(false);
              }}
              className="btn btn-dept !py-1 !px-3 font-display text-[9px] font-bold uppercase shrink-0 shadow-md"
            >
              ⛶ Return to Stage
            </button>
          </div>
        );
      })()}

      {/* 2026 Application, Window, Tab & Co-Design Share Selection Modal */}
      {showScreenShareMenu && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="w-full max-w-lg bg-[var(--panel)] border border-[var(--line-strong)] p-4 sm:p-6 rounded-3xl shadow-2xl text-[var(--ink)] space-y-3.5 animate-in zoom-in-95 duration-150 max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                  <MonitorUp className="w-5 h-5" strokeWidth={2.2} />
                </div>
                <div>
                  <h3 className="font-display text-xs sm:text-sm font-bold uppercase tracking-wider">
                    Share Application, Screen or Co-Design
                  </h3>
                  <p className="font-meta text-[9.5px] text-[var(--muted)]">
                    2026 High-Definition Application Capture &amp; Studio Presentation
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowScreenShareMenu(false)}
                className="w-8 h-8 rounded-full bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white flex items-center justify-center text-xs font-bold"
              >
                ✕
              </button>
            </div>

            {/* Stream Quality & System Audio Optimization Bar */}
            <div className="p-2.5 rounded-2xl bg-[var(--bg)] border border-[var(--line)] flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className="font-meta text-[8.5px] uppercase font-bold text-[var(--muted)] px-1">
                  Optimize:
                </span>
                <button
                  type="button"
                  onClick={() => setScreenShareOptimizeFor("detail")}
                  className={`px-2.5 py-1 rounded-xl font-meta text-[9px] font-bold transition-all ${
                    screenShareOptimizeFor === "detail"
                      ? "bg-cyan-500 text-black shadow-sm"
                      : "bg-neutral-800/80 text-neutral-300 hover:text-white"
                  }`}
                  title="Prioritize razor-sharp 1080p/1440p resolution for Photoshop, Figma, Illustrator, and text"
                >
                  🎯 Crisp App &amp; Text
                </button>
                <button
                  type="button"
                  onClick={() => setScreenShareOptimizeFor("motion")}
                  className={`px-2.5 py-1 rounded-xl font-meta text-[9px] font-bold transition-all ${
                    screenShareOptimizeFor === "motion"
                      ? "bg-cyan-500 text-black shadow-sm"
                      : "bg-neutral-800/80 text-neutral-300 hover:text-white"
                  }`}
                  title="Prioritize 60fps fluid frame rate for Premiere, video playback, and animations"
                >
                  🎬 60fps Video
                </button>
              </div>

              <label className="flex items-center gap-1.5 cursor-pointer select-none px-1.5 py-0.5 rounded-lg hover:bg-neutral-800/50">
                <input
                  type="checkbox"
                  checked={screenShareWithAudio}
                  onChange={(e) => setScreenShareWithAudio(e.target.checked)}
                  className="rounded accent-emerald-500 w-3.5 h-3.5"
                />
                <span className="font-meta text-[9px] font-bold text-[var(--ink)]">
                  🔊 Share App / Tab Audio
                </span>
              </label>
            </div>

            {/* Mobile / Tablet Instant Presentation Fallback when OS restricts getDisplayMedia */}
            {!isDisplayMediaSupported() && (
              <div className="p-3.5 rounded-2xl border-2 border-cyan-500/60 bg-cyan-950/30 space-y-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-base">📱</span>
                  <p className="font-display text-[11px] font-bold uppercase text-cyan-300">
                    Mobile &amp; Tablet Live Presentation
                  </p>
                </div>
                <p className="font-meta text-[9.5px] text-neutral-300 leading-relaxed">
                  Mobile browsers restrict raw OS window capture. Present any mobile app screenshot, mockup, or photo live on the interactive Proofing Stage with real-time laser pointer &amp; markup pins:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowScreenShareMenu(false);
                      setShowUploadModal(true);
                    }}
                    className="p-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-display text-[10px] font-bold uppercase flex items-center justify-center gap-1.5 shadow-md"
                  >
                    <span>📤</span> Upload &amp; Present File
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowScreenShareMenu(false);
                      setActiveDrawer("proofing");
                    }}
                    className="p-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-cyan-500/40 text-cyan-300 font-display text-[10px] font-bold uppercase flex items-center justify-center gap-1.5"
                  >
                    <span>🎨</span> Open Live Proof Canvas
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {/* Option 1: Specific Software / Application Window (Primary 2026 Best Practice) */}
              <button
                type="button"
                onClick={() =>
                  handleStartScreenShare({
                    surface: "window",
                    optimizeFor: screenShareOptimizeFor,
                    withAudio: screenShareWithAudio,
                  })
                }
                className="w-full p-3.5 rounded-2xl border-2 border-emerald-500/70 bg-emerald-500/10 hover:bg-emerald-500/20 text-left flex items-center gap-3.5 transition-all group shadow-md"
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-500 text-black font-extrabold flex items-center justify-center text-lg shrink-0 group-hover:scale-105 transition-transform">
                  🪟
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-display text-xs font-bold uppercase text-[var(--ink)] group-hover:text-emerald-400">
                      Share Application Window
                    </p>
                    <span className="font-meta text-[7.5px] px-1.5 py-0.5 rounded bg-emerald-500 text-black font-bold uppercase">
                      Recommended for Apps
                    </span>
                  </div>
                  <p className="font-meta text-[9.5px] text-[var(--muted)] mt-0.5">
                    Share Photoshop, Illustrator, Figma, Premiere, InDesign, Keynote, or VS Code with auto-window focus &amp; privacy protection.
                  </p>
                </div>
              </button>

              {/* Option 2: Browser Tab + Audio */}
              <button
                type="button"
                onClick={() =>
                  handleStartScreenShare({
                    surface: "browser",
                    optimizeFor: screenShareOptimizeFor,
                    withAudio: true,
                  })
                }
                className="w-full p-3 rounded-2xl border border-[var(--line)] hover:border-cyan-400 bg-[var(--bg)] text-left flex items-center gap-3.5 transition-colors group"
              >
                <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-lg shrink-0">
                  🌐
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-display text-xs font-bold uppercase group-hover:text-cyan-400">
                      Browser Tab + Tab Audio
                    </p>
                    <span className="font-meta text-[7.5px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-bold uppercase">
                      Web &amp; Sound
                    </span>
                  </div>
                  <p className="font-meta text-[9.5px] text-[var(--muted)] mt-0.5">
                    Share a single Chrome/Edge tab, interactive website prototype, Canva, or video reference with direct tab audio.
                  </p>
                </div>
              </button>

              {/* Option 3: Entire Screen / Monitor */}
              <button
                type="button"
                onClick={() =>
                  handleStartScreenShare({
                    surface: "monitor",
                    optimizeFor: screenShareOptimizeFor,
                    withAudio: screenShareWithAudio,
                  })
                }
                className="w-full p-3 rounded-2xl border border-[var(--line)] hover:border-[var(--dept)] bg-[var(--bg)] text-left flex items-center gap-3.5 transition-colors group"
              >
                <div className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 flex items-center justify-center text-lg shrink-0">
                  🖥️
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-xs font-bold uppercase group-hover:text-[var(--dept)]">
                    Entire Screen / Monitor
                  </p>
                  <p className="font-meta text-[9.5px] text-[var(--muted)] mt-0.5">
                    Present your complete monitor workspace when switching across multiple desktop applications.
                  </p>
                </div>
              </button>

              {/* Option 4: Live Studio Co-Design */}
              <button
                type="button"
                onClick={() => handleStartStudioCoDesign()}
                className="w-full p-3 rounded-2xl border border-purple-500/40 bg-purple-950/20 hover:bg-purple-950/35 text-left flex items-center gap-3.5 transition-all group"
              >
                <div className="w-10 h-10 rounded-xl bg-[var(--dept)] text-black font-extrabold flex items-center justify-center text-lg shrink-0 group-hover:scale-105 transition-transform">
                  🎨
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-display text-xs font-bold uppercase text-[var(--ink)] group-hover:text-[var(--dept)]">
                      Launch KON10 Studio Co-Design
                    </p>
                    <span className="font-meta text-[7.5px] px-1.5 py-0.5 rounded bg-[var(--dept)] text-black font-bold uppercase">
                      Studio
                    </span>
                  </div>
                  <p className="font-meta text-[9.5px] text-[var(--muted)] mt-0.5">
                    Opens built-in vector editor &amp; starts live spotlight stream with 1-click snapshot freeze.
                  </p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live Studio Co-Design Template & Workspace Selector Modal */}
      {showStudioCoDesignModal && (
        <div className="fixed inset-0 z-[110] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-100 select-none">
          <div className="w-full max-w-lg bg-[var(--panel)] border border-[var(--line-strong)] rounded-3xl shadow-2xl p-5 sm:p-6 text-[var(--ink)] space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 text-lg font-bold">
                  🎨
                </div>
                <div>
                  <h3 className="font-display text-sm font-bold uppercase tracking-wider text-purple-300">
                    Live Studio Co-Design
                  </h3>
                  <p className="text-[10px] text-[var(--muted)] font-meta">
                    Choose what to edit live with your client. Starts 1080p 60fps screen broadcast.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowStudioCoDesignModal(false)}
                className="w-8 h-8 rounded-full bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white flex items-center justify-center text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 pt-1 max-h-[60vh] overflow-y-auto">
              {/* 1. Real Client Saved Designs from Studio */}
              {loadingClientDesigns ? (
                <p className="font-meta text-[10px] text-[var(--muted)] py-2 text-center">
                  Loading client designs from Firestore…
                </p>
              ) : clientDesigns.length > 0 ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-meta text-[9px] uppercase font-bold text-[var(--dept)] flex items-center gap-1">
                      <span>🎨</span> Client's Studio Designs ({clientDesigns.length})
                    </span>
                    <span className="font-meta text-[8px] text-[var(--muted)]">Live Firestore Work</span>
                  </div>
                  {clientDesigns.map((d) => (
                    <div
                      key={d.id}
                      className="w-full p-2.5 rounded-2xl border border-[var(--line)] hover:border-[var(--dept)] bg-[var(--bg)] text-left flex items-center gap-3 transition-all group shadow-sm"
                    >
                      {d.thumbnail && d.thumbnail.length > 50 ? (
                        <img
                          src={d.thumbnail}
                          alt={d.title}
                          className="w-12 h-12 rounded-xl object-contain bg-black border border-neutral-700 shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-neutral-800 flex items-center justify-center text-xl shrink-0">
                          📐
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <p className="font-display text-xs font-bold uppercase text-[var(--ink)] group-hover:text-[var(--dept)] truncate">
                            {d.title || "Untitled Design"}
                          </p>
                          <span className="font-meta text-[7.5px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-bold uppercase shrink-0">
                            v{d.version || 1}
                          </span>
                        </div>
                        <p className="font-meta text-[9px] text-[var(--muted)] mt-0.5 truncate">
                          {d.email ? `Client: ${d.email}` : "Customer Draft"} · {d.templateSlug || "Custom"}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            handleLaunchInMeetingCoDesign({
                              title: d.title || "Client Design Concept",
                              sourceType: "client_design",
                              sourceId: d.id,
                              backgroundImage: d.thumbnail,
                              headline: d.title,
                            })
                          }
                          className="px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-meta text-[9px] font-bold uppercase transition-colors"
                          title="Open interactive multi-user vector & typography canvas right in this meeting"
                        >
                          🎨 In-Meeting
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStartStudioCoDesign(d.templateSlug || d.id)}
                          className="px-2 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-meta text-[9px] font-bold uppercase transition-colors"
                          title="Pop out KON10 Studio Editor in a new tab with screen share"
                        >
                          ↗️ Pop-Out
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {/* 2. Session Deliverables & Mockups */}
              <div className="space-y-1.5 pt-2 border-t border-[var(--line)]">
                <span className="font-meta text-[9px] uppercase font-bold text-[var(--muted)] block">
                  Meeting Proofing Deliverables ({proofingMockups.length})
                </span>
                {proofingMockups.map((m, idx) => (
                  <div
                    key={m.id}
                    className={`w-full p-2.5 rounded-2xl border text-left flex items-center gap-3 transition-all group ${
                      idx === proofingIndex
                        ? "border-[var(--dept)] bg-[var(--dept)]/10 shadow-md"
                        : "border-[var(--line)] hover:border-neutral-500 bg-[var(--bg)]"
                    }`}
                  >
                    {m.image ? (
                      <img
                        src={m.image}
                        alt={m.title}
                        className="w-12 h-12 rounded-xl object-cover border border-neutral-700 shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-neutral-800 flex items-center justify-center text-xl shrink-0">
                        🖼️
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <p className="font-display text-xs font-bold uppercase text-[var(--ink)] group-hover:text-[var(--dept)] truncate">
                          {m.title}
                        </p>
                        {idx === proofingIndex && (
                          <span className="font-meta text-[7.5px] px-1.5 py-0.5 rounded bg-[var(--dept)] text-black font-bold uppercase shrink-0">
                            Active Proof
                          </span>
                        )}
                      </div>
                      <p className="font-meta text-[9px] text-[var(--muted)] mt-0.5 truncate">
                        {m.category} {m.uploadedBy ? `· by ${m.uploadedBy}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setProofingIndex(idx);
                          handleLaunchInMeetingCoDesign({
                            title: m.title,
                            sourceType: "deliverable",
                            sourceId: m.id,
                            backgroundImage: m.image,
                            categoryBadge: m.category,
                          });
                        }}
                        className="px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-meta text-[9px] font-bold uppercase transition-colors"
                        title="Open interactive multi-user vector & typography canvas right in this meeting"
                      >
                        🎨 In-Meeting
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setProofingIndex(idx);
                          handleStartStudioCoDesign(m.id);
                        }}
                        className="px-2 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-meta text-[9px] font-bold uppercase transition-colors"
                        title="Pop out KON10 Studio Editor in a new tab with screen share"
                      >
                        ↗️ Pop-Out
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* 3. Blank Collaborative Canvas */}
              <div className="pt-2 border-t border-[var(--line)]">
                <span className="font-meta text-[9px] uppercase font-bold text-[var(--muted)] block mb-1.5">
                  Or Start Blank Design Canvas:
                </span>
                <div className="flex flex-col sm:flex-row items-stretch gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      handleLaunchInMeetingCoDesign({
                        title: "Live Collaborative Post",
                        sourceType: "preset",
                        preset: "square_1080",
                      })
                    }
                    className="flex-1 p-3 rounded-2xl border border-purple-500/60 hover:border-purple-400 bg-purple-950/30 hover:bg-purple-950/50 text-left flex items-center gap-3 transition-all group"
                  >
                    <span className="text-2xl">🎨</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-xs font-bold uppercase text-purple-200 group-hover:text-purple-300">
                        🎨 In-Meeting Co-Design
                      </p>
                      <p className="font-meta text-[8.5px] text-neutral-300 mt-0.5">
                        Interactive synchronized vector & text canvas with live participant cursors.
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStartStudioCoDesign("quick-collab")}
                    className="p-3 rounded-2xl border border-neutral-700 hover:border-neutral-500 bg-neutral-900/80 hover:bg-neutral-900 text-left flex items-center gap-2.5 transition-all group shrink-0"
                    title="Open KON10 Studio full editor in new tab"
                  >
                    <span className="text-xl">↗️</span>
                    <div>
                      <p className="font-display text-xs font-bold uppercase text-neutral-200">
                        Pop-Out Editor
                      </p>
                      <p className="font-meta text-[8.5px] text-[var(--muted)]">
                        Studio WebRTC stream
                      </p>
                    </div>
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between border-t border-[var(--line)]">
              <span className="text-[9.5px] font-meta text-[var(--muted)]">
                💡 Tip: Use the client reaction HUD during live broadcast for feedback.
              </span>
              <button
                type="button"
                onClick={() => setShowStudioCoDesignModal(false)}
                className="px-3.5 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-bold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Meeting Dialog Modal */}
      {shareModalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[var(--panel)] border border-[var(--line-strong)] p-5 sm:p-6 rounded-2xl shadow-2xl text-[var(--ink)] space-y-4 animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">🔗</span>
                <h3 className="font-display text-sm font-bold uppercase">Share Meeting with Customer / Guests</h3>
              </div>
              <button onClick={() => setShareModalOpen(false)} className="text-[var(--muted)] hover:text-[var(--ink)] text-sm">✕</button>
            </div>

            <div className="grid grid-cols-2 gap-2 p-3 bg-[var(--bg)] border border-[var(--line)] rounded-xl">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-meta text-[8.5px] uppercase font-bold text-[var(--muted)] block">Meeting Code</span>
                  <span className="font-mono font-bold text-sm text-[var(--dept)] tracking-wider">{meeting.roomId}</span>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    const share = getMeetingShareDetails(meeting);
                    await share.copyRoomId();
                    toast.success(`Meeting code "${meeting.roomId}" copied!`);
                  }}
                  className="font-meta text-[9px] px-2 py-1 bg-[var(--panel)] border border-[var(--line)] rounded hover:border-[var(--dept)]"
                >
                  📋 Copy
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-meta text-[8.5px] uppercase font-bold text-[var(--muted)] block">Passcode PIN</span>
                  <span className="font-mono font-bold text-sm tracking-wider">{meeting.passcode || "None Required"}</span>
                </div>
                {meeting.passcode && (
                  <button
                    type="button"
                    onClick={async () => {
                      const share = getMeetingShareDetails(meeting);
                      await share.copyPasscode();
                      toast.success("PIN copied!");
                    }}
                    className="font-meta text-[9px] px-2 py-1 bg-[var(--panel)] border border-[var(--line)] rounded hover:border-[var(--dept)]"
                  >
                    📋 Copy
                  </button>
                )}
              </div>
            </div>

            {/* 1-Click Copy Link */}
            <div className="space-y-1.5">
              <label className="font-meta text-[9px] uppercase font-bold text-[var(--muted)]">Direct Join Link</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={`${window.location.origin}/meet/${meeting.roomId}`}
                  className="flex-1 bg-[var(--bg)] border border-[var(--line)] px-3 py-2 text-xs rounded-lg outline-none font-mono"
                />
                <button
                  onClick={async () => {
                    const share = getMeetingShareDetails(meeting);
                    await share.copyInviteLink();
                    toast.success("Meeting link copied to clipboard!");
                  }}
                  className="btn btn-dept !py-2 !px-3 font-display text-[10px] font-bold uppercase shrink-0"
                >
                  Copy Link
                </button>
              </div>
            </div>

            {/* Sharing Action Grid */}
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[var(--line)]">
              <button
                onClick={async () => {
                  const share = getMeetingShareDetails(meeting);
                  await share.copyFullInvitation();
                  toast.success("Full formatted invitation copied!");
                }}
                className="p-2.5 rounded-xl border border-[var(--line)] hover:border-[var(--dept)] bg-[var(--bg)] text-center text-xs flex flex-col items-center gap-1 transition-colors"
              >
                <span className="text-base">✉️</span>
                <span className="font-meta text-[9px] font-bold">Copy Invite</span>
              </button>

              <button
                onClick={() => {
                  const share = getMeetingShareDetails(meeting);
                  share.shareWhatsApp();
                }}
                className="p-2.5 rounded-xl border border-emerald-500/30 hover:border-emerald-500 bg-emerald-500/10 text-emerald-500 text-center text-xs flex flex-col items-center gap-1 transition-colors"
              >
                <span className="text-base">💬</span>
                <span className="font-meta text-[9px] font-bold">WhatsApp</span>
              </button>

              <button
                onClick={() => {
                  const share = getMeetingShareDetails(meeting);
                  share.shareEmail();
                }}
                className="p-2.5 rounded-xl border border-[var(--line)] hover:border-[var(--dept)] bg-[var(--bg)] text-center text-xs flex flex-col items-center gap-1 transition-colors"
              >
                <span className="text-base">📧</span>
                <span className="font-meta text-[9px] font-bold">Email App</span>
              </button>
            </div>

            {/* How someone else can join instructions */}
            <div className="p-2.5 rounded-lg bg-[var(--bg)] border border-[var(--line)] text-[10px] text-[var(--muted)] space-y-1">
              <p className="font-bold text-[var(--ink)]">💡 Want someone else to join?</p>
              <p>They can go to <code className="text-[var(--ink)]">socialkon10.pro/meet</code> and enter Code: <strong className="text-[var(--ink)]">{meeting.roomId}</strong>{meeting.passcode ? ` (PIN: ${meeting.passcode})` : ""}.</p>
            </div>

            <div className="pt-2 flex justify-between items-center text-[10px] text-[var(--muted)]">
              <span>Need calendar invite?</span>
              <button onClick={() => downloadCalendarIcs(meeting)} className="underline hover:text-[var(--ink)] font-bold">
                Download .ICS File
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Workspace Area (Stage + Grid + Drawers) */}
      <div className="flex-1 flex overflow-hidden relative h-full min-h-0">
        {/* Stage & Video Tiles */}
        <div className="flex-1 p-2 sm:p-4 flex flex-col gap-2 sm:gap-3 overflow-hidden h-full min-h-0">
          {(() => {
            const myRoomScope = myActiveBreakoutRoom ? myActiveBreakoutRoom.id : null;
            const remoteScreenSharer = meeting?.participants.find(
              (p) =>
                (p.status === "joined" || p.status === "admitted") &&
                p.isScreenSharing &&
                p.id !== myParticipantId &&
                (p.currentBreakoutRoomId || null) === myRoomScope
            );
            const activeScreenPresenter = isScreenSharing
              ? { id: myParticipantId, displayName: `${displayName} (You)`, isLocal: true }
              : remoteScreenSharer
              ? { id: remoteScreenSharer.id, displayName: remoteScreenSharer.displayName, isLocal: false }
              : null;

            /* ==================================================================
               1. UNIFIED SCREEN & APPLICATION SHARE STAGE (2026 MOBILE + DESKTOP)
               - Sole primary stage when active (eliminates duplicate stacked screen)
               - Non-overlapping top & bottom bars so 100% of the app/artwork is visible
               - Interactive Zoom (1x / 1.5x / 2x / 3x + pinch-to-zoom + drag-to-pan)
               - Live "Switch App" + "HD Text / 60fps" + "Snap to Proof" + "PiP"
               ================================================================== */
            if (activeScreenPresenter) {
              const rStream = !activeScreenPresenter.isLocal
                ? remoteStreams.get(activeScreenPresenter.id) ?? null
                : null;
              const stageStream = activeScreenPresenter.isLocal ? screenStream : rStream;
              const surfaceBadge = activeScreenPresenter.isLocal
                ? `${sharedSurfaceInfo.icon} ${sharedSurfaceInfo.shortLabel}`
                : isStudioBroadcasting
                ? "🎨 Studio"
                : "🪟 App / Screen";

              const cycleScreenZoom = () => {
                const steps = [1, 1.5, 2, 3];
                const nextIdx = (steps.indexOf(screenStageZoom) + 1) % steps.length;
                const nextZoom = steps[nextIdx];
                setScreenStageZoom(nextZoom);
                if (nextZoom === 1) {
                  setScreenStagePan({ x: 0, y: 0 });
                }
              };

              return (
                <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-hidden">
                  {/* Unified Stage Card */}
                  <div className="flex-1 min-h-0 flex flex-col bg-neutral-950 rounded-2xl border border-cyan-500/50 shadow-2xl overflow-hidden">
                    {/* Top Non-Overlapping Presenter & Controls Bar */}
                    <div className="px-2.5 sm:px-3.5 py-2 bg-neutral-900/95 border-b border-neutral-800 flex items-center justify-between gap-2 shrink-0">
                      {/* Left: Presenter Identity & Surface Badge */}
                      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                        <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse shrink-0" />
                        <span className="font-meta text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shrink-0">
                          {surfaceBadge}
                        </span>
                        <span className="font-display text-[10px] sm:text-xs font-bold uppercase text-white truncate">
                          {isStudioBroadcasting
                            ? `Co-Design · ${activeScreenPresenter.displayName}`
                            : activeScreenPresenter.displayName}
                        </span>
                        {activeScreenPresenter.isLocal && sharedSurfaceInfo.resolution && (
                          <span className="hidden lg:inline font-mono text-[8.5px] text-neutral-400 bg-neutral-800 px-1.5 py-0.5 rounded">
                            {sharedSurfaceInfo.resolution}
                          </span>
                        )}
                      </div>

                      {/* Right: Zoom + Presenter/Viewer Actions */}
                      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 overflow-x-auto">
                        {/* Interactive Zoom Button (Mobile & Desktop) */}
                        <button
                          type="button"
                          onClick={cycleScreenZoom}
                          className={`px-2 py-1 rounded-lg font-meta text-[9.5px] font-bold border transition-colors flex items-center gap-1 shrink-0 ${
                            screenStageZoom > 1
                              ? "bg-amber-400 text-black border-amber-300"
                              : "bg-neutral-800/90 hover:bg-neutral-700 text-neutral-200 border-neutral-700"
                          }`}
                          title="Zoom into shared application (1x → 1.5x → 2x → 3x)"
                        >
                          <span>🔍</span>
                          <span>{screenStageZoom}x</span>
                        </button>

                        {screenStageZoom > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              setScreenStageZoom(1);
                              setScreenStagePan({ x: 0, y: 0 });
                            }}
                            className="px-1.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-meta text-[9px] font-bold border border-neutral-700 shrink-0"
                            title="Reset zoom"
                          >
                            Reset
                          </button>
                        )}

                        {/* Snap to Proofing Canvas (Available to both Presenter and Viewers) */}
                        <button
                          type="button"
                          onClick={handleSnapScreenToProof}
                          className="px-2 sm:px-2.5 py-1 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black font-display text-[9.5px] font-bold uppercase flex items-center gap-1 shadow-sm shrink-0"
                          title="Capture current frame into Deliverables Proofing Canvas"
                        >
                          <span>📸</span>
                          <span className="hidden sm:inline">Snap</span>
                        </button>

                        {activeScreenPresenter.isLocal ? (
                          <>
                            {/* Switch Application / Window Live without dropping call */}
                            <button
                              type="button"
                              onClick={() => handleSwitchSharedSurface("window")}
                              className="px-2 sm:px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/50 text-emerald-300 font-meta text-[9.5px] font-bold flex items-center gap-1 shrink-0"
                              title="Switch to another open application window or browser tab"
                            >
                              <span>🪟</span>
                              <span className="hidden md:inline">Switch App</span>
                            </button>

                            {/* Quality Optimization Toggle (Detail vs 60fps Motion) */}
                            <button
                              type="button"
                              onClick={handleToggleScreenOptimization}
                              className="hidden sm:flex px-2 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-200 font-meta text-[9px] font-bold items-center gap-1 shrink-0"
                              title="Toggle between Crisp App Text (Detail) and 60fps Video Motion"
                            >
                              <span>{screenShareOptimizeFor === "detail" ? "🎯 HD Text" : "🎬 60fps"}</span>
                            </button>

                            {/* Stop Sharing */}
                            <button
                              type="button"
                              onClick={() => handleStartScreenShare(false)}
                              className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white font-meta text-[9.5px] font-bold shadow-sm shrink-0"
                              title="Stop sharing application / screen"
                            >
                              Stop
                            </button>
                          </>
                        ) : (
                          <>
                            {/* Picture-in-Picture (PiP) */}
                            <button
                              type="button"
                              onClick={handleToggleScreenPiP}
                              className="hidden sm:flex px-2 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-200 font-meta text-[9.5px] font-bold items-center gap-1 shrink-0"
                              title="Pop shared application into floating Picture-in-Picture window"
                            >
                              <span>⧉</span>
                              <span className="hidden md:inline">PiP</span>
                            </button>

                            {/* Fullscreen */}
                            <button
                              type="button"
                              onClick={handleToggleFullscreen}
                              className="px-2 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white font-meta text-[9.5px] font-bold flex items-center gap-1 shrink-0"
                              title="Toggle fullscreen presentation"
                            >
                              <span>⛶</span>
                              <span className="hidden sm:inline">Full</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Center Unobstructed Video Viewport (Supports Pinch/Tap Zoom & Touch/Mouse Pan) */}
                    <div
                      className={`flex-1 min-h-0 relative bg-black flex items-center justify-center overflow-hidden select-none ${
                        screenStageZoom > 1 ? "cursor-grab active:cursor-grabbing touch-none" : "cursor-zoom-in"
                      }`}
                      onDoubleClick={() => {
                        if (screenStageZoom > 1) {
                          setScreenStageZoom(1);
                          setScreenStagePan({ x: 0, y: 0 });
                        } else {
                          setScreenStageZoom(2);
                        }
                      }}
                      onMouseDown={(e) => {
                        if (screenStageZoom <= 1) return;
                        screenStageDragRef.current = {
                          active: true,
                          startX: e.clientX,
                          startY: e.clientY,
                          origX: screenStagePan.x,
                          origY: screenStagePan.y,
                        };
                      }}
                      onMouseMove={(e) => {
                        if (!screenStageDragRef.current.active || screenStageZoom <= 1) return;
                        const dx = e.clientX - screenStageDragRef.current.startX;
                        const dy = e.clientY - screenStageDragRef.current.startY;
                        setScreenStagePan({
                          x: screenStageDragRef.current.origX + dx,
                          y: screenStageDragRef.current.origY + dy,
                        });
                      }}
                      onMouseUp={() => {
                        screenStageDragRef.current.active = false;
                      }}
                      onMouseLeave={() => {
                        screenStageDragRef.current.active = false;
                      }}
                      onTouchStart={(e) => {
                        if (e.touches.length === 2) {
                          const dist = Math.hypot(
                            e.touches[0].clientX - e.touches[1].clientX,
                            e.touches[0].clientY - e.touches[1].clientY
                          );
                          screenStageDragRef.current = {
                            active: false,
                            startX: 0,
                            startY: 0,
                            origX: screenStagePan.x,
                            origY: screenStagePan.y,
                            pinchStartDist: dist,
                            pinchStartZoom: screenStageZoom,
                          };
                        } else if (e.touches.length === 1 && screenStageZoom > 1) {
                          screenStageDragRef.current = {
                            active: true,
                            startX: e.touches[0].clientX,
                            startY: e.touches[0].clientY,
                            origX: screenStagePan.x,
                            origY: screenStagePan.y,
                          };
                        }
                      }}
                      onTouchMove={(e) => {
                        if (
                          e.touches.length === 2 &&
                          screenStageDragRef.current.pinchStartDist &&
                          screenStageDragRef.current.pinchStartZoom
                        ) {
                          const dist = Math.hypot(
                            e.touches[0].clientX - e.touches[1].clientX,
                            e.touches[0].clientY - e.touches[1].clientY
                          );
                          const ratio = dist / screenStageDragRef.current.pinchStartDist;
                          const nextZ = Math.min(
                            3.5,
                            Math.max(1, Number((screenStageDragRef.current.pinchStartZoom * ratio).toFixed(2)))
                          );
                          setScreenStageZoom(nextZ);
                          if (nextZ <= 1.02) {
                            setScreenStagePan({ x: 0, y: 0 });
                          }
                        } else if (
                          e.touches.length === 1 &&
                          screenStageDragRef.current.active &&
                          screenStageZoom > 1
                        ) {
                          const dx = e.touches[0].clientX - screenStageDragRef.current.startX;
                          const dy = e.touches[0].clientY - screenStageDragRef.current.startY;
                          setScreenStagePan({
                            x: screenStageDragRef.current.origX + dx,
                            y: screenStageDragRef.current.origY + dy,
                          });
                        }
                      }}
                      onTouchEnd={() => {
                        screenStageDragRef.current.active = false;
                        screenStageDragRef.current.pinchStartDist = undefined;
                      }}
                    >
                      {stageStream ? (
                        <div
                          style={{
                            transform: `translate(${screenStagePan.x}px, ${screenStagePan.y}px) scale(${screenStageZoom})`,
                            transformOrigin: "center center",
                          }}
                          className="w-full h-full flex items-center justify-center transition-transform duration-75"
                        >
                          <VideoTile
                            stream={stageStream}
                            muted={activeScreenPresenter.isLocal}
                            videoRefExternal={screenVideoRef}
                            className="w-full h-full object-contain"
                          />
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center gap-3 text-neutral-400 p-6 text-center">
                          <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 flex items-center justify-center text-2xl animate-pulse">
                            🪟
                          </div>
                          <div>
                            <p className="font-display text-xs sm:text-sm font-bold uppercase text-white">
                              Connecting Live Application Broadcast from {activeScreenPresenter.displayName}…
                            </p>
                            <p className="font-meta text-[10px] text-neutral-400 mt-1">
                              Negotiating high-definition WebRTC video stream
                            </p>
                          </div>
                        </div>
                      )}

                      {screenStageZoom > 1 && (
                        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-full bg-black/75 border border-amber-400/40 text-amber-300 font-meta text-[9px] font-bold pointer-events-none shadow-md whitespace-nowrap">
                          🔍 {screenStageZoom}x Zoom · Drag to pan · Double-tap to reset
                        </div>
                      )}

                      {/* PRD Module 5 — Screen Share Annotation Overlay */}
                      {ssAnnotEnabled && (
                        <canvas
                          ref={ssAnnotCanvasRef}
                          className="absolute inset-0 w-full h-full pointer-events-auto z-10"
                          style={{ cursor: ssAnnotTool === "laser" ? "crosshair" : "crosshair", touchAction: "none" }}
                          onPointerDown={(e) => {
                            if (!ssAnnotCanvasRef.current) return;
                            const rect = ssAnnotCanvasRef.current.getBoundingClientRect();
                            ssAnnotDrawing.current = true;
                            ssAnnotPoints.current = [{ x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height }];
                          }}
                          onPointerMove={(e) => {
                            if (!ssAnnotDrawing.current || !ssAnnotCanvasRef.current) return;
                            const rect = ssAnnotCanvasRef.current.getBoundingClientRect();
                            ssAnnotPoints.current.push({ x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height });
                            // Draw locally in real-time
                            const ctx = ssAnnotCanvasRef.current.getContext("2d");
                            if (!ctx) return;
                            const pts = ssAnnotPoints.current;
                            if (pts.length < 2) return;
                            const last = pts[pts.length - 2];
                            const curr = pts[pts.length - 1];
                            ctx.beginPath();
                            ctx.strokeStyle = ssAnnotColor;
                            ctx.lineWidth = ssAnnotTool === "highlight" ? 12 : 3;
                            ctx.globalAlpha = ssAnnotTool === "highlight" ? 0.35 : 1;
                            ctx.lineCap = "round";
                            ctx.moveTo(last.x * ssAnnotCanvasRef.current.width, last.y * ssAnnotCanvasRef.current.height);
                            ctx.lineTo(curr.x * ssAnnotCanvasRef.current.width, curr.y * ssAnnotCanvasRef.current.height);
                            ctx.stroke();
                            ctx.globalAlpha = 1;
                          }}
                          onPointerUp={() => {
                            ssAnnotDrawing.current = false;
                            if (!meeting || ssAnnotPoints.current.length < 2) { ssAnnotPoints.current = []; return; }
                            const isLaser = ssAnnotTool === "laser";
                            sendScreenShareStroke(meeting.id, {
                              participantId: myParticipantId,
                              displayName,
                              color: ssAnnotColor,
                              points: [...ssAnnotPoints.current],
                              brushSize: ssAnnotTool === "highlight" ? 12 : 3,
                              tool: ssAnnotTool,
                              vanishAt: isLaser ? Date.now() + 3000 : undefined,
                            }).catch((err) => {
                              console.warn("[annotations] stroke failed to reach the meeting:", err);
                            });
                            ssAnnotPoints.current = [];
                          }}
                        />
                      )}
                      {/* Remote annotation strokes drawn on a separate read-only canvas */}
                      {ssAnnotStrokes.length > 0 && (
                        <svg className="absolute inset-0 w-full h-full pointer-events-none z-[9]" style={{ overflow: "visible" }}>
                          {ssAnnotStrokes.map((stroke) => {
                            if (stroke.points.length < 2) return null;
                            const d = stroke.points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x * 100}% ${p.y * 100}%`).join(" ");
                            return (
                              <path key={stroke.id} d={d} stroke={stroke.color}
                                strokeWidth={stroke.brushSize} fill="none" strokeLinecap="round" strokeLinejoin="round"
                                strokeOpacity={stroke.tool === "highlight" ? 0.4 : 1} />
                            );
                          })}
                        </svg>
                      )}
                      {/* Annotation toolbar — floats at bottom of screen share stage */}
                      {(isScreenSharing || meeting?.screenShareAnnotationSettings?.allowParticipantAnnotations) && (
                        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-2.5 py-1.5 bg-black/80 backdrop-blur-sm rounded-2xl border border-neutral-700/60 shadow-xl">
                          <button type="button" onClick={() => setSsAnnotEnabled((v) => !v)}
                            className={`h-7 px-3 rounded-xl font-meta text-[9px] font-bold transition-colors ${ssAnnotEnabled ? "bg-[var(--dept)] text-black" : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"}`}
                            title="Toggle annotation mode">
                            {ssAnnotEnabled ? "✏️ On" : "✏️ Annotate"}
                          </button>
                          {ssAnnotEnabled && (
                            <>
                              {(["pen", "highlight", "laser", "arrow"] as const).map((tool) => (
                                <button key={tool} type="button" onClick={() => setSsAnnotTool(tool)}
                                  className={`h-7 px-2 rounded-lg font-meta text-[9px] font-bold capitalize transition-colors ${ssAnnotTool === tool ? "bg-white/20 text-white" : "text-neutral-400 hover:text-white hover:bg-white/10"}`}>
                                  {tool === "pen" ? "✏️" : tool === "highlight" ? "🟡" : tool === "laser" ? "🔴" : "↗"}
                                </button>
                              ))}
                              {["#ef4444", "#22d3ee", "#a3e635", "#f59e0b", "#ffffff"].map((c) => (
                                <button key={c} type="button" onClick={() => setSsAnnotColor(c)}
                                  className={`h-5 w-5 rounded-full border-2 transition-transform ${ssAnnotColor === c ? "scale-125 border-white" : "border-transparent scale-100"}`}
                                  style={{ background: c }} />
                              ))}
                              {isHost && (
                                <button type="button" onClick={() => { if (meeting) clearScreenShareAnnotations(meeting.id); setSsAnnotStrokes([]); }}
                                  className="h-7 px-2 rounded-lg font-meta text-[9px] text-neutral-400 hover:text-red-400 hover:bg-red-950/30 transition-colors">
                                  Clear
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Bottom Non-Overlapping Co-Pilot Feedback & Quick Tools Strip */}
                    <div className="px-2.5 sm:px-3.5 py-1.5 bg-neutral-900/95 border-t border-neutral-800 flex items-center justify-between gap-2 shrink-0">
                      <div className="flex items-center gap-0.5 sm:gap-1 overflow-x-auto">
                        <span className="font-meta text-[8.5px] uppercase font-bold text-neutral-400 pr-1 hidden sm:inline">
                          Feedback:
                        </span>
                        {[
                          { id: "heart", icon: "❤️", label: "Love it" },
                          { id: "celebrate", icon: "🔥", label: "Fire" },
                          { id: "thumbs_up", icon: "👌", label: "Approved" },
                          { id: "laugh", icon: "🎨", label: "Color" },
                          { id: "clap", icon: "📏", label: "Layout" },
                        ].map((r) => (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => handleSendReaction(r.id as any)}
                            className="px-2 py-1 rounded-lg hover:bg-neutral-800 active:scale-125 text-xs sm:text-sm transition-transform"
                            title={r.label}
                          >
                            {r.icon}
                          </button>
                        ))}
                        <span className="font-meta text-[8.5px] text-neutral-500 pl-2 hidden md:inline">
                          💡 Pinch or double-click stage to zoom into layers &amp; text
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => setActiveDrawer(activeDrawer === "proofing" ? "none" : "proofing")}
                          className="px-2.5 py-1 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 font-meta text-[9.5px] font-bold flex items-center gap-1"
                        >
                          <span>🎨</span>
                          <span className="hidden xs:inline">Proofs ({proofingMockups.length})</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const next = activeDrawer === "chat" ? "none" : "chat";
                            setActiveDrawer(next);
                            if (next === "chat") setUnreadChatCount(0);
                          }}
                          className="relative px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white font-meta text-[9.5px] font-bold flex items-center gap-1"
                        >
                          <span>💬</span>
                          <span>Chat</span>
                          {unreadChatCount > 0 && activeDrawer !== "chat" && (
                            <span className="bg-red-500 text-white text-[8px] font-extrabold px-1 rounded-full">
                              {unreadChatCount}
                            </span>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Compact Bottom Participant Filmstrip (Never duplicates the shared screen video!) */}
                  <div className="flex items-center gap-2 overflow-x-auto py-0.5 shrink-0 h-14 sm:h-16">
                    {/* Local Participant Pill in Filmstrip */}
                    <div
                      className={`relative h-full w-28 sm:w-36 shrink-0 bg-neutral-900 rounded-xl overflow-hidden border flex items-center justify-center ${
                        speakingIds.has(myParticipantId)
                          ? "border-emerald-400 ring-1 ring-emerald-400"
                          : "border-neutral-800"
                      }`}
                    >
                      {!isVideoOff && localStream ? (
                        <VideoTile stream={localStream} muted={true} isMirrored={true} className="w-full h-full object-cover" />
                      ) : (
                        <div className="flex items-center gap-1.5 px-2 text-center">
                          <div className="w-7 h-7 rounded-full bg-[var(--dept)]/20 border border-[var(--dept)] flex items-center justify-center text-[10px] font-bold dept-accent shrink-0">
                            {displayName.slice(0, 2).toUpperCase()}
                          </div>
                          <span className="font-meta text-[9px] font-bold text-neutral-300 truncate">
                            You {isScreenSharing ? "· 🖥️" : ""}
                          </span>
                        </div>
                      )}
                      <div className="absolute bottom-1 left-1.5 right-1.5 flex items-center justify-between pointer-events-none">
                        <span className="bg-black/70 px-1.5 py-0.5 rounded text-[8px] font-meta text-white truncate">
                          You {isScreenSharing ? "(Presenting)" : ""}
                        </span>
                        {isMicMuted && <span className="text-[9px]">🔇</span>}
                      </div>
                    </div>

                    {/* Remote Participants in Filmstrip */}
                    {otherConnectedParticipants.map((p) => {
                      const pStream = remoteStreams.get(p.id);
                      // Importantly: if `p.isScreenSharing` is true, their `pStream` video track IS the shared screen
                      // already displayed on the main stage above. Show their avatar + Presenting badge instead of duplicating the screen!
                      const showCameraVideo =
                        !p.isScreenSharing &&
                        !p.isVideoOff &&
                        pStream &&
                        pStream.getVideoTracks().some((t) => t.enabled && t.readyState === "live");

                      return (
                        <div
                          key={p.id}
                          className={`relative h-full w-28 sm:w-36 shrink-0 bg-neutral-900 rounded-xl overflow-hidden border flex items-center justify-center ${
                            p.isScreenSharing
                              ? "border-cyan-500/70 bg-cyan-950/20"
                              : speakingIds.has(p.id)
                              ? "border-emerald-400 ring-1 ring-emerald-400"
                              : "border-neutral-800"
                          }`}
                        >
                          {showCameraVideo && pStream ? (
                            <VideoTile stream={pStream} muted={false} className="w-full h-full object-cover" />
                          ) : (
                            <div className="flex items-center gap-1.5 px-2">
                              <div className="w-7 h-7 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-[10px] font-bold text-neutral-200 shrink-0">
                                {p.displayName.slice(0, 2).toUpperCase()}
                              </div>
                              <div className="min-w-0 text-left">
                                <p className="font-meta text-[9px] font-bold text-white truncate">
                                  {p.displayName}
                                </p>
                                <p className="font-meta text-[7.5px] text-cyan-400 font-bold uppercase truncate">
                                  {p.isScreenSharing ? "🖥️ Presenting" : p.isMuted ? "Muted" : "Audio Live"}
                                </p>
                              </div>
                              {/* Keep audio connected for non-presenting remote peers with camera off */}
                              {!p.isScreenSharing && pStream && (
                                <audio
                                  ref={(el) => {
                                    if (el && el.srcObject !== pStream) {
                                      el.srcObject = pStream;
                                      el.play().catch(() => {});
                                    }
                                  }}
                                  autoPlay
                                  playsInline
                                />
                              )}
                            </div>
                          )}
                          <div className="absolute bottom-1 left-1.5 right-1.5 flex items-center justify-between pointer-events-none">
                            <span className="bg-black/70 px-1.5 py-0.5 rounded text-[8px] font-meta text-white truncate max-w-[85%]">
                              {p.displayName}
                            </span>
                            {p.isMuted && <span className="text-[9px]">🔇</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            }

            /* ==================================================================
               2. IN-MEETING LIVE CO-DESIGN STUDIO STAGE
               - Real-Time Multi-User Synchronized Vector, Typography & CTA Canvas
               - Live Collaborator Cursors with Participant Names
               - Direct Layer Dragging, Resizing, and In-Meeting Layer Inspector
               - Brand Kit Harmony Palettes (Neon Cyber, Obsidian Gold, etc.)
               - 1-Click Push to Deliverables Proofing Canvas & Version Snapshots
               - Integrated Bottom Video/Audio Filmstrip for Face-to-Face Collaboration
               ================================================================== */
            if (meeting?.coDesignSession?.active) {
              const session = meeting.coDesignSession;
              const preset =
                CO_DESIGN_ARTBOARD_PRESETS[session.artboardPreset] ||
                CO_DESIGN_ARTBOARD_PRESETS.square_1080;
              const canEdit = isHost || session.allowParticipantEdits;
              const selectedLayer = session.layers.find(
                (l) => l.id === selectedCoDesignLayerId
              );

              return (
                <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-hidden select-none">
                  {/* Co-Design Unified Studio Stage Card */}
                  <div className="flex-1 min-h-0 flex flex-col bg-neutral-950 rounded-2xl border border-purple-500/50 shadow-2xl overflow-hidden relative">
                    {/* Top Non-Overlapping Studio Header & Tool Bar */}
                    <div className="px-2.5 sm:px-4 py-2 bg-neutral-900/95 border-b border-neutral-800 flex flex-wrap items-center justify-between gap-2 shrink-0 z-20">
                      {/* Left: Studio Badge, Title & Collaborator Count */}
                      <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full bg-purple-400 animate-pulse shrink-0" />
                        <span className="font-meta text-[9px] font-extrabold px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-200 border border-purple-400/40 uppercase tracking-wider shrink-0">
                          🎨 Co-Design Studio
                        </span>
                        <h3 className="font-display text-xs sm:text-sm font-bold uppercase text-white truncate max-w-[140px] sm:max-w-xs">
                          {session.title}
                        </h3>
                        <span className="font-meta text-[9px] px-2 py-0.5 rounded bg-black/40 border border-purple-500/30 text-purple-200 hidden md:inline shrink-0">
                          {coDesignCursors.size + 1} live
                        </span>
                      </div>

                      {/* Right: Presets, Theme, Safe-Zones, Snapshots & Snap to Proof */}
                      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 overflow-x-auto">
                        {/* 1. Artboard Preset Switcher */}
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setShowCoDesignPresetsMenu((v) => !v)}
                            className="px-2 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-meta text-[9.5px] font-bold border border-neutral-700 flex items-center gap-1 transition-colors"
                            title="Switch Artboard Canvas Ratio (1:1 Square, 9:16 Reel, 16:9 Hero, 3:4 Poster)"
                          >
                            <span>📐</span>
                            <span>{preset.shortLabel}</span>
                            <span className="text-[8px]">▾</span>
                          </button>
                          {showCoDesignPresetsMenu && (
                            <>
                              <div
                                className="fixed inset-0 z-40"
                                onClick={() => setShowCoDesignPresetsMenu(false)}
                              />
                              <div className="absolute top-full right-0 mt-1 z-50 w-52 bg-neutral-900/95 backdrop-blur-xl border border-neutral-700 rounded-xl shadow-2xl p-1.5 space-y-1">
                                {(
                                  Object.values(CO_DESIGN_ARTBOARD_PRESETS) as typeof preset[]
                                ).map((p) => (
                                  <button
                                    key={p.id}
                                    type="button"
                                    onClick={async () => {
                                      setShowCoDesignPresetsMenu(false);
                                      await updateMeetingCoDesignSession(
                                        meeting.id,
                                        { artboardPreset: p.id },
                                        displayName
                                      );
                                      setMeeting((prev) =>
                                        prev && prev.coDesignSession
                                          ? {
                                              ...prev,
                                              coDesignSession: {
                                                ...prev.coDesignSession,
                                                artboardPreset: p.id,
                                              },
                                            }
                                          : prev
                                      );
                                      toast.info(`Canvas preset: ${p.label}`);
                                    }}
                                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-meta flex items-center justify-between ${
                                      session.artboardPreset === p.id
                                        ? "bg-purple-600 text-white font-bold"
                                        : "text-neutral-300 hover:bg-neutral-800"
                                    }`}
                                  >
                                    <span>{p.label}</span>
                                    {session.artboardPreset === p.id && <span>✓</span>}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>

                        {/* 2. Theme / Brand Kit Swapper */}
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setShowCoDesignThemeMenu((v) => !v)}
                            className="px-2 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-meta text-[9.5px] font-bold border border-neutral-700 flex items-center gap-1 transition-colors"
                            title="Apply curated Brand Kit Harmony Palette"
                          >
                            <span>🎨</span>
                            <span className="hidden sm:inline">Theme</span>
                            <span className="text-[8px]">▾</span>
                          </button>
                          {showCoDesignThemeMenu && (
                            <>
                              <div
                                className="fixed inset-0 z-40"
                                onClick={() => setShowCoDesignThemeMenu(false)}
                              />
                              <div className="absolute top-full right-0 mt-1 z-50 w-56 bg-neutral-900/95 backdrop-blur-xl border border-neutral-700 rounded-xl shadow-2xl p-2 space-y-1.5">
                                <span className="font-meta text-[8.5px] uppercase font-bold text-neutral-400 block px-1">
                                  Brand Kit Harmony Palettes
                                </span>
                                {CO_DESIGN_BRAND_PALETTES.map((pal) => (
                                  <button
                                    key={pal.id}
                                    type="button"
                                    onClick={async () => {
                                      setShowCoDesignThemeMenu(false);
                                      const rethemed = applyBrandPaletteToCoDesign(
                                        session,
                                        pal.id,
                                        displayName
                                      );
                                      await updateMeetingCoDesignSession(
                                        meeting.id,
                                        rethemed,
                                        displayName
                                      );
                                      setMeeting((prev) =>
                                        prev && prev.coDesignSession
                                          ? {
                                              ...prev,
                                              coDesignSession: rethemed,
                                            }
                                          : prev
                                      );
                                      toast.success(`Theme applied: ${pal.name}`);
                                    }}
                                    className="w-full text-left p-2 rounded-lg hover:bg-neutral-800 flex items-center justify-between gap-2 transition-colors"
                                  >
                                    <span className="font-meta text-[10px] text-white font-bold truncate">
                                      {pal.name}
                                    </span>
                                    <div className="flex gap-1 shrink-0">
                                      {pal.swatches.slice(0, 4).map((sw, sIdx) => (
                                        <span
                                          key={sIdx}
                                          className="w-3 h-3 rounded-full border border-neutral-600 shrink-0"
                                          style={{ backgroundColor: sw }}
                                        />
                                      ))}
                                    </div>
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>

                        {/* 3. Safe Zone Guides & Grid Toggles */}
                        <button
                          type="button"
                          onClick={async () => {
                            const next = !session.showSafeZone;
                            await updateMeetingCoDesignSession(
                              meeting.id,
                              { showSafeZone: next },
                              displayName
                            );
                            setMeeting((prev) =>
                              prev && prev.coDesignSession
                                ? {
                                    ...prev,
                                    coDesignSession: {
                                      ...prev.coDesignSession,
                                      showSafeZone: next,
                                    },
                                  }
                                : prev
                            );
                          }}
                          className={`px-2 py-1 rounded-lg font-meta text-[9.5px] font-bold border transition-colors flex items-center gap-1 ${
                            session.showSafeZone
                              ? "bg-cyan-500/20 text-cyan-200 border-cyan-400"
                              : "bg-neutral-800 text-neutral-400 border-neutral-700 hover:text-white"
                          }`}
                          title="Toggle Social & Reel UI Safe-Zone Guides"
                        >
                          <span>📐</span>
                          <span className="hidden sm:inline">Safe Zones</span>
                        </button>

                        <button
                          type="button"
                          onClick={async () => {
                            const next = !session.showGrid;
                            await updateMeetingCoDesignSession(
                              meeting.id,
                              { showGrid: next },
                              displayName
                            );
                            setMeeting((prev) =>
                              prev && prev.coDesignSession
                                ? {
                                    ...prev,
                                    coDesignSession: {
                                      ...prev.coDesignSession,
                                      showGrid: next,
                                    },
                                  }
                                : prev
                            );
                          }}
                          className={`px-2 py-1 rounded-lg font-meta text-[9.5px] font-bold border transition-colors flex items-center gap-1 ${
                            session.showGrid
                              ? "bg-purple-500/20 text-purple-200 border-purple-400"
                              : "bg-neutral-800 text-neutral-400 border-neutral-700 hover:text-white"
                          }`}
                          title="Toggle Rule-of-Thirds Grid Guides"
                        >
                          <span>▦</span>
                        </button>

                        {/* 4. Snap to Proofing Canvas */}
                        <button
                          type="button"
                          onClick={handleSnapCoDesignToProof}
                          className="px-2.5 py-1 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black font-display text-[9.5px] font-bold uppercase flex items-center gap-1 shadow-sm transition-colors"
                          title="Composite canvas layers and push directly to Client Proofing Canvas for approval"
                        >
                          <span>📸</span>
                          <span>Snap to Proof</span>
                        </button>

                        {/* 5. Version History & Checkpoints */}
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setShowCoDesignSnapshotsModal((v) => !v)}
                            className="px-2 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-meta text-[9.5px] font-bold border border-neutral-700 flex items-center gap-1 transition-colors"
                            title="Co-Design Version History & Checkpoints"
                          >
                            <span>📜</span>
                            <span className="hidden sm:inline">
                              v{session.versions?.length || 1}
                            </span>
                            <span className="text-[8px]">▾</span>
                          </button>
                          {showCoDesignSnapshotsModal && (
                            <>
                              <div
                                className="fixed inset-0 z-40"
                                onClick={() => setShowCoDesignSnapshotsModal(false)}
                              />
                              <div className="absolute top-full right-0 mt-1 z-50 w-64 bg-neutral-900/95 backdrop-blur-xl border border-neutral-700 rounded-2xl shadow-2xl p-2.5 space-y-2">
                                <div className="flex items-center justify-between pb-1 border-b border-neutral-800">
                                  <span className="font-meta text-[9px] uppercase font-bold text-neutral-300">
                                    Version History ({session.versions?.length || 1})
                                  </span>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      const label =
                                        newSnapshotLabel.trim() ||
                                        `v${(session.versions?.length || 0) + 1} Revision`;
                                      const snap =
                                        await saveCoDesignVersionSnapshot(
                                          meeting.id,
                                          label,
                                          displayName
                                        );
                                      if (snap) {
                                        setMeeting((prev) =>
                                          prev && prev.coDesignSession
                                            ? {
                                                ...prev,
                                                coDesignSession: {
                                                  ...prev.coDesignSession,
                                                  versions: [
                                                    ...(prev.coDesignSession.versions || []),
                                                    snap,
                                                  ],
                                                },
                                              }
                                            : prev
                                        );
                                      }
                                      setNewSnapshotLabel("");
                                      toast.success(`Saved snapshot "${label}"`);
                                    }}
                                    className="px-2 py-0.5 rounded bg-purple-600 hover:bg-purple-500 text-white font-meta text-[8.5px] font-bold"
                                  >
                                    + Save v{(session.versions?.length || 0) + 1}
                                  </button>
                                </div>

                                <div className="max-h-48 overflow-y-auto space-y-1">
                                  {(session.versions || []).map((v) => (
                                    <div
                                      key={v.id}
                                      className="p-1.5 rounded-lg bg-neutral-950/80 border border-neutral-800 flex items-center justify-between gap-1 text-[10px]"
                                    >
                                      <div className="min-w-0">
                                        <p className="font-bold text-white truncate">
                                          {v.label}
                                        </p>
                                        <p className="font-meta text-[8.5px] text-neutral-400">
                                          {v.createdBy} · {new Date(v.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                                        </p>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          setShowCoDesignSnapshotsModal(false);
                                          await restoreCoDesignVersionSnapshot(
                                            meeting.id,
                                            v.id,
                                            displayName
                                          );
                                          setMeeting((prev) =>
                                            prev && prev.coDesignSession
                                              ? {
                                                  ...prev,
                                                  coDesignSession: {
                                                    ...prev.coDesignSession,
                                                    artboardPreset: v.artboardPreset,
                                                    backgroundColor: v.backgroundColor,
                                                    backgroundGradient: v.backgroundGradient,
                                                    backgroundImage: v.backgroundImage,
                                                    backgroundDim: v.backgroundDim,
                                                    brandPalette: v.brandPalette,
                                                    layers: JSON.parse(JSON.stringify(v.layers)),
                                                  },
                                                }
                                              : prev
                                          );
                                          toast.success(`Restored "${v.label}"`);
                                        }}
                                        className="px-2 py-0.5 rounded bg-neutral-800 hover:bg-purple-600 text-neutral-200 hover:text-white font-meta text-[8.5px] font-bold shrink-0"
                                      >
                                        Restore
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </>
                          )}
                        </div>

                        {/* 6. Host Permission Mode Toggle & Close Stage */}
                        {isHost ? (
                          <>
                            <button
                              type="button"
                              onClick={async () => {
                                const next = !session.allowParticipantEdits;
                                await updateMeetingCoDesignSession(
                                  meeting.id,
                                  { allowParticipantEdits: next },
                                  displayName
                                );
                                setMeeting((prev) =>
                                  prev && prev.coDesignSession
                                    ? {
                                        ...prev,
                                        coDesignSession: {
                                          ...prev.coDesignSession,
                                          allowParticipantEdits: next,
                                        },
                                      }
                                    : prev
                                );
                                toast.info(
                                  next
                                    ? "🤝 Collaboration ON: All participants can edit layers."
                                    : "🔒 View-Only Mode: Only host can edit layers."
                                );
                              }}
                              className={`px-2 py-1 rounded-lg font-meta text-[9.5px] font-bold border transition-colors flex items-center gap-1 ${
                                session.allowParticipantEdits
                                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-400"
                                  : "bg-amber-500/20 text-amber-300 border-amber-400"
                              }`}
                              title={
                                session.allowParticipantEdits
                                  ? "All attendees can edit layers (Click to lock)"
                                  : "View-only for attendees (Click to allow edits)"
                              }
                            >
                              <span>{session.allowParticipantEdits ? "🤝" : "🔒"}</span>
                              <span className="hidden md:inline">
                                {session.allowParticipantEdits ? "Editable" : "Locked"}
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={async () => {
                                await stopMeetingCoDesignSession(meeting.id);
                                setMeeting((prev) =>
                                  prev && prev.coDesignSession
                                    ? {
                                        ...prev,
                                        coDesignSession: {
                                          ...prev.coDesignSession,
                                          active: false,
                                        },
                                      }
                                    : prev
                                );
                                toast.info("Closed Live Co-Design Studio");
                              }}
                              className="px-2 py-1 rounded-lg bg-red-600/20 hover:bg-red-600/40 border border-red-500/40 text-red-300 font-meta text-[9.5px] font-bold flex items-center gap-1"
                              title="End Co-Design session & return to regular stage"
                            >
                              <span>✕</span>
                              <span className="hidden sm:inline">Close</span>
                            </button>
                          </>
                        ) : (
                          <span
                            className={`font-meta text-[9px] px-2 py-1 rounded-lg border font-bold ${
                              canEdit
                                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                                : "bg-neutral-800 text-neutral-400 border-neutral-700"
                            }`}
                          >
                            {canEdit ? "🤝 You can edit" : "🔒 View Only"}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Quick Add Layer Floating Bar (When Edits Allowed) */}
                    {canEdit && (
                      <div className="px-3 py-1.5 bg-neutral-900/80 border-b border-neutral-800 flex items-center justify-between gap-2 overflow-x-auto shrink-0 z-10 text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="font-meta text-[8.5px] uppercase font-bold text-neutral-400 mr-1">
                            Add Layer:
                          </span>
                          <button
                            type="button"
                            onClick={() => handleAddCoDesignLayer("text")}
                            className="px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-meta text-[9px] font-bold flex items-center gap-1"
                          >
                            <span>✍️</span> + Headline
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAddCoDesignLayer("badge")}
                            className="px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-meta text-[9px] font-bold flex items-center gap-1"
                          >
                            <span>🏷️</span> + CTA Badge
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAddCoDesignLayer("shape", "rect")}
                            className="px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-meta text-[9px] font-bold flex items-center gap-1"
                          >
                            <span>▢</span> + Frame
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAddCoDesignLayer("shape", "circle")}
                            className="px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-meta text-[9px] font-bold flex items-center gap-1"
                          >
                            <span>◯</span> + Circle
                          </button>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleStartStudioCoDesign(session.sourceId)}
                            className="px-2 py-1 rounded-lg bg-purple-950/60 hover:bg-purple-900 border border-purple-500/30 text-purple-200 font-meta text-[9px] font-bold flex items-center gap-1"
                            title="Open in full KON10 Vector Studio and broadcast"
                          >
                            <span>↗️</span>
                            <span className="hidden sm:inline">Pop-Out Editor</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Center Artboard Viewport with Live Canvas */}
                    <div
                      ref={coDesignCanvasRef}
                      className="flex-1 min-h-0 relative bg-neutral-950 flex items-center justify-center p-3 sm:p-6 overflow-hidden"
                      onClick={() => setSelectedCoDesignLayerId(null)}
                      onPointerMove={(e) => {
                        const rect = coDesignCanvasRef.current?.getBoundingClientRect();
                        if (!rect || rect.width === 0 || rect.height === 0) return;
                        const x = Math.max(
                          0,
                          Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)
                        );
                        const y = Math.max(
                          0,
                          Math.min(100, ((e.clientY - rect.top) / rect.height) * 100)
                        );
                        // Throttled cursor broadcast
                        void updateCoDesignCursor(meeting.id, {
                          participantId: myParticipantId,
                          displayName,
                          color: isHost ? "#A855F7" : "#00F0FF",
                          x: Number(x.toFixed(1)),
                          y: Number(y.toFixed(1)),
                          selectedLayerId: selectedCoDesignLayerId,
                        });

                        // Layer dragging logic
                        if (coDesignDragRef.current && canEdit) {
                          const drag = coDesignDragRef.current;
                          const dx =
                            ((e.clientX - drag.startClientX) / drag.containerWidth) *
                            100;
                          const dy =
                            ((e.clientY - drag.startClientY) / drag.containerHeight) *
                            100;
                          const nextX = Math.max(
                            5,
                            Math.min(95, Number((drag.origX + dx).toFixed(1)))
                          );
                          const nextY = Math.max(
                            5,
                            Math.min(95, Number((drag.origY + dy).toFixed(1)))
                          );
                          void handleUpdateCoDesignLayer(drag.layerId, {
                            x: nextX,
                            y: nextY,
                          });
                        }
                      }}
                      onPointerUp={() => {
                        coDesignDragRef.current = null;
                      }}
                    >
                      {/* The Scaled Artboard */}
                      <div
                        style={{
                          aspectRatio: preset.aspect,
                          backgroundColor: session.backgroundColor,
                          backgroundImage: session.backgroundGradient,
                        }}
                        className="relative w-full max-w-[560px] max-h-[72vh] rounded-2xl shadow-2xl border border-neutral-700/80 overflow-hidden flex items-center justify-center transition-all duration-200"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* Optional Background Image */}
                        {session.backgroundImage && (
                          <img
                            src={session.backgroundImage}
                            alt="Background"
                            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                          />
                        )}

                        {/* Background Dim Overlay */}
                        {session.backgroundImage && session.backgroundDim > 0 && (
                          <div
                            className="absolute inset-0 bg-black pointer-events-none"
                            style={{ opacity: session.backgroundDim / 100 }}
                          />
                        )}

                        {/* Social Reel 9:16 Safe Zone Overlay */}
                        {session.showSafeZone && (
                          <div className="absolute inset-0 pointer-events-none z-10 flex flex-col justify-between p-3">
                            <div className="border-b border-dashed border-red-500/60 pb-1 text-[8px] font-mono text-red-300 font-bold uppercase tracking-wider">
                              ⚠️ IG/TikTok Top Header Margin (15%)
                            </div>
                            <div className="border-t border-dashed border-red-500/60 pt-1 text-[8px] font-mono text-red-300 font-bold uppercase tracking-wider text-right">
                              ⚠️ Caption &amp; Audio UI Margin (22%)
                            </div>
                          </div>
                        )}

                        {/* Rule of Thirds Grid Overlay */}
                        {session.showGrid && (
                          <div className="absolute inset-0 pointer-events-none z-10 grid grid-cols-3 grid-rows-3 border border-cyan-500/20">
                            <div className="border-r border-b border-cyan-500/20" />
                            <div className="border-r border-b border-cyan-500/20" />
                            <div className="border-b border-cyan-500/20" />
                            <div className="border-r border-b border-cyan-500/20" />
                            <div className="border-r border-b border-cyan-500/20" />
                            <div className="border-b border-cyan-500/20" />
                            <div className="border-r border-cyan-500/20" />
                            <div className="border-r border-cyan-500/20" />
                            <div />
                          </div>
                        )}

                        {/* Synchronized Vector, Typography & Badge Layers */}
                        {session.layers.map((layer) => {
                          if (layer.hidden) return null;
                          const isSelected = selectedCoDesignLayerId === layer.id;

                          return (
                            <div
                              key={layer.id}
                              style={{
                                left: `${layer.x}%`,
                                top: `${layer.y}%`,
                                width: layer.width ? `${layer.width}%` : undefined,
                                height: layer.height ? `${layer.height}%` : undefined,
                                opacity: layer.opacity ?? 1,
                                transform: `translate(-50%, -50%) rotate(${layer.rotation || 0}deg)`,
                              }}
                              className={`absolute cursor-pointer transition-shadow ${
                                isSelected
                                  ? "ring-2 ring-purple-400 ring-offset-2 ring-offset-black z-30"
                                  : "hover:ring-1 hover:ring-purple-400/50 z-20"
                              }`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedCoDesignLayerId(layer.id);
                                setShowLayerInspector(true);
                              }}
                              onPointerDown={(e) => {
                                if (!canEdit || layer.locked) return;
                                e.stopPropagation();
                                const container = e.currentTarget.parentElement;
                                if (!container) return;
                                const cRect = container.getBoundingClientRect();
                                coDesignDragRef.current = {
                                  layerId: layer.id,
                                  startClientX: e.clientX,
                                  startClientY: e.clientY,
                                  origX: layer.x,
                                  origY: layer.y,
                                  containerWidth: cRect.width,
                                  containerHeight: cRect.height,
                                };
                                setSelectedCoDesignLayerId(layer.id);
                              }}
                            >
                              {/* Selected Layer Tag */}
                              {isSelected && (
                                <div className="absolute -top-6 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-purple-600 text-white font-meta text-[8px] font-bold whitespace-nowrap shadow-md pointer-events-none">
                                  {layer.name} {layer.locked ? "🔒" : "✥"}
                                </div>
                              )}

                              {layer.type === "shape" && (
                                <div
                                  style={{
                                    borderColor: layer.color,
                                    backgroundColor: layer.fillColor || "transparent",
                                    borderRadius: layer.borderRadius ?? 16,
                                  }}
                                  className="w-full h-full border-2"
                                />
                              )}

                              {layer.type === "badge" && (
                                <div
                                  style={{
                                    backgroundColor: layer.fillColor || "#00F0FF",
                                    color: layer.color || "#000000",
                                    fontFamily: layer.fontFamily,
                                    fontSize: `${layer.fontSize}px`,
                                    borderRadius: layer.borderRadius ?? 999,
                                  }}
                                  className="px-4 py-2 font-extrabold uppercase shadow-lg text-center tracking-wider leading-none"
                                >
                                  {layer.text}
                                </div>
                              )}

                              {layer.type === "text" && (
                                <div
                                  style={{
                                    color: layer.color || "#FFFFFF",
                                    fontFamily: layer.fontFamily,
                                    fontSize: `${layer.fontSize}px`,
                                    fontWeight:
                                      layer.fontWeight === "extrabold"
                                        ? 800
                                        : layer.fontWeight === "bold"
                                        ? 700
                                        : 400,
                                    textAlign: layer.textAlign || "center",
                                  }}
                                  className="leading-tight select-none drop-shadow-md break-words"
                                >
                                  {layer.text}
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {/* Real-Time Collaborator Cursors Overlay */}
                        {Array.from(coDesignCursors.values()).map((c) => (
                          <div
                            key={c.participantId}
                            style={{
                              left: `${c.x}%`,
                              top: `${c.y}%`,
                            }}
                            className="absolute pointer-events-none z-40 transition-all duration-100 ease-out flex items-center gap-1 -translate-x-1 -translate-y-1"
                          >
                            <svg
                              width="18"
                              height="18"
                              viewBox="0 0 24 24"
                              fill={c.color || "#00F0FF"}
                              stroke="#000000"
                              strokeWidth="1.5"
                              className="drop-shadow-lg"
                            >
                              <polygon points="3 3 10 21 14 14 21 10 3 3" />
                            </svg>
                            <span
                              style={{ backgroundColor: c.color || "#00F0FF" }}
                              className="px-1.5 py-0.5 rounded-full text-black font-meta text-[8px] font-extrabold shadow-md whitespace-nowrap"
                            >
                              {c.displayName}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Selected Layer Inspector Popover / Sidebar */}
                      {selectedLayer && showLayerInspector && canEdit && (
                        <div className="absolute bottom-3 right-3 sm:top-3 sm:bottom-auto z-40 w-72 bg-neutral-900/95 backdrop-blur-xl border border-purple-500/50 rounded-2xl shadow-2xl p-3 text-white space-y-2.5 animate-in fade-in zoom-in-95 duration-100">
                          <div className="flex items-center justify-between pb-1 border-b border-neutral-800">
                            <span className="font-meta text-[9.5px] uppercase font-bold text-purple-300">
                              Edit: {selectedLayer.name}
                            </span>
                            <button
                              type="button"
                              onClick={() => setShowLayerInspector(false)}
                              className="text-neutral-400 hover:text-white text-xs font-bold"
                            >
                              ✕
                            </button>
                          </div>

                          {/* Editable Text / Badge Input */}
                          {(selectedLayer.type === "text" ||
                            selectedLayer.type === "badge") && (
                            <div className="space-y-1">
                              <label className="font-meta text-[8.5px] uppercase font-bold text-neutral-400 block">
                                Text Copy:
                              </label>
                              <textarea
                                value={selectedLayer.text || ""}
                                onChange={(e) =>
                                  void handleUpdateCoDesignLayer(selectedLayer.id, {
                                    text: e.target.value,
                                  })
                                }
                                rows={2}
                                className="w-full bg-neutral-950 border border-neutral-700 focus:border-purple-500 rounded-lg p-1.5 text-xs text-white outline-none"
                              />
                            </div>
                          )}

                          {/* Font Family & Size */}
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <label className="font-meta text-[8.5px] uppercase font-bold text-neutral-400 block">
                                Typography:
                              </label>
                              <select
                                value={selectedLayer.fontFamily}
                                onChange={(e) =>
                                  void handleUpdateCoDesignLayer(selectedLayer.id, {
                                    fontFamily: e.target.value as any,
                                  })
                                }
                                className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-2 py-1 text-[10px] text-white outline-none"
                              >
                                <option value="Syne">Syne (Bold Modern)</option>
                                <option value="Space Grotesk">Space Grotesk</option>
                                <option value="Inter">Inter Clean</option>
                                <option value="Playfair Display">Playfair Serif</option>
                                <option value="JetBrains Mono">JetBrains Mono</option>
                              </select>
                            </div>

                            <div className="space-y-1">
                              <label className="font-meta text-[8.5px] uppercase font-bold text-neutral-400 block">
                                Size: {selectedLayer.fontSize}px
                              </label>
                              <input
                                type="range"
                                min={12}
                                max={64}
                                value={selectedLayer.fontSize}
                                onChange={(e) =>
                                  void handleUpdateCoDesignLayer(selectedLayer.id, {
                                    fontSize: Number(e.target.value),
                                  })
                                }
                                className="w-full accent-purple-500 cursor-pointer"
                              />
                            </div>
                          </div>

                          {/* Color Swatches from Active Brand Palette */}
                          <div className="space-y-1">
                            <label className="font-meta text-[8.5px] uppercase font-bold text-neutral-400 block">
                              Color Swatches:
                            </label>
                            <div className="flex items-center gap-1.5">
                              {(session.brandPalette || []).map((clr, cIdx) => (
                                <button
                                  key={cIdx}
                                  type="button"
                                  onClick={() =>
                                    void handleUpdateCoDesignLayer(selectedLayer.id, {
                                      color: clr,
                                    })
                                  }
                                  style={{ backgroundColor: clr }}
                                  className="w-5 h-5 rounded-full border border-neutral-700 hover:scale-110 transition-transform"
                                  title={`Apply ${clr}`}
                                />
                              ))}
                              {selectedLayer.type === "badge" && (
                                <span className="text-[9px] font-meta text-neutral-400 ml-1">
                                  Fill:
                                </span>
                              )}
                              {selectedLayer.type === "badge" &&
                                (session.brandPalette || []).map((clr, cIdx) => (
                                  <button
                                    key={`fill-${cIdx}`}
                                    type="button"
                                    onClick={() =>
                                      void handleUpdateCoDesignLayer(
                                        selectedLayer.id,
                                        { fillColor: clr }
                                      )
                                    }
                                    style={{ backgroundColor: clr }}
                                    className="w-4 h-4 rounded-md border border-neutral-700 hover:scale-110 transition-transform"
                                    title={`Badge fill ${clr}`}
                                  />
                                ))}
                            </div>
                          </div>

                          {/* Layer Order & Actions */}
                          <div className="pt-1.5 border-t border-neutral-800 flex items-center justify-between gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                void handleReorderCoDesignLayer(
                                  selectedLayer.id,
                                  "front"
                                )
                              }
                              className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-meta text-[9px] font-bold"
                              title="Bring to Front"
                            >
                              Bring Front
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void handleDuplicateCoDesignLayer(selectedLayer.id)
                              }
                              className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-meta text-[9px] font-bold"
                              title="Duplicate layer"
                            >
                              Duplicate
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void handleDeleteCoDesignLayer(selectedLayer.id)
                              }
                              className="px-2 py-1 rounded bg-neutral-800 hover:bg-red-950/70 text-red-300 font-meta text-[9px] font-bold"
                              title="Delete layer"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Compact Bottom Participant Filmstrip during Co-Design */}
                  <div className="flex items-center gap-2 overflow-x-auto py-0.5 shrink-0 h-14 sm:h-16">
                    {/* Local Tile */}
                    <div
                      className={`relative h-full w-28 sm:w-36 shrink-0 bg-neutral-900 rounded-xl overflow-hidden border flex items-center justify-center ${
                        speakingIds.has(myParticipantId)
                          ? "border-emerald-400 ring-1 ring-emerald-400"
                          : "border-neutral-800"
                      }`}
                    >
                      {!isVideoOff && localStream ? (
                        <VideoTile
                          stream={localStream}
                          muted={true}
                          isMirrored={true}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="flex items-center gap-1.5 px-2 text-center">
                          <div className="w-7 h-7 rounded-full bg-purple-500/20 border border-purple-400 flex items-center justify-center text-[10px] font-bold text-purple-300 shrink-0">
                            {displayName.slice(0, 2).toUpperCase()}
                          </div>
                          <span className="font-meta text-[9px] font-bold text-neutral-300 truncate">
                            You
                          </span>
                        </div>
                      )}
                      <div className="absolute bottom-1 left-1.5 right-1.5 flex items-center justify-between pointer-events-none">
                        <span className="bg-black/70 px-1.5 py-0.5 rounded text-[8px] font-meta text-white truncate">
                          You (Co-Designing)
                        </span>
                        {isMicMuted && <span className="text-[9px]">🔇</span>}
                      </div>
                    </div>

                    {/* Remote Participants */}
                    {otherConnectedParticipants.map((p) => {
                      const pStream = remoteStreams.get(p.id);
                      const showCameraVideo =
                        !p.isVideoOff &&
                        pStream &&
                        pStream
                          .getVideoTracks()
                          .some((t) => t.enabled && t.readyState === "live");

                      return (
                        <div
                          key={p.id}
                          className={`relative h-full w-28 sm:w-36 shrink-0 bg-neutral-900 rounded-xl overflow-hidden border flex items-center justify-center ${
                            speakingIds.has(p.id)
                              ? "border-emerald-400 ring-1 ring-emerald-400"
                              : "border-neutral-800"
                          }`}
                        >
                          {showCameraVideo ? (
                            <VideoTile
                              stream={pStream}
                              muted={false}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="flex items-center gap-1.5 px-2 text-center">
                              <div className="w-7 h-7 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-[10px] font-bold text-neutral-300 shrink-0">
                                {p.displayName.slice(0, 2).toUpperCase()}
                              </div>
                              <span className="font-meta text-[9px] font-bold text-neutral-300 truncate">
                                {p.displayName}
                              </span>
                            </div>
                          )}
                          <div className="absolute bottom-1 left-1.5 right-1.5 flex items-center justify-between pointer-events-none">
                            <span className="bg-black/70 px-1.5 py-0.5 rounded text-[8px] font-meta text-white truncate max-w-[85%]">
                              {p.displayName}
                            </span>
                            {p.isMuted && <span className="text-[9px]">🔇</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            }

            /* ==================================================================
               2. SPOTLIGHT MODE (When no screen share is active & someone is pinned)
               ================================================================== */
            if (pinnedParticipantId) {
              return (
                <div className="flex-1 flex flex-col gap-4 min-h-0">
                  {/* Main Spotlighted Speaker */}
                  {(() => {
                    const isLocal = pinnedParticipantId === myParticipantId || pinnedParticipantId === effectiveMyId;
                    const p = isLocal
                      ? { id: myParticipantId, displayName: `${displayName} (You)`, isMuted: isMicMuted, isHandRaised, role: isHost ? "host" : "participant" }
                      : meeting.participants.find((x) => x.id === pinnedParticipantId);

                    const rStream = !isLocal && p ? remoteStreams.get(p.id) : null;
                    const hasVideo = isLocal ? (!isVideoOff && localStream) : (rStream && rStream.getVideoTracks().some((t) => t.enabled && t.readyState === "live"));

                    return (
                      <div className={`relative w-full aspect-video max-h-[60vh] mx-auto bg-neutral-900 rounded-2xl overflow-hidden border-2 shadow-2xl flex items-center justify-center ${
                        p?.isHandRaised
                          ? "ring-4 ring-amber-400 shadow-[0_0_35px_rgba(245,158,11,0.85)] animate-pulse border-amber-400"
                          : p && speakingIds.has(p.id)
                          ? "ring-4 ring-emerald-400 shadow-[0_0_30px_rgba(52,211,153,0.7)] border-emerald-400"
                          : "border-cyan-500"
                      }`}>
                        {isLocal ? (
                          !isVideoOff && localStream ? (
                            <VideoTile stream={localStream} muted={true} isMirrored={true} />
                          ) : (
                            <div className="w-20 h-20 rounded-full bg-[var(--dept)]/20 border border-[var(--dept)] flex items-center justify-center text-3xl font-bold dept-accent">
                              {displayName.slice(0, 2).toUpperCase()}
                            </div>
                          )
                        ) : hasVideo && rStream ? (
                          <VideoTile stream={rStream} muted={false} />
                        ) : (
                          <div className="w-20 h-20 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-3xl font-bold text-neutral-300">
                            {p?.displayName?.slice(0, 2).toUpperCase()}
                          </div>
                        )}

                        {/* Spotlight overlay controls */}
                        <div className="absolute top-3 left-3 flex items-center gap-2">
                          <span className="font-meta text-[10px] px-2.5 py-1 rounded-full bg-cyan-500 text-black font-bold flex items-center gap-1 shadow-md">
                            ⭐ Spotlight
                          </span>
                          <button
                            onClick={() => handleSpotlightParticipant(null)}
                            className="font-meta text-[9px] px-2 py-1 rounded-full bg-neutral-800/90 hover:bg-neutral-700 text-white border border-neutral-700"
                          >
                            ✕ Return to Grid
                          </button>
                        </div>

                        <div className="absolute bottom-3 left-3 bg-black/70 backdrop-blur-sm px-3 py-1.5 rounded-lg text-xs font-display font-bold uppercase flex items-center gap-2">
                          <span>{p?.displayName}</span>
                          {p?.isHandRaised && <span className="text-amber-400">✋ Hand Raised</span>}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Bottom Attendee Filmstrip */}
                  <div className="flex gap-3 overflow-x-auto py-2">
                    {/* Local Tile in Filmstrip */}
                    <div
                      onClick={() => handleSpotlightParticipant(myParticipantId)}
                      className={`relative w-40 aspect-video shrink-0 bg-neutral-900 rounded-xl overflow-hidden border cursor-pointer hover:border-cyan-400 transition-all ${
                        pinnedParticipantId === myParticipantId ? "border-cyan-400 ring-2 ring-cyan-400" : "border-neutral-800"
                      }`}
                    >
                      {!isVideoOff && localStream ? (
                        <VideoTile stream={localStream} muted={true} isMirrored={true} />
                      ) : (
                        <div className="flex items-center justify-center h-full text-xs font-bold text-neutral-400">
                          {displayName.slice(0, 2).toUpperCase()} (You)
                        </div>
                      )}
                      <div className="absolute bottom-1 left-1 bg-black/60 px-1.5 py-0.5 rounded text-[8px]">You</div>
                    </div>

                    {/* Other Participants in Filmstrip */}
                    {otherConnectedParticipants.map((p) => (
                      <div
                        key={p.id}
                        onClick={() => handleSpotlightParticipant(p.id)}
                        className={`relative w-40 aspect-video shrink-0 bg-neutral-900 rounded-xl overflow-hidden border cursor-pointer hover:border-cyan-400 transition-all ${
                          pinnedParticipantId === p.id ? "border-cyan-400 ring-2 ring-cyan-400" : "border-neutral-800"
                        }`}
                      >
                        <div className="flex items-center justify-center h-full text-xs font-bold text-neutral-400">
                          {p.displayName.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="absolute bottom-1 left-1 bg-black/60 px-1.5 py-0.5 rounded text-[8px] truncate max-w-[120px]">
                          {p.displayName}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            }

            /* ==================================================================
               3. STANDARD PARTICIPANT VIDEO GRID (Smart Zoom-style Gallery)
               ================================================================== */
            return (
              <div ref={stageRef} className="flex-1 h-full min-h-0 w-full relative">
                <div className="h-full min-h-0 flex flex-wrap content-center justify-center gap-2 overflow-hidden">
                  {/* My Local Tile (first gallery page only) */}
                  {galleryPageSafe === 0 && (
                    <div
                      onClick={() => handleSpotlightParticipant(myParticipantId)}
                      title="Click to maximize your video"
                      style={{ width: galleryLayout.tileWidth, height: galleryLayout.tileHeight }}
                      className={`group relative max-w-full max-h-full bg-neutral-900 rounded-lg overflow-hidden transition-all flex items-center justify-center cursor-pointer ${
                        isHandRaised
                          ? "border-2 border-amber-400 animate-pulse"
                          : speakingIds.has(myParticipantId)
                          ? "border-2 border-emerald-400"
                          : "border border-neutral-800 hover:border-neutral-600"
                      }`}
                    >
                      {!isVideoOff && localStream ? (
                        <VideoTile stream={localStream} muted={true} isMirrored={true} className="w-full h-full object-cover" />
                      ) : (
                        <div className="flex flex-col items-center justify-center p-3 sm:p-4 text-center">
                          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-[var(--dept)]/20 border border-[var(--dept)] flex items-center justify-center text-xl sm:text-2xl font-bold dept-accent mb-2 shadow-inner">
                            {displayName.slice(0, 2).toUpperCase()}
                          </div>
                          <p className="font-meta text-[10px] text-neutral-400 mb-2">Camera is paused</p>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleVideo();
                            }}
                            className="font-meta text-[11px] font-bold px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 active:scale-95 border border-neutral-700 text-white rounded-xl flex items-center gap-2 transition-all shadow-md min-h-[42px] cursor-pointer"
                          >
                            <span className="text-base">📹</span> Enable Camera
                          </button>
                        </div>
                      )}

                      {/* Tile Hover Controls */}
                      <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-black/60 backdrop-blur-sm p-1 rounded-lg">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSpotlightParticipant(myParticipantId);
                          }}
                          className="font-meta text-[8.5px] px-2 py-0.5 rounded bg-neutral-800 hover:bg-cyan-600 text-white"
                          title="Spotlight your video"
                        >
                          ⭐ Pin
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleFullscreen();
                          }}
                          className="font-meta text-[8.5px] px-1.5 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 text-white"
                          title="Fullscreen"
                        >
                          ⛶
                        </button>
                      </div>

                      {/* Zoom-style name chip (bottom-left, translucent, mute state inline) */}
                      <div className="absolute bottom-2 left-2 bg-black/60 px-2 py-0.5 rounded text-[11px] text-white flex items-center gap-1.5 max-w-[85%]">
                        <span className="truncate">{displayName} (You)</span>
                        {isHost && <span className="text-amber-400 text-[8px] bg-amber-400/20 px-1 rounded shrink-0 font-bold">HOST</span>}
                        {isMicMuted && <span className="shrink-0" title="Muted">🔇</span>}
                      </div>

                      <div className="absolute top-2 right-2 flex items-center gap-1.5">
                        {(() => {
                          // Self connection indicator — worst peer score, shown
                          // only when degraded so good calls stay clutter-free.
                          const scores = Object.values(peerQuality)
                            .map((q) => q.score)
                            .filter((s) => s > 0);
                          if (scores.length === 0) return null;
                          const worst = Math.min(...scores);
                          if (worst >= 3) return null;
                          return (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] ${worst === 1 ? "bg-red-500/80" : "bg-amber-500/80"}`}
                              title={worst === 1 ? "Your connection is poor — outgoing video was reduced automatically" : "Your connection is unstable"}
                            >
                              📶
                            </span>
                          );
                        })()}
                        {isHandRaised && (
                          <span className="bg-amber-500 text-black px-2 py-0.5 rounded-full text-[9px] font-extrabold flex items-center gap-1 animate-bounce" title="Hand Raised">
                            ✋ RAISED
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Other Connected Participants (paged) */}
                  {pagedRemoteParticipants.map((p) => {
                    const rStream = remoteStreams.get(p.id);
                    const hasVideo = rStream && rStream.getVideoTracks().some((t) => t.enabled && t.readyState === "live") && !p.isVideoOff;

                    return (
                      <div
                        key={p.id}
                        onClick={() => handleSpotlightParticipant(p.id)}
                        title={`Click to maximize ${p.displayName}`}
                        style={{ width: galleryLayout.tileWidth, height: galleryLayout.tileHeight }}
                        className={`group relative max-w-full max-h-full bg-neutral-900 rounded-lg overflow-hidden transition-all flex items-center justify-center cursor-pointer ${
                          p.isHandRaised
                            ? "border-2 border-amber-400 animate-pulse"
                            : speakingIds.has(p.id)
                            ? "border-2 border-emerald-400"
                            : "border border-neutral-800 hover:border-neutral-600"
                        }`}
                      >
                        {hasVideo && rStream ? (
                          <VideoTile stream={rStream} muted={false} className="w-full h-full object-cover" />
                        ) : (
                          <div className="text-center p-3 sm:p-4">
                            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-xl sm:text-2xl font-bold text-neutral-300 mx-auto mb-2 shadow-inner">
                              {p.displayName.slice(0, 2).toUpperCase()}
                            </div>
                            <p className="font-meta text-[11px] font-bold text-neutral-300">
                              {p.isMuted ? "Muted" : "Audio Active"}
                            </p>
                            {rStream && (
                              <audio
                                ref={(el) => {
                                  if (el && el.srcObject !== rStream) {
                                    el.srcObject = rStream;
                                    el.play().catch(() => {});
                                  }
                                }}
                                autoPlay
                                playsInline
                              />
                            )}
                          </div>
                        )}

                        {/* Tile Hover Controls */}
                        <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-black/60 backdrop-blur-sm p-1 rounded-lg">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSpotlightParticipant(p.id);
                            }}
                            className="font-meta text-[8.5px] px-2 py-0.5 rounded bg-neutral-800 hover:bg-cyan-600 text-white"
                            title="Spotlight participant"
                          >
                            ⭐ Spotlight
                          </button>
                        </div>

                        <div className="absolute bottom-2 left-2 bg-black/60 px-2 py-0.5 rounded text-[11px] text-white flex items-center gap-1.5 max-w-[85%]">
                          <span className="truncate">{p.displayName}</span>
                          {p.role === "host" && <span className="text-amber-400 text-[8px] bg-amber-400/20 px-1 rounded shrink-0 font-bold">HOST</span>}
                          {p.role === "cohost" && <span className="text-cyan-400 text-[8px] bg-cyan-400/20 px-1 rounded shrink-0 font-bold">CO-HOST</span>}
                          {p.isMuted && <span className="shrink-0" title="Muted">🔇</span>}
                        </div>

                        <div className="absolute top-2 right-2 flex items-center gap-1.5">
                          {peerQuality[p.id] && peerQuality[p.id].score > 0 && peerQuality[p.id].score < 3 && (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] ${peerQuality[p.id].score === 1 ? "bg-red-500/80" : "bg-amber-500/80"}`}
                              title={`Connection ${peerQuality[p.id].score === 1 ? "poor" : "unstable"} — ${peerQuality[p.id].packetLossPct.toFixed(1)}% packet loss${peerQuality[p.id].rttMs !== null ? `, ${Math.round(peerQuality[p.id].rttMs!)} ms` : ""}`}
                            >
                              📶
                            </span>
                          )}
                          {p.isHandRaised && (
                            <div className="flex items-center gap-1 bg-amber-500 text-black px-2 py-0.5 rounded-full text-[9px] font-extrabold animate-bounce">
                              <span>✋ RAISED</span>
                              {isHost && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleLowerParticipantHand(p.id);
                                  }}
                                  className="ml-1 bg-black/20 hover:bg-black/40 rounded px-1"
                                  title="Lower Hand"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Gallery pagination — appears only beyond 25 participants */}
                {galleryLayout.pages > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setGalleryPage(Math.max(0, galleryPageSafe - 1))}
                      disabled={galleryPageSafe === 0}
                      aria-label="Previous gallery page"
                      className="absolute left-2 top-1/2 -translate-y-1/2 z-20 w-10 h-14 rounded-lg bg-neutral-900/85 hover:bg-neutral-800 border border-neutral-700 text-white text-xl disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      onClick={() => setGalleryPage(Math.min(galleryLayout.pages - 1, galleryPageSafe + 1))}
                      disabled={galleryPageSafe >= galleryLayout.pages - 1}
                      aria-label="Next gallery page"
                      className="absolute right-2 top-1/2 -translate-y-1/2 z-20 w-10 h-14 rounded-lg bg-neutral-900/85 hover:bg-neutral-800 border border-neutral-700 text-white text-xl disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
                    >
                      ›
                    </button>
                    <span className="absolute top-2 right-2 z-20 font-meta text-[9px] px-2 py-0.5 rounded bg-black/60 border border-neutral-700 text-neutral-300">
                      {galleryPageSafe + 1} / {galleryLayout.pages}
                    </span>
                  </>
                )}
              </div>
            );
          })()}
        </div>

        {/* Slide-in Drawers (Chat, Participants, AI Intelligence, Breakouts, Live Proofing) */}
        {activeDrawer !== "none" && (
          <div className="fixed inset-0 z-50 md:static md:w-80 lg:w-96 md:h-auto md:max-h-full h-[100dvh] max-h-[100dvh] bg-neutral-950 md:bg-neutral-900 border-t md:border-t-0 md:border-l border-neutral-800 flex flex-col shrink-0 animate-in slide-in-from-bottom-5 md:slide-in-from-right duration-200">
            {/* Drawer Header (Mobile-Optimized with Back Button & Close) */}
            <div className="px-4 py-3 sm:py-3.5 border-b border-neutral-800 flex items-center justify-between shrink-0 bg-neutral-900/90 backdrop-blur-md">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveDrawer("none")}
                  className="md:hidden flex items-center gap-1 text-xs text-[var(--dept)] font-bold px-2 py-1 -ml-1 rounded-lg hover:bg-neutral-800"
                >
                  <span>←</span>
                  <span className="font-meta text-[10px] uppercase">Back</span>
                </button>
                <h3 className="font-display text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
                  {activeDrawer === "chat" && "💬 Live Chat"}
                  {activeDrawer === "participants" && `👥 People (${activeParticipants.length})`}
                  {activeDrawer === "proofing" && "🎨 Deliverables Proofing"}
                  {activeDrawer === "intelligence" && "✨ AI Intelligence"}
                  {activeDrawer === "breakouts" && "🔀 Breakout Rooms"}
                  {activeDrawer === "queue" && "✋ Speaker Queue"}
                  {activeDrawer === "agenda" && "⏱ Agenda & Timer"}
                  {activeDrawer === "actions" && "✅ Action Board"}
                </h3>
              </div>
              <button
                onClick={() => setActiveDrawer("none")}
                className="w-8 h-8 rounded-full bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white flex items-center justify-center text-sm font-bold transition-colors"
                title="Close Drawer"
              >
                ✕
              </button>
            </div>

            {/* DRAWER: CHAT */}
            {activeDrawer === "chat" && (
              <div className="flex-1 flex flex-col h-full overflow-hidden bg-neutral-950 md:bg-neutral-900/50">
                {/* Breakout Room Chat Scope Switcher */}
                {myActiveBreakoutRoom && (
                  <div className="px-3 py-2 bg-purple-950/40 border-b border-purple-500/30 flex items-center justify-between gap-1.5 shrink-0">
                    <span className="font-meta text-[9px] text-purple-200 uppercase font-bold truncate">
                      Chat Scope:
                    </span>
                    <div className="flex items-center gap-1 bg-neutral-900 p-0.5 rounded-lg border border-neutral-800">
                      <button
                        type="button"
                        onClick={() => setChatScope("room")}
                        className={`font-meta text-[9px] px-2 py-1 rounded-md font-bold transition-all ${
                          chatScope === "room"
                            ? "bg-purple-600 text-white shadow-xs"
                            : "text-neutral-400 hover:text-white"
                        }`}
                      >
                        🔀 {myActiveBreakoutRoom.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => setChatScope("everyone")}
                        className={`font-meta text-[9px] px-2 py-1 rounded-md font-bold transition-all ${
                          chatScope === "everyone"
                            ? "bg-[var(--dept)] text-black shadow-xs"
                            : "text-neutral-400 hover:text-white"
                        }`}
                      >
                        🌐 Everyone
                      </button>
                    </div>
                  </div>
                )}

                {/* Chat Message Stream */}
                <div className="flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4 space-y-3 text-xs">
                  {(() => {
                    const visibleChatMessages = chatMessages.filter(
                      (m) =>
                        !m.breakoutRoomId ||
                        m.breakoutRoomId === myActiveBreakoutRoom?.id ||
                        isHost
                    );
                    if (visibleChatMessages.length === 0) {
                      return (
                        <div className="text-center py-12 px-4 space-y-2">
                          <span className="text-3xl">{myActiveBreakoutRoom && chatScope === "room" ? "🔀" : "💬"}</span>
                          <p className="font-display text-xs font-bold uppercase text-neutral-300">
                            {myActiveBreakoutRoom && chatScope === "room"
                              ? `${myActiveBreakoutRoom.name} Room Chat`
                              : "In-Meeting Public Chat"}
                          </p>
                          <p className="font-meta text-[10px] text-neutral-500 max-w-xs mx-auto">
                            {myActiveBreakoutRoom && chatScope === "room"
                              ? "Messages sent in Room mode are shared with members inside this breakout room."
                              : "Messages sent here are visible to all admitted attendees in this session."}
                          </p>
                        </div>
                      );
                    }
                    return visibleChatMessages.map((msg) => {
                      const isMe = msg.senderId === myParticipantId;
                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${isMe ? "items-end" : "items-start"} max-w-[92%] ${isMe ? "ml-auto" : "mr-auto"}`}
                        >
                          <div className="flex items-center flex-wrap gap-1.5 mb-1 px-1">
                            <span
                              className={`font-display text-[10.5px] font-bold ${
                                isMe
                                  ? "text-[var(--dept)]"
                                  : msg.senderRole === "host"
                                  ? "text-amber-400"
                                  : "text-cyan-400"
                              }`}
                            >
                              {msg.senderName} {isMe ? "(You)" : ""}
                            </span>
                            {msg.senderRole === "host" && (
                              <span className="bg-amber-500/20 text-amber-300 text-[8px] font-bold px-1 rounded">
                                HOST
                              </span>
                            )}
                            {msg.breakoutRoomName && (
                              <span className="bg-purple-500/20 border border-purple-500/40 text-purple-200 text-[8px] font-bold px-1.5 py-0.2 rounded-full">
                                🔀 {msg.breakoutRoomName}
                              </span>
                            )}
                            <span className="font-meta text-[8px] text-neutral-500">
                              {new Date(msg.createdAt).toLocaleTimeString([], {
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>

                          <div
                            className={`p-2.5 sm:p-3 rounded-2xl text-xs break-words shadow-sm leading-relaxed ${
                              isMe
                                ? "bg-[var(--dept)]/15 border border-[var(--dept)]/35 text-white rounded-tr-none"
                                : msg.breakoutRoomId
                                ? "bg-purple-950/60 border border-purple-500/40 text-purple-100 rounded-tl-none"
                                : "bg-neutral-800/90 border border-neutral-700/60 text-neutral-200 rounded-tl-none"
                            }`}
                          >
                            <p className="whitespace-pre-wrap">{msg.message}</p>
                          </div>
                        </div>
                      );
                    });
                  })()}
                  <div ref={chatEndRef} />
                </div>

                {/* Quick Emoji Reaction Tap Chips on Mobile */}
                <div className="px-3 py-1.5 bg-neutral-900 border-t border-neutral-800/80 flex items-center justify-between gap-1 overflow-x-auto no-scrollbar shrink-0">
                  <span className="font-meta text-[8px] text-neutral-500 uppercase shrink-0 mr-1">Quick:</span>
                  {["👍", "❤️", "👏", "🎉", "🔥", "💯", "❓"].map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        setChatDraft((prev) => (prev ? `${prev} ${emoji}` : emoji));
                      }}
                      className="px-2 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 active:scale-95 text-xs transition-transform"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>

                {/* Mobile Safe-Area Chat Input Form */}
                <form
                  onSubmit={handleSendChat}
                  className="p-2.5 sm:p-3 bg-neutral-900 border-t border-neutral-800 flex gap-2 items-center shrink-0 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]"
                >
                  <input
                    type="text"
                    value={chatDraft}
                    onChange={(e) => setChatDraft(e.target.value)}
                    placeholder="Type message to everyone…"
                    className="flex-1 bg-neutral-800 border border-neutral-700 focus:border-[var(--dept)] px-3 py-2.5 rounded-xl text-[16px] md:text-xs outline-none text-white placeholder-neutral-500 shadow-inner"
                    enterKeyHint="send"
                    autoComplete="off"
                    autoCorrect="on"
                    autoCapitalize="sentences"
                  />
                  <button
                    type="submit"
                    disabled={!chatDraft.trim()}
                    className="btn btn-dept !py-2.5 !px-4 min-h-[42px] font-display text-[11px] font-bold uppercase disabled:opacity-40 disabled:cursor-not-allowed shrink-0 flex items-center gap-1.5 shadow-md"
                  >
                    <span>Send</span>
                    <span className="text-xs">➤</span>
                  </button>
                </form>
              </div>
            )}

            {/* DRAWER: 2026 LIVE DELIVERABLES PROOFING & ASSETS CO-VIEWER */}
            {activeDrawer === "proofing" && (
              <div className="flex-1 p-3 sm:p-4 overflow-y-auto space-y-3.5 text-xs">
                {/* Proofing Status & Action Strip */}
                <div className="p-3 bg-neutral-900 rounded-2xl border border-neutral-800 space-y-3">
                  {/* Top Bar: Title & Broadcast / Maximize */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                      <span className="font-display text-[11px] uppercase font-bold text-white tracking-wider truncate">
                        Live Proofing Canvas
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setIsProofingMaximized(true)}
                        className="font-meta text-[9.5px] px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-white font-bold flex items-center gap-1 border border-neutral-700 transition-colors"
                        title="Maximize Canvas"
                      >
                        <span>⛶</span> Fullscreen
                      </button>

                      {isHost && (
                        <button
                          type="button"
                          onClick={handleToggleProofingSession}
                          className={`font-meta text-[9.5px] px-2.5 py-1.5 rounded-xl font-bold transition-all ${
                            meeting.liveProofing?.active
                              ? "bg-red-500/20 text-red-300 border border-red-500/40"
                              : "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/30"
                          }`}
                        >
                          {meeting.liveProofing?.active ? "Stop Live" : "Broadcast"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Host Quick Actions Bar */}
                  {isHost && (
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleStartStudioCoDesign()}
                        className="flex-1 font-meta text-[10px] py-1.5 px-2 bg-purple-950/60 hover:bg-purple-900 text-purple-300 border border-purple-500/30 rounded-xl font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all"
                        title="Open in KON10 Studio Editor and broadcast live"
                      >
                        <span>✏️</span> Live Co-Design
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowUploadModal(true)}
                        className="flex-1 font-meta text-[10px] py-1.5 px-2 bg-[var(--dept)] text-black rounded-xl font-bold hover:brightness-110 flex items-center justify-center gap-1.5 shadow-sm transition-all"
                        title="Upload new deliverable or concept image"
                      >
                        <span>📁</span> + Upload
                      </button>
                    </div>
                  )}

                  {/* Thumbnail Strip for All Deliverables */}
                  <div className="pt-2 border-t border-neutral-800">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-meta text-[9px] uppercase font-bold text-neutral-400">
                        Deliverable #{proofingIndex + 1} of {proofingMockups.length}
                      </span>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => handleSelectProof(proofingIndex - 1)}
                          disabled={proofingIndex === 0}
                          className="px-2 py-0.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 text-xs font-bold text-white border border-neutral-700"
                        >
                          ←
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSelectProof(proofingIndex + 1)}
                          disabled={proofingIndex === proofingMockups.length - 1}
                          className="px-2 py-0.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 text-xs font-bold text-white border border-neutral-700"
                        >
                          →
                        </button>
                      </div>
                    </div>

                    {/* Horizontal Scrollable Thumbnail Row */}
                    <div className="flex gap-2 overflow-x-auto py-1 no-scrollbar">
                      {proofingMockups.map((m, idx) => (
                        <div
                          key={m.id}
                          onClick={() => handleSelectProof(idx)}
                          className={`relative w-16 h-12 shrink-0 rounded-xl overflow-hidden border-2 cursor-pointer transition-all ${
                            idx === proofingIndex
                              ? "border-[var(--dept)] ring-2 ring-[var(--dept)]/30 scale-105 shadow-md"
                              : "border-neutral-800 opacity-60 hover:opacity-100"
                          }`}
                        >
                          <img src={m.image} alt={m.title} className="w-full h-full object-cover" />
                          <span className="absolute bottom-0 inset-x-0 bg-black/85 text-white font-mono text-[7px] text-center truncate px-0.5 font-bold">
                            #{idx + 1}
                          </span>
                        </div>
                      ))}
                      {isHost && (
                        <button
                          type="button"
                          onClick={() => setShowUploadModal(true)}
                          className="w-16 h-12 shrink-0 rounded-xl border-2 border-dashed border-neutral-700 hover:border-[var(--dept)] bg-neutral-950 flex flex-col items-center justify-center text-neutral-400 hover:text-[var(--dept)] text-[9px] font-bold"
                          title="Upload new deliverable"
                        >
                          <span className="text-sm">+</span>
                          <span>Upload</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Single Unified Deliverable Header & Tools */}
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-neutral-800">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <h4 className="font-display text-xs font-bold uppercase text-white truncate">
                          {activeMockup.title}
                        </h4>
                        {meeting?.liveProofing?.approvedDeliverables?.some((a) => a.mockupId === activeMockup.id && a.approved) && (
                          <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-meta text-[7.5px] px-1.5 py-0.2 rounded-full font-bold uppercase shrink-0">
                            ✓ Approved
                          </span>
                        )}
                      </div>
                      <p className="font-meta text-[8.5px] text-neutral-400 truncate">
                        {activeMockup.category} {activeMockup.uploadedBy ? `· by ${activeMockup.uploadedBy}` : ""}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => setShowApprovedArchiveModal(true)}
                        className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-cyan-300 border border-neutral-700 text-[10px] font-bold"
                        title="View Approved Deliverables & Preserved Pins"
                      >
                        📜
                      </button>

                      <button
                        type="button"
                        onClick={() => setCompareMode(true)}
                        className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-purple-300 border border-neutral-700 text-[10px] font-bold"
                        title="A/B Split Version Comparison"
                      >
                        ↔️
                      </button>

                      {isHost && proofingMockups.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveArtwork(activeMockup.id)}
                          className="p-1.5 rounded-lg bg-neutral-800 hover:bg-red-900/50 text-red-400 border border-neutral-700 text-[10px] font-bold"
                          title="Remove this deliverable"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                  {/* Interactive Proofing Canvas with Markup SVG Overlay & Right-Click */}
                  <div
                    onContextMenu={handleCanvasContextMenu}
                    onPointerDown={handleCanvasPointerDown}
                    onPointerMove={handleCanvasPointerMove}
                    onPointerUp={handleCanvasPointerUp}
                    onPointerCancel={handleCanvasPointerUp}
                    className={`relative aspect-video rounded-xl overflow-hidden border-2 border-neutral-700 select-none shadow-lg touch-none transition-colors duration-200 ${
                      canvasBackdrop === "black"
                        ? "bg-black"
                        : canvasBackdrop === "white"
                        ? "bg-white text-black"
                        : canvasBackdrop === "grid"
                        ? "bg-neutral-900 bg-[radial-gradient(#475569_1.5px,transparent_1.5px)] [background-size:20px_20px]"
                        : canvasBackdrop === "checker"
                        ? "bg-neutral-900 bg-[repeating-conic-gradient(#1e293b_0%_25%,#0f172a_0%_50%)] [background-size:24px_24px]"
                        : "bg-slate-950"
                    } ${
                      activeProofTool === "laser"
                        ? "cursor-crosshair"
                        : activeProofTool === "pin"
                        ? "cursor-pointer"
                        : "cursor-crosshair"
                    }`}
                  >
                    {/* Live Concept Approval Banner */}
                    {meeting?.liveProofing?.approvedDeliverables?.some((a) => a.mockupId === activeMockup.id && a.approved) && (
                      <div className="absolute top-2 inset-x-2 z-[25] bg-emerald-950/90 border border-emerald-500/60 rounded-xl px-2.5 py-1 flex items-center justify-between text-emerald-200 font-meta text-[8.5px] shadow-lg backdrop-blur-sm">
                        <span className="font-bold flex items-center gap-1">
                          <span>✓</span> Concept Approved by {meeting.liveProofing.approvedDeliverables.find((a) => a.mockupId === activeMockup.id)?.approvedBy}
                        </span>
                        <span className="text-emerald-400 font-mono">
                          {mockupPins.length} Pin {mockupPins.length === 1 ? "Note" : "Notes"} Saved
                        </span>
                      </div>
                    )}

                    <img
                      src={activeMockup.image}
                      alt={activeMockup.title}
                      className="w-full h-full object-contain pointer-events-none"
                    />

                    {/* SVG Vector Drawing Layer */}
                    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none z-10">
                      {mockupStrokes.map((stroke) => renderCanvasStroke(stroke))}
                      {renderActiveStrokePreview()}
                      {vanishingStrokes.map((stroke) => renderCanvasStroke(stroke))}
                    </svg>

                    {/* Safe Zone Overlays */}
                    {renderSafeZoneOverlay(safeZoneOverlay)}

                    {/* Numbered Pins with Hover Message Preview */}
                    {mockupPins.map((pin) => {
                      const isNearBottom = pin.y > 60;
                      const isNearRight = pin.x > 65;
                      const isNearLeft = pin.x < 35;
                      return (
                        <div
                          key={pin.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedPinDetail(pin);
                          }}
                          className="absolute -translate-x-1/2 -translate-y-1/2 z-20 cursor-pointer group"
                          style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
                        >
                          <div
                            className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center font-bold text-[9px] sm:text-[10px] shadow-lg border-2 border-white transition-transform group-hover:scale-125 ${
                              pin.resolved
                                ? "bg-emerald-500 text-white ring-2 ring-emerald-300"
                                : "bg-[var(--dept)] text-black ring-2 ring-cyan-300"
                            }`}
                          >
                            {pin.number}
                          </div>

                          {/* Hover Floating Message Preview Tooltip */}
                          <div
                            className={`absolute opacity-0 group-hover:opacity-100 transition-all duration-150 pointer-events-none group-hover:pointer-events-auto z-40 w-52 sm:w-64 bg-neutral-900/95 backdrop-blur-md border border-neutral-700/90 rounded-xl p-2.5 shadow-2xl text-white select-none ${
                              isNearBottom ? "bottom-full mb-2" : "top-full mt-2"
                            } ${
                              isNearRight ? "right-0" : isNearLeft ? "left-0" : "left-1/2 -translate-x-1/2"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1.5 pb-1 border-b border-neutral-800">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span
                                  className={`w-4 h-4 rounded-full font-bold text-[8px] flex items-center justify-center shrink-0 ${
                                    pin.resolved ? "bg-emerald-500 text-white" : "bg-[var(--dept)] text-black"
                                  }`}
                                >
                                  {pin.number}
                                </span>
                                <span className="font-bold text-[9px] text-white truncate">
                                  {pin.senderName || "Client"}
                                </span>
                              </div>
                              <span
                                className={`font-meta text-[7.5px] px-1.5 py-0.2 rounded font-bold uppercase shrink-0 ${
                                  pin.resolved
                                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                                  : "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                                }`}
                              >
                                {pin.resolved ? "Resolved" : "Active"}
                              </span>
                            </div>

                            <p className="text-[10px] text-neutral-200 mt-1.5 line-clamp-3 leading-relaxed font-normal">
                              {pin.text}
                            </p>

                            <div className="mt-1.5 pt-1 border-t border-neutral-800 flex items-center justify-between text-[7.5px] font-meta text-neutral-400">
                              <span>{new Date(pin.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                              <span className="text-[var(--dept)] font-bold">Tap to view / resolve →</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* Glowing Laser Pointer Indicator */}
                    {laserPointer.active && (
                      <div
                        className="absolute -ml-3 -mt-3 pointer-events-none z-30 transition-all duration-75"
                        style={{ left: `${laserPointer.x}%`, top: `${laserPointer.y}%` }}
                      >
                        <div className="relative">
                          <div className="w-6 h-6 rounded-full bg-red-500/40 animate-ping absolute -inset-0.5" />
                          <div className="w-5 h-5 rounded-full bg-red-500 border-2 border-white shadow-[0_0_15px_red] flex items-center justify-center text-[7px] text-white font-bold" />
                          {laserPointer.senderName && (
                            <span className="absolute left-6 top-0 whitespace-nowrap bg-black/90 text-white font-meta text-[8px] px-2 py-0.5 rounded-full border border-neutral-700 shadow-md">
                              🔴 {laserPointer.senderName}
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Right-Click Hint Badge */}
                    <div className="absolute bottom-1.5 right-1.5 bg-black/80 backdrop-blur-sm px-2 py-0.5 rounded text-[8px] text-neutral-300 flex items-center gap-1 pointer-events-none z-20">
                      <span>⚡</span> Right-click for markup menu
                    </div>
                  </div>

                  <p className="text-neutral-300 text-[11px] italic bg-neutral-900/80 p-2.5 rounded-lg border border-neutral-700/50 leading-relaxed">
                    "{activeMockup.notes || "High-resolution proof for design review."}"
                  </p>

                  {/* Client Live Feedback Notes & Approvals Timeline */}
                  {meeting.liveProofing?.feedbackNotes && meeting.liveProofing.feedbackNotes.length > 0 && (
                    <div className="space-y-1.5 pt-2 border-t border-neutral-700/60">
                      <span className="font-meta text-[8.5px] uppercase font-bold text-neutral-400 block">
                        Live Review Notes ({meeting.liveProofing.feedbackNotes.length})
                      </span>
                      <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                        {meeting.liveProofing.feedbackNotes.map((note) => (
                          <div
                            key={note.id}
                            className={`p-2 rounded-lg border text-[10px] ${
                              note.approved
                                ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-200"
                                : "bg-neutral-900 border-neutral-700 text-neutral-300"
                            }`}
                          >
                            <div className="flex items-center justify-between font-bold text-[9px] mb-0.5">
                              <span>{note.approved ? "✅ Approved by" : "📝 Note from"} {note.senderName}</span>
                              <span className="text-neutral-500 font-meta text-[8px]">
                                {new Date(note.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                              </span>
                            </div>
                            <p className="leading-snug">{note.text}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Note Input & 1-Click Approval Form */}
                  <div className="pt-2 border-t border-neutral-700/60 space-y-2">
                    <input
                      type="text"
                      value={proofFeedbackDraft}
                      onChange={(e) => setProofFeedbackDraft(e.target.value)}
                      placeholder="Type design feedback or revisions…"
                      className="w-full bg-neutral-900 border border-neutral-700 px-3 py-2 rounded-lg text-[16px] md:text-xs outline-none focus:border-[var(--dept)] text-white placeholder-neutral-500"
                    />

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleSubmitProofFeedback(true)}
                        className="btn btn-dept flex-1 !py-2 font-display text-[9px] font-bold uppercase shadow-sm"
                      >
                        ✓ Approve Concept
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSubmitProofFeedback(false)}
                        className="px-3 py-2 rounded-lg border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[9px] font-bold uppercase transition-colors"
                      >
                        Request Edits
                      </button>
                    </div>
                  </div>
                </div>
            )}

            {/* DRAWER: PARTICIPANTS & HOST MODERATION */}
            {activeDrawer === "participants" && (
              <div className="flex-1 p-4 overflow-y-auto space-y-4 text-xs">
                {/* Waiting Room Section (Host view) */}
                {isHost && waitingParticipants.length > 0 && (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-meta text-[9px] uppercase font-bold text-amber-400">
                        Waiting Room ({waitingParticipants.length})
                      </span>
                      <button
                        onClick={() => admitAllParticipants(meeting.id)}
                        className="font-meta text-[8.5px] text-amber-300 hover:underline"
                      >
                        Admit All
                      </button>
                    </div>
                    {waitingParticipants.map((p) => (
                      <div key={p.id} className="flex items-center justify-between text-xs py-1">
                        <span className="truncate">{p.displayName}</span>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => admitParticipant(meeting.id, p.id)}
                            className="font-meta text-[9px] px-2 py-0.5 bg-emerald-600 rounded hover:bg-emerald-500"
                          >
                            Admit
                          </button>
                          <button
                            onClick={() => removeParticipant(meeting.id, p.id)}
                            className="font-meta text-[9px] px-2 py-0.5 bg-red-600 rounded hover:bg-red-500"
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Active Participants List */}
                <div className="space-y-2">
                  <span className="font-meta text-[9px] uppercase font-bold text-neutral-500 block">
                    In Meeting ({activeParticipants.length})
                  </span>
                  {activeParticipants.map((p) => {
                    const isMe = p.id === myParticipantId;
                    const thumbStream = isMe ? localStream : remoteStreams.get(p.id) || null;
                    const thumbHasVideo = isMe
                      ? (!isVideoOff && localStream && localStream.getVideoTracks().some((t) => t.enabled && t.readyState === "live"))
                      : (!p.isScreenSharing && thumbStream && thumbStream.getVideoTracks().some((t) => t.enabled && t.readyState === "live") && !p.isVideoOff);
                    return (
                    <div
                      key={p.id}
                      className={`p-2.5 rounded-lg bg-neutral-800 border flex items-center justify-between gap-2 transition-all ${
                        p.isHandRaised
                          ? "border-amber-400 ring-1 ring-amber-400"
                          : speakingIds.has(p.id)
                          ? "border-emerald-400 ring-2 ring-emerald-400/70 shadow-[0_0_14px_rgba(52,211,153,0.45)]"
                          : "border-neutral-700"
                      }`}
                    >
                      {/* Live video preview thumbnail (Zoom-style) */}
                      <button
                        onClick={() => handleSpotlightParticipant(p.id)}
                        title={`Maximize ${p.displayName}`}
                        className="relative w-20 aspect-video shrink-0 rounded-md overflow-hidden bg-neutral-900 border border-neutral-700 hover:border-cyan-400 transition-colors"
                      >
                        {thumbHasVideo && thumbStream ? (
                          <VideoTile stream={thumbStream} muted={true} isMirrored={isMe} className="w-full h-full object-cover" />
                        ) : (
                          <span className="flex items-center justify-center h-full text-[11px] font-bold text-neutral-400">
                            {p.isScreenSharing ? "🖥️" : p.displayName.slice(0, 2).toUpperCase()}
                          </span>
                        )}
                        {speakingIds.has(p.id) && (
                          <span className="absolute bottom-0.5 right-0.5 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="Speaking" />
                        )}
                      </button>

                      <div className="truncate flex-1">
                        <p className="font-bold text-xs truncate flex items-center gap-1.5">
                          <span>{p.displayName} {isMe ? "(You)" : ""}</span>
                          {p.isScreenSharing && <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-meta uppercase">Presenting</span>}
                          {p.isHandRaised && <span className="text-amber-400">✋</span>}
                        </p>
                        <p className="font-meta text-[9px] text-neutral-400 capitalize">
                          {p.role} · {p.isMuted ? "Muted" : speakingIds.has(p.id) ? "Speaking…" : "Active"}
                        </p>
                      </div>

                      {/* Participant Actions */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => handleSpotlightParticipant(p.id)}
                          className="p-1 rounded bg-neutral-700 text-[10px] hover:bg-cyan-600"
                          title="Spotlight speaker"
                        >
                          ⭐
                        </button>
                        {isHost && p.isHandRaised && (
                          <button
                            onClick={() => handleLowerParticipantHand(p.id)}
                            className="p-1 rounded bg-amber-500 text-black text-[10px]"
                            title="Lower hand"
                          >
                            ✋
                          </button>
                        )}
                        {isHost && !isMe && (
                          <>
                            {p.isMuted ? (
                              <button
                                onClick={() => updateParticipant(meeting.id, p.id, { unmuteRequestedAt: new Date().toISOString() })}
                                className="p-1 rounded bg-neutral-700 text-[10px] hover:bg-emerald-600"
                                title="Ask to unmute"
                              >
                                🎙️
                              </button>
                            ) : (
                              <button
                                onClick={() => updateParticipant(meeting.id, p.id, { isMuted: true })}
                                className="p-1 rounded bg-neutral-700 text-[10px] hover:bg-neutral-600"
                                title="Mute this participant"
                              >
                                🔇
                              </button>
                            )}
                            <button
                              onClick={async () => {
                                // Destructive moderation action — confirm, then report outcome.
                                if (!window.confirm(`Remove ${p.displayName} from the meeting?`)) return;
                                try {
                                  await removeParticipant(meeting.id, p.id);
                                  toast.info(`${p.displayName} was removed from the meeting.`);
                                } catch {
                                  toast.error("Could not remove participant — please try again.");
                                }
                              }}
                              className="p-1 rounded bg-red-600/80 text-[10px] hover:bg-red-500"
                              title="Remove from meeting"
                            >
                              🚫
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    );
                  })}
                </div>

                {/* Host Meeting Lock Toggle */}
                {isHost && (
                  <div className="pt-4 border-t border-neutral-800">
                    <button
                      onClick={() => setMeetingLock(meeting.id, !meeting.meetingLocked)}
                      className="w-full font-meta text-[10px] uppercase font-bold py-2 border border-neutral-700 rounded bg-neutral-800 hover:border-amber-400 transition-colors flex items-center justify-center gap-2"
                    >
                      <span>{meeting.meetingLocked ? "🔓" : "🔒"}</span>
                      {meeting.meetingLocked ? "Unlock Meeting for New Attendees" : "Lock Meeting (Prevent New Joins)"}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* DRAWER: AI MEETING INTELLIGENCE */}
            {activeDrawer === "intelligence" && (
              <div className="flex-1 p-4 overflow-y-auto space-y-4 text-xs">
                <div>
                  <button
                    onClick={handleGenerateAiSummary}
                    disabled={isGeneratingAi}
                    className="btn btn-dept w-full !py-2 font-meta text-[10px] uppercase font-bold tracking-wider"
                  >
                    {isGeneratingAi ? "✨ Generating Summary…" : "✨ Generate AI Summary"}
                  </button>
                </div>

                {meeting.intelligence ? (
                  <div className="space-y-4">
                    <div className="p-3 bg-neutral-800 rounded-lg border border-neutral-700">
                      <p className="font-meta text-[9px] uppercase font-bold text-cyan-400 mb-1">Executive Summary</p>
                      <p className="text-neutral-300 leading-relaxed text-[11px]">{meeting.intelligence.summary}</p>
                    </div>

                    <div className="p-3 bg-neutral-800 rounded-lg border border-neutral-700">
                      <p className="font-meta text-[9px] uppercase font-bold text-emerald-400 mb-1">Key Decisions</p>
                      <ul className="list-disc pl-4 space-y-1 text-neutral-300 text-[11px]">
                        {meeting.intelligence.decisions.map((d, i) => (
                          <li key={i}>{d}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="p-3 bg-neutral-800 rounded-lg border border-neutral-700">
                      <p className="font-meta text-[9px] uppercase font-bold text-amber-400 mb-1">Action Items</p>
                      <div className="space-y-1.5 mt-1">
                        {meeting.intelligence.actionItems.map((act, i) => (
                          <div key={i} className="p-2 bg-neutral-900 rounded border border-neutral-700/70 text-[11px]">
                            <p className="font-bold text-white">{act.task}</p>
                            <p className="font-meta text-[9px] text-neutral-400 mt-0.5">
                              Assignee: {act.assignee} · Due: {act.dueDate}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-neutral-500 text-center py-6 text-xs">
                    Click above to synthesize discussions into AI action items, key decisions, and meeting summaries.
                  </p>
                )}
              </div>
            )}

            {/* DRAWER: BREAKOUT ROOMS (2026 Full Creation, Assignment, Viewing & Session Manager) */}
            {activeDrawer === "breakouts" && (
              <div className="flex-1 p-3 sm:p-4 overflow-y-auto overscroll-contain space-y-4 text-xs bg-neutral-950 md:bg-neutral-900/50">
                {/* Active Status Summary Banner */}
                <div className="p-3 rounded-2xl bg-gradient-to-br from-purple-950/60 via-neutral-900 to-neutral-900 border border-purple-500/30 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-xl bg-purple-500/20 border border-purple-400/40 flex items-center justify-center text-sm">
                        🔀
                      </span>
                      <div>
                        <p className="font-display text-xs font-bold uppercase text-white">
                          Breakout Sessions
                        </p>
                        <p className="font-meta text-[9px] text-purple-200/80">
                          {breakoutRooms.length === 0
                            ? "No breakout rooms created yet"
                            : `${openBreakoutRooms.length} open · ${breakoutRooms.length} total`}
                        </p>
                      </div>
                    </div>
                    {breakoutRemainingSeconds !== null && (
                      <span className="font-mono text-[10px] px-2 py-1 rounded-lg bg-amber-500/20 border border-amber-400/40 text-amber-200 font-bold">
                        ⏱️ {formatBreakoutCountdown(breakoutRemainingSeconds)}
                      </span>
                    )}
                  </div>

                  {/* Current Location Pill */}
                  <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-purple-500/20 text-[10px]">
                    <span className="font-meta text-neutral-400">Your Location:</span>
                    {myActiveBreakoutRoom ? (
                      <div className="flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded-full bg-purple-500/25 border border-purple-400/50 text-purple-200 font-bold">
                          🟢 {myActiveBreakoutRoom.name}
                        </span>
                        <button
                          type="button"
                          onClick={async () => {
                            const updated = await joinBreakoutRoom(meeting.id, myParticipantId, null);
                            if (updated) setMeeting({ ...updated });
                            toast.success("Returned to Main Stage");
                          }}
                          className="px-2 py-0.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white font-meta text-[9px] font-bold"
                        >
                          ↩️ Main Stage
                        </button>
                      </div>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold font-meta text-[9px]">
                        🌐 Main Stage
                      </span>
                    )}
                  </div>
                </div>

                {/* HOST CREATION, QUICK SPLIT, TIMER & GLOBAL SESSION CONTROLS */}
                {isHost && (
                  <div className="space-y-3">
                    {/* 1. Create Single Custom Room */}
                    <div className="p-3 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <p className="font-meta text-[9px] uppercase font-bold text-purple-300 tracking-wider">
                          + Create Breakout Room
                        </p>
                        <div className="flex items-center gap-1">
                          <span className="font-meta text-[8.5px] text-neutral-400">Timer:</span>
                          <select
                            value={breakoutTimerMinutes}
                            onChange={(e) => setBreakoutTimerMinutes(Number(e.target.value))}
                            className="bg-neutral-800 border border-neutral-700 rounded-lg px-1.5 py-0.5 text-[9.5px] text-white outline-none"
                            aria-label="Breakout timer duration"
                          >
                            <option value={0}>No limit</option>
                            <option value={5}>5 min</option>
                            <option value={10}>10 min</option>
                            <option value={15}>15 min</option>
                            <option value={30}>30 min</option>
                          </select>
                        </div>
                      </div>

                      <input
                        type="text"
                        value={newRoomName}
                        onChange={(e) => setNewRoomName(e.target.value)}
                        placeholder="Room name (e.g. Brand Strategy, Design Pod A)"
                        className="w-full bg-neutral-950 border border-neutral-700 focus:border-purple-500 px-3 py-2 rounded-xl text-xs outline-none text-white placeholder-neutral-500"
                      />
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newRoomTopic}
                          onChange={(e) => setNewRoomTopic(e.target.value)}
                          placeholder="Creative topic / goal (optional)"
                          className="flex-1 bg-neutral-950 border border-neutral-700 focus:border-purple-500 px-3 py-1.5 rounded-xl text-[11px] outline-none text-white placeholder-neutral-500"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            const nameToUse =
                              newRoomName.trim() || `Breakout Room ${breakoutRooms.length + 1}`;
                            const updated = await createBreakoutRoom(meeting.id, nameToUse, {
                              topic: newRoomTopic.trim() || undefined,
                              durationMinutes:
                                breakoutTimerMinutes > 0 ? breakoutTimerMinutes : undefined,
                              status: "open",
                            });
                            if (updated) {
                              setMeeting({ ...updated });
                              setNewRoomName("");
                              setNewRoomTopic("");
                              toast.success(`Created "${nameToUse}"`);
                            }
                          }}
                          className="btn btn-dept !py-1.5 !px-3.5 font-display text-[10px] font-bold uppercase shrink-0"
                        >
                          + Add Room
                        </button>
                      </div>
                    </div>

                    {/* 2. Quick Split & Auto-Assign Generator */}
                    <div className="p-3 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <p className="font-meta text-[9px] uppercase font-bold text-cyan-300 tracking-wider">
                          ⚡ Quick Split &amp; Auto-Assign
                        </p>
                        <div className="flex items-center gap-1">
                          {[2, 3, 4].map((count) => (
                            <button
                              key={count}
                              type="button"
                              onClick={() => setBreakoutQuickCount(count)}
                              className={`font-meta text-[9px] px-2 py-0.5 rounded-md border font-bold transition-colors ${
                                breakoutQuickCount === count
                                  ? "bg-cyan-500/20 border-cyan-400 text-cyan-200"
                                  : "bg-neutral-800 border-neutral-700 text-neutral-400 hover:text-white"
                              }`}
                            >
                              {count} Rooms
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={async () => {
                            const updated = await createMultipleBreakoutRooms(
                              meeting.id,
                              breakoutQuickCount,
                              {
                                autoAssign: true,
                                durationMinutes:
                                  breakoutTimerMinutes > 0 ? breakoutTimerMinutes : undefined,
                                openImmediately: true,
                              }
                            );
                            if (updated) {
                              setMeeting({ ...updated });
                              toast.success(
                                `Created ${breakoutQuickCount} Breakout Rooms & auto-assigned attendees!`
                              );
                            }
                          }}
                          className="py-2 px-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-display text-[10px] font-bold uppercase flex items-center justify-center gap-1 shadow-sm transition-colors"
                        >
                          <span>🎲</span> Split &amp; Auto-Assign
                        </button>

                        <button
                          type="button"
                          onClick={async () => {
                            if (breakoutRooms.length === 0) {
                              const updated = await createMultipleBreakoutRooms(
                                meeting.id,
                                breakoutQuickCount,
                                {
                                  autoAssign: false,
                                  durationMinutes:
                                    breakoutTimerMinutes > 0 ? breakoutTimerMinutes : undefined,
                                  openImmediately: true,
                                }
                              );
                              if (updated) {
                                setMeeting({ ...updated });
                                toast.success(`Created ${breakoutQuickCount} empty Breakout Rooms`);
                              }
                            } else {
                              const updated = await autoAssignParticipantsToBreakoutRooms(
                                meeting.id,
                                false
                              );
                              if (updated) {
                                setMeeting({ ...updated });
                                toast.success("Redistributed participants evenly across rooms!");
                              }
                            }
                          }}
                          className="py-2 px-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-200 font-display text-[10px] font-bold uppercase flex items-center justify-center gap-1 transition-colors"
                        >
                          <span>⚖️</span>{" "}
                          {breakoutRooms.length === 0
                            ? `Create ${breakoutQuickCount} Empty`
                            : "Rebalance All"}
                        </button>
                      </div>

                      {/* Self-Select Permission Toggle */}
                      <label className="flex items-center justify-between gap-2 pt-1.5 border-t border-neutral-800 cursor-pointer select-none">
                        <span className="font-meta text-[10px] text-neutral-300">
                          Allow participants to choose &amp; switch rooms freely
                        </span>
                        <input
                          type="checkbox"
                          checked={Boolean(meeting.breakoutAllowSelfSelect)}
                          onChange={async (e) => {
                            const allow = e.target.checked;
                            const updated = await setBreakoutAllowSelfSelect(meeting.id, allow);
                            if (updated) setMeeting({ ...updated });
                            toast.info(
                              allow
                                ? "Participants can now self-select any open Breakout Room."
                                : "Participants restricted to their assigned Breakout Room."
                            );
                          }}
                          className="h-4 w-4 accent-purple-500 rounded cursor-pointer"
                        />
                      </label>
                    </div>

                    {/* 3. Global Session Controls (Open / Move All, Close / Recall All, Broadcast) */}
                    {breakoutRooms.length > 0 && (
                      <div className="p-3 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-2.5">
                        <p className="font-meta text-[9px] uppercase font-bold text-amber-300 tracking-wider">
                          🎛️ Session Orchestration
                        </p>
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            type="button"
                            onClick={async () => {
                              const updated = await openAllBreakoutRooms(meeting.id, {
                                moveAssignedIntoRooms: true,
                                durationMinutes:
                                  breakoutTimerMinutes > 0 ? breakoutTimerMinutes : undefined,
                              });
                              if (updated) {
                                setMeeting({ ...updated });
                                toast.success("Opened all rooms & moved assigned participants!");
                              }
                            }}
                            className="py-2 px-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-display text-[9.5px] font-bold uppercase flex items-center justify-center gap-1 shadow-sm transition-colors"
                            title="Open all rooms and move assigned participants into their rooms immediately"
                          >
                            <span>▶️</span> Launch &amp; Move All
                          </button>

                          <button
                            type="button"
                            onClick={async () => {
                              const updated = await closeAllBreakoutRooms(meeting.id);
                              if (updated) {
                                setMeeting({ ...updated });
                                toast.info("Closed all Breakout Rooms & recalled everyone to Main Stage");
                              }
                            }}
                            className="py-2 px-2.5 rounded-xl bg-red-600/20 hover:bg-red-600/35 border border-red-500/40 text-red-300 font-display text-[9.5px] font-bold uppercase flex items-center justify-center gap-1 transition-colors"
                            title="Close all breakout rooms and bring every participant back to the Main Stage"
                          >
                            <span>⏹️</span> Close &amp; Recall All
                          </button>
                        </div>

                        {/* Broadcast Announcement to All Breakout Rooms */}
                        <div className="pt-1.5 border-t border-neutral-800 space-y-1.5">
                          <label className="font-meta text-[9px] text-neutral-400 uppercase font-bold block">
                            📢 Broadcast Announcement to All Rooms
                          </label>
                          <div className="flex gap-1.5">
                            <input
                              type="text"
                              value={breakoutBroadcastDraft}
                              onChange={(e) => setBreakoutBroadcastDraft(e.target.value)}
                              onKeyDown={async (e) => {
                                if (e.key === "Enter" && breakoutBroadcastDraft.trim()) {
                                  e.preventDefault();
                                  const msg = breakoutBroadcastDraft.trim();
                                  setBreakoutBroadcastDraft("");
                                  const updated = await broadcastToBreakoutRooms(
                                    meeting.id,
                                    displayName,
                                    msg
                                  );
                                  if (updated) setMeeting({ ...updated });
                                  toast.success("Broadcast sent to all Breakout Rooms!");
                                }
                              }}
                              placeholder="e.g. Wrap up in 2 mins — returning to Main Stage!"
                              className="flex-1 bg-neutral-950 border border-neutral-700 focus:border-amber-400 px-2.5 py-1.5 rounded-xl text-[11px] text-white placeholder-neutral-500 outline-none"
                            />
                            <button
                              type="button"
                              onClick={async () => {
                                if (!breakoutBroadcastDraft.trim()) return;
                                const msg = breakoutBroadcastDraft.trim();
                                setBreakoutBroadcastDraft("");
                                const updated = await broadcastToBreakoutRooms(
                                  meeting.id,
                                  displayName,
                                  msg
                                );
                                if (updated) setMeeting({ ...updated });
                                toast.success("Broadcast sent to all Breakout Rooms!");
                              }}
                              className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-display text-[9.5px] font-extrabold uppercase shrink-0"
                            >
                              Send
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* PARTICIPANT / GUEST QUICK CARD (When not Host) */}
                {!isHost && (
                  <div className="p-3 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-2">
                    {myAssignedBreakoutRoom ? (
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-meta text-[9px] uppercase text-purple-300 font-bold">
                            Your Assigned Room
                          </p>
                          <p className="font-display text-xs font-bold text-white truncate">
                            {myAssignedBreakoutRoom.name}
                          </p>
                          {myAssignedBreakoutRoom.topic && (
                            <p className="font-meta text-[10px] text-neutral-400 truncate">
                              {myAssignedBreakoutRoom.topic}
                            </p>
                          )}
                        </div>
                        {myCurrentBreakoutRoomId === myAssignedBreakoutRoom.id ? (
                          <span className="px-2.5 py-1 rounded-xl bg-purple-500/20 border border-purple-400/50 text-purple-200 font-meta text-[9px] font-bold shrink-0">
                            ✓ Inside Room
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={async () => {
                              const updated = await joinBreakoutRoom(
                                meeting.id,
                                myParticipantId,
                                myAssignedBreakoutRoom.id
                              );
                              if (updated) setMeeting({ ...updated });
                              toast.success(`Joined "${myAssignedBreakoutRoom.name}"`);
                            }}
                            className="btn btn-dept !py-1.5 !px-3 font-display text-[10px] font-bold uppercase shrink-0"
                          >
                            🚪 Join Room
                          </button>
                        )}
                      </div>
                    ) : (
                      <p className="font-meta text-[10.5px] text-neutral-400">
                        {meeting.breakoutAllowSelfSelect
                          ? "Self-select is enabled! Choose any open Breakout Room below to join its creative stage."
                          : "The Host manages room assignments. When you are assigned to a room, you can join with 1 click."}
                      </p>
                    )}
                  </div>
                )}

                {/* DIRECTORY OF BREAKOUT ROOMS (Interactive Cards for Viewing, Assigning & Visiting) */}
                {breakoutRooms.length === 0 ? (
                  <div className="text-center py-10 px-4 rounded-2xl border border-dashed border-neutral-800 space-y-2">
                    <span className="text-3xl">🔀</span>
                    <p className="font-display text-xs font-bold uppercase text-neutral-300">
                      No Breakout Rooms Active
                    </p>
                    <p className="font-meta text-[10px] text-neutral-500 max-w-xs mx-auto">
                      {isHost
                        ? "Create custom rooms above or use Quick Split to divide participants into focused collaboration pods."
                        : "Waiting for the host to launch breakout sessions."}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between px-1">
                      <span className="font-meta text-[9px] uppercase font-bold text-neutral-400 tracking-wider">
                        Breakout Rooms ({breakoutRooms.length})
                      </span>
                      {breakoutHelpRequests.length > 0 && isHost && (
                        <span className="font-meta text-[9px] px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-400 text-amber-200 font-bold animate-pulse">
                          🆘 {breakoutHelpRequests.length} Help Request{breakoutHelpRequests.length > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>

                    {breakoutRooms.map((room: MeetingBreakoutRoom) => {
                      const isMyCurrentRoom = myCurrentBreakoutRoomId === room.id;
                      const isMyAssigned = room.assignedParticipants.includes(myParticipantId);
                      const canParticipantJoin =
                        room.status === "open" &&
                        (isHost || isMyAssigned || Boolean(meeting.breakoutAllowSelfSelect));

                      // Combine assigned + currently active participants in this room
                      const roomMemberIds = Array.from(
                        new Set([
                          ...room.assignedParticipants,
                          ...room.activeParticipants,
                          ...activeParticipants
                            .filter((p) => p.currentBreakoutRoomId === room.id)
                            .map((p) => p.id),
                        ])
                      );
                      const roomMembers = roomMemberIds
                        .map((pid) => activeParticipants.find((p) => p.id === pid))
                        .filter((p): p is MeetingParticipant => Boolean(p));

                      const activeInRoomCount = activeParticipants.filter(
                        (p) => p.currentBreakoutRoomId === room.id
                      ).length;

                      const roomHelpRequesters = activeParticipants.filter(
                        (p) => p.helpRequestedRoomId === room.id
                      );

                      const unassignedOrOtherParticipants = activeParticipants.filter(
                        (p) => !roomMemberIds.includes(p.id)
                      );

                      return (
                        <div
                          key={room.id}
                          className={`p-3 rounded-2xl border transition-all space-y-2.5 ${
                            isMyCurrentRoom
                              ? "bg-purple-950/40 border-purple-400/70 shadow-lg"
                              : roomHelpRequesters.length > 0 && isHost
                              ? "bg-amber-950/30 border-amber-400/70"
                              : "bg-neutral-900/90 border-neutral-800 hover:border-neutral-700"
                          }`}
                        >
                          {/* Room Header */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              {editingBreakoutRoomId === room.id && isHost ? (
                                <div className="space-y-1.5">
                                  <input
                                    type="text"
                                    value={editingBreakoutName}
                                    onChange={(e) => setEditingBreakoutName(e.target.value)}
                                    className="w-full bg-neutral-950 border border-purple-500 rounded-lg px-2 py-1 text-xs text-white outline-none"
                                    placeholder="Room name"
                                  />
                                  <input
                                    type="text"
                                    value={editingBreakoutTopic}
                                    onChange={(e) => setEditingBreakoutTopic(e.target.value)}
                                    className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-2 py-1 text-[10px] text-white outline-none"
                                    placeholder="Topic / brief"
                                  />
                                  <div className="flex gap-1">
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        const updated = await updateBreakoutRoom(
                                          meeting.id,
                                          room.id,
                                          {
                                            name: editingBreakoutName.trim() || room.name,
                                            topic: editingBreakoutTopic.trim() || undefined,
                                          }
                                        );
                                        if (updated) setMeeting({ ...updated });
                                        setEditingBreakoutRoomId(null);
                                        toast.success("Room updated");
                                      }}
                                      className="px-2 py-0.5 rounded bg-purple-600 text-white font-meta text-[9px] font-bold"
                                    >
                                      Save
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingBreakoutRoomId(null)}
                                      className="px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 font-meta text-[9px]"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <div className="flex items-center flex-wrap gap-1.5">
                                    <h4 className="font-display text-xs font-bold uppercase text-white truncate">
                                      {room.name}
                                    </h4>
                                    <span
                                      className={`font-meta text-[8px] px-1.5 py-0.5 rounded-full uppercase font-extrabold ${
                                        room.status === "open"
                                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                                          : "bg-neutral-800 text-neutral-400 border border-neutral-700"
                                      }`}
                                    >
                                      {room.status === "open" ? "Open" : "Closed"}
                                    </span>
                                    <span className="font-meta text-[8.5px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300">
                                      {activeInRoomCount} active / {roomMembers.length} assigned
                                    </span>
                                  </div>
                                  {room.topic && (
                                    <p className="font-meta text-[10px] text-purple-200/80 mt-0.5">
                                      🎯 {room.topic}
                                    </p>
                                  )}
                                </>
                              )}
                            </div>

                            {/* Join / Leave / Edit / Delete Room Actions */}
                            <div className="flex items-center gap-1 shrink-0">
                              {isMyCurrentRoom ? (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const updated = await joinBreakoutRoom(
                                      meeting.id,
                                      myParticipantId,
                                      null
                                    );
                                    if (updated) setMeeting({ ...updated });
                                    toast.info("Returned to Main Stage");
                                  }}
                                  className="px-2.5 py-1 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 text-white font-meta text-[9px] font-bold"
                                >
                                  ↩️ Leave
                                </button>
                              ) : canParticipantJoin ? (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const updated = await joinBreakoutRoom(
                                      meeting.id,
                                      myParticipantId,
                                      room.id
                                    );
                                    if (updated) setMeeting({ ...updated });
                                    toast.success(
                                      isHost
                                        ? `Visiting "${room.name}"`
                                        : `Joined "${room.name}"`
                                    );
                                  }}
                                  className="px-2.5 py-1 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-meta text-[9px] font-bold shadow-xs"
                                >
                                  🚪 {isHost ? "Visit" : "Join"}
                                </button>
                              ) : null}

                              {isHost && editingBreakoutRoomId !== room.id && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingBreakoutRoomId(room.id);
                                      setEditingBreakoutName(room.name);
                                      setEditingBreakoutTopic(room.topic || "");
                                    }}
                                    className="w-6 h-6 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white flex items-center justify-center text-[10px]"
                                    title="Rename room or edit topic"
                                  >
                                    ✏️
                                  </button>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      const updated = await deleteBreakoutRoom(
                                        meeting.id,
                                        room.id
                                      );
                                      if (updated) setMeeting({ ...updated });
                                      toast.info(`Deleted "${room.name}"`);
                                    }}
                                    className="w-6 h-6 rounded-lg bg-neutral-800 hover:bg-red-950/60 text-neutral-400 hover:text-red-300 flex items-center justify-center text-[10px]"
                                    title="Delete breakout room"
                                  >
                                    🗑️
                                  </button>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Help Request Banner inside Room Card */}
                          {roomHelpRequesters.length > 0 && isHost && (
                            <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-400/50 flex items-center justify-between gap-2">
                              <span className="font-meta text-[9.5px] text-amber-200 font-bold truncate">
                                🆘 {roomHelpRequesters.map((r) => r.displayName).join(", ")} requested host help
                              </span>
                              <button
                                type="button"
                                onClick={async () => {
                                  const updated = await joinBreakoutRoom(
                                    meeting.id,
                                    myParticipantId,
                                    room.id
                                  );
                                  if (updated) setMeeting({ ...updated });
                                  toast.success(`Joined "${room.name}" to assist`);
                                }}
                                className="px-2 py-0.5 rounded-lg bg-amber-400 text-black font-meta text-[9px] font-extrabold shrink-0"
                              >
                                Join Now
                              </button>
                            </div>
                          )}

                          {/* Members List inside this Room */}
                          <div className="space-y-1">
                            {roomMembers.length === 0 ? (
                              <p className="font-meta text-[10px] text-neutral-500 italic py-1">
                                No participants assigned yet.
                              </p>
                            ) : (
                              roomMembers.map((member) => {
                                const isInRoomNow = member.currentBreakoutRoomId === room.id;
                                return (
                                  <div
                                    key={member.id}
                                    className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-xl bg-neutral-950/80 border border-neutral-800/80"
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span
                                        className={`h-2 w-2 rounded-full shrink-0 ${
                                          isInRoomNow ? "bg-emerald-400" : "bg-amber-400/70"
                                        }`}
                                        title={
                                          isInRoomNow
                                            ? "Currently inside this breakout room"
                                            : "Assigned (currently on Main Stage)"
                                        }
                                      />
                                      <span className="font-medium text-[11px] text-neutral-200 truncate">
                                        {member.displayName}{" "}
                                        {member.id === myParticipantId ? "(You)" : ""}
                                      </span>
                                      <span
                                        className={`font-meta text-[8px] px-1.5 py-0.2 rounded uppercase font-bold ${
                                          isInRoomNow
                                            ? "bg-emerald-500/15 text-emerald-300"
                                            : "bg-neutral-800 text-neutral-400"
                                        }`}
                                      >
                                        {isInRoomNow ? "In Room" : "Assigned"}
                                      </span>
                                    </div>

                                    {isHost && (
                                      <div className="flex items-center gap-1 shrink-0">
                                        {!isInRoomNow && room.status === "open" && (
                                          <button
                                            type="button"
                                            onClick={async () => {
                                              const updated = await assignParticipantToBreakoutRoom(
                                                meeting.id,
                                                member.id,
                                                room.id,
                                                true
                                              );
                                              if (updated) setMeeting({ ...updated });
                                              toast.success(
                                                `Moved ${member.displayName} into "${room.name}"`
                                              );
                                            }}
                                            className="px-1.5 py-0.5 rounded bg-purple-500/20 hover:bg-purple-500/35 text-purple-200 font-meta text-[8.5px] font-bold"
                                            title="Move participant into this room now"
                                          >
                                            Move In
                                          </button>
                                        )}
                                        <button
                                          type="button"
                                          onClick={async () => {
                                            const updated = await assignParticipantToBreakoutRoom(
                                              meeting.id,
                                              member.id,
                                              null,
                                              true
                                            );
                                            if (updated) setMeeting({ ...updated });
                                            toast.info(
                                              `Returned ${member.displayName} to Main Stage`
                                            );
                                          }}
                                          className="w-5 h-5 rounded bg-neutral-800 hover:bg-red-950/60 text-neutral-400 hover:text-red-300 flex items-center justify-center text-[9px]"
                                          title="Remove from room & return to Main Stage"
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                );
                              })
                            )}
                          </div>

                          {/* Host Quick-Assign / Move Participant Dropdown */}
                          {isHost && unassignedOrOtherParticipants.length > 0 && (
                            <div className="pt-1">
                              <select
                                value=""
                                onChange={async (e) => {
                                  const targetPid = e.target.value;
                                  if (!targetPid) return;
                                  const targetPerson = activeParticipants.find(
                                    (p) => p.id === targetPid
                                  );
                                  const updated = await assignParticipantToBreakoutRoom(
                                    meeting.id,
                                    targetPid,
                                    room.id,
                                    room.status === "open"
                                  );
                                  if (updated) setMeeting({ ...updated });
                                  toast.success(
                                    `Assigned ${targetPerson?.displayName || "participant"} to "${room.name}"`
                                  );
                                }}
                                className="w-full bg-neutral-950 border border-neutral-800 hover:border-purple-500/50 rounded-xl px-2.5 py-1.5 text-[10.5px] text-neutral-300 outline-none cursor-pointer"
                                aria-label={`Assign participant to ${room.name}`}
                              >
                                <option value="">
                                  + Assign / Move participant to {room.name}…
                                </option>
                                {unassignedOrOtherParticipants.map((p) => {
                                  const currentRoom = breakoutRooms.find(
                                    (r) =>
                                      r.id === p.currentBreakoutRoomId ||
                                      r.assignedParticipants.includes(p.id)
                                  );
                                  return (
                                    <option key={p.id} value={p.id}>
                                      {p.displayName} {p.role === "host" ? "(Host)" : ""}{" "}
                                      {currentRoom ? `[in ${currentRoom.name}]` : "[Main Stage]"}
                                    </option>
                                  );
                                })}
                              </select>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Main Stage / Unassigned Participants Summary Card */}
                {breakoutRooms.length > 0 && (
                  <div className="p-3 rounded-2xl bg-neutral-900/70 border border-neutral-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-meta text-[9px] uppercase font-bold text-neutral-400">
                        🌐 Currently on Main Stage
                      </span>
                      <span className="font-meta text-[9px] text-neutral-400">
                        {activeParticipants.filter((p) => !p.currentBreakoutRoomId).length} people
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {activeParticipants
                        .filter((p) => !p.currentBreakoutRoomId)
                        .map((p) => (
                          <span
                            key={p.id}
                            className="px-2 py-0.5 rounded-lg bg-neutral-950 border border-neutral-800 text-[10px] text-neutral-300 flex items-center gap-1"
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            <span>
                              {p.displayName} {p.id === myParticipantId ? "(You)" : ""}
                            </span>
                          </span>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* DRAWER: SPEAKER QUEUE */}
            {activeDrawer === "queue" && (() => {
              const queue = (meeting?.speakerQueue ?? []).filter((e) => e.status === "waiting" || e.status === "invited" || e.status === "speaking");
              const mySpeakingEntry = (meeting?.speakerQueue ?? []).find((e) => e.participantId === myParticipantId && e.status === "speaking");
              return (
                <div className="flex-1 flex flex-col overflow-hidden bg-neutral-950 md:bg-neutral-900/50">
                  {/* Host control bar */}
                  {isHost && (
                    <div className="px-3 py-2 border-b border-neutral-800 flex items-center justify-between gap-2 shrink-0">
                      <span className="font-meta text-[9px] text-neutral-400 uppercase font-bold">{queue.length} in queue</span>
                      <button
                        type="button"
                        onClick={handleHostInviteNextSpeaker}
                        disabled={queue.filter((e) => e.status === "waiting").length === 0}
                        className="h-7 px-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-meta text-[9px] font-bold uppercase tracking-wider rounded-lg transition-colors flex items-center gap-1"
                      >
                        <span>🎤</span> Invite Next
                      </button>
                    </div>
                  )}
                  <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {queue.length === 0 && (
                      <div className="text-center py-10 text-neutral-500">
                        <p className="text-2xl mb-2">✋</p>
                        <p className="font-meta text-xs">No one in the queue yet.</p>
                        {!isHost && <p className="font-meta text-[10px] text-neutral-600 mt-1">Raise your hand to join.</p>}
                      </div>
                    )}
                    {queue.map((entry, idx) => (
                      <div key={entry.id} className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-xs ${
                        entry.status === "speaking" ? "bg-emerald-950/40 border-emerald-500/40" :
                        entry.status === "invited" ? "bg-amber-950/40 border-amber-400/40 animate-pulse" :
                        "bg-neutral-900 border-neutral-800"
                      }`}>
                        <span className="font-meta text-[10px] text-neutral-500 w-5 text-center shrink-0">#{idx + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-display text-xs font-bold text-white truncate">{entry.displayName}{entry.participantId === myParticipantId ? " (You)" : ""}</p>
                          <p className="font-meta text-[9px] text-neutral-500 capitalize">{entry.status === "speaking" ? "🎤 Speaking" : entry.status === "invited" ? "⏳ Invited…" : "Waiting"}</p>
                        </div>
                        {isHost && entry.status === "waiting" && (
                          <button type="button" onClick={() => handleSkipQueueEntry(entry.id)}
                            className="h-6 px-2 text-[9px] font-bold font-meta text-neutral-400 hover:text-red-400 rounded-lg hover:bg-red-950/30 transition-colors" title="Skip">
                            Skip
                          </button>
                        )}
                        {entry.participantId === myParticipantId && entry.status === "speaking" && (
                          <button type="button" onClick={handleFinishSpeaking}
                            className="h-7 px-3 bg-emerald-600 hover:bg-emerald-500 text-white text-[9px] font-bold font-meta rounded-lg transition-colors">
                            Done ✓
                          </button>
                        )}
                      </div>
                    ))}
                    {/* My speaking entry done? Show finish button prominently */}
                    {mySpeakingEntry && (
                      <div className="p-3 rounded-xl bg-emerald-900/30 border border-emerald-500/40 text-center">
                        <p className="font-meta text-[10px] text-emerald-300 font-bold mb-2">You have the floor 🎤</p>
                        <button type="button" onClick={handleFinishSpeaking}
                          className="h-8 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-meta text-[10px] font-bold rounded-xl transition-colors">
                          Finish Speaking
                        </button>
                      </div>
                    )}
                    {/* Completed/skipped history */}
                    {(meeting?.speakerQueue ?? []).filter((e) => e.status === "completed" || e.status === "skipped" || e.status === "withdrawn").slice(-5).reverse().map((entry) => (
                      <div key={entry.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-neutral-600 text-xs opacity-60">
                        <span className="text-[9px]">{entry.status === "completed" ? "✓" : entry.status === "skipped" ? "⤵" : "↓"}</span>
                        <span className="font-meta text-[9px] truncate">{entry.displayName}</span>
                        <span className="font-meta text-[9px] capitalize ml-auto">{entry.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* DRAWER: AGENDA & FOCUS TIMER */}
            {activeDrawer === "agenda" && (() => {
              const items = meeting?.agendaItems ?? [];
              const activeItem = items.find((it) => it.status === "active");
              const formatSecs = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
              const getRemaining = (it: AgendaItem) => {
                if (it.status === "active" && it.deadlineAt) {
                  return Math.max(0, Math.floor((new Date(it.deadlineAt).getTime() - Date.now()) / 1000));
                }
                if (it.status === "paused") return it.pausedRemainingSeconds ?? it.plannedDurationSeconds;
                return it.plannedDurationSeconds;
              };
              const isOverTime = (it: AgendaItem) => it.status === "active" && it.deadlineAt && Date.now() > new Date(it.deadlineAt).getTime();
              // agendaTimerTick drives re-render
              void agendaTimerTick;
              return (
                <div className="flex-1 flex flex-col overflow-hidden bg-neutral-950 md:bg-neutral-900/50">
                  {/* Active timer banner */}
                  {activeItem && (
                    <div className={`px-3 py-2.5 border-b shrink-0 flex items-center gap-2 ${isOverTime(activeItem) ? "bg-red-950/40 border-red-500/30" : "bg-emerald-950/30 border-emerald-500/30"}`}>
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-base ${isOverTime(activeItem) ? "bg-red-500/20 text-red-300 animate-pulse" : "bg-emerald-500/20 text-emerald-300"}`}>⏱</div>
                      <div className="flex-1 min-w-0">
                        <p className="font-display text-[10px] font-bold text-white truncate">{activeItem.title}</p>
                        <p className={`font-meta text-[11px] font-extrabold tabular-nums ${isOverTime(activeItem) ? "text-red-400" : "text-emerald-400"}`}>
                          {isOverTime(activeItem) ? "+" : ""}{formatSecs(getRemaining(activeItem))} {isOverTime(activeItem) ? "over" : "left"}
                        </p>
                      </div>
                      {isHost && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button type="button" onClick={() => handlePauseAgendaItem(activeItem.id)}
                            className="h-6 px-2 bg-amber-600/30 hover:bg-amber-600/50 text-amber-300 font-meta text-[9px] rounded-lg" title="Pause">⏸</button>
                          <button type="button" onClick={() => handleExtendAgendaTimer(activeItem.id, 300)}
                            className="h-6 px-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-meta text-[9px] rounded-lg" title="+5 min">+5m</button>
                          <button type="button" onClick={() => handleCompleteAgendaItem(activeItem.id)}
                            className="h-6 px-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-meta text-[9px] rounded-lg">✓ Done</button>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {items.length === 0 && !agendaFormOpen && (
                      <div className="text-center py-8 text-neutral-500">
                        <p className="text-2xl mb-2">📋</p>
                        <p className="font-meta text-xs">No agenda items yet.</p>
                        {isHost && <p className="font-meta text-[10px] text-neutral-600 mt-1">Add items to track time per topic.</p>}
                      </div>
                    )}
                    {items.map((it) => {
                      const rem = getRemaining(it);
                      const over = isOverTime(it);
                      return (
                        <div key={it.id} className={`flex items-start gap-2.5 p-2.5 rounded-xl border text-xs ${
                          it.status === "completed" ? "bg-neutral-900/40 border-neutral-800 opacity-60" :
                          it.status === "active" ? over ? "bg-red-950/30 border-red-500/30" : "bg-emerald-950/30 border-emerald-500/30" :
                          it.status === "paused" ? "bg-amber-950/20 border-amber-500/20" :
                          "bg-neutral-900 border-neutral-800"
                        }`}>
                          <div className={`w-5 h-5 rounded-full border flex items-center justify-center text-[9px] shrink-0 mt-0.5 ${
                            it.status === "completed" ? "bg-emerald-600/30 border-emerald-500/40 text-emerald-400" :
                            it.status === "active" ? "bg-emerald-500/30 border-emerald-400 text-emerald-300 animate-pulse" :
                            it.status === "paused" ? "bg-amber-500/20 border-amber-400/40 text-amber-300" :
                            "bg-neutral-800 border-neutral-700 text-neutral-500"
                          }`}>
                            {it.status === "completed" ? "✓" : it.status === "active" ? "▶" : it.status === "paused" ? "⏸" : "○"}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-display text-xs font-bold text-white truncate">{it.title}</p>
                            <p className={`font-meta text-[9px] tabular-nums ${over ? "text-red-400 font-extrabold" : "text-neutral-500"}`}>
                              {it.status === "pending" ? `${it.plannedDurationSeconds / 60}m planned` :
                               it.status === "completed" ? "Completed" :
                               `${formatSecs(rem)} ${it.status === "paused" ? "paused" : it.status === "active" ? (over ? "over!" : "left") : ""}`}
                            </p>
                          </div>
                          {isHost && (
                            <div className="flex items-center gap-1 shrink-0">
                              {it.status === "pending" && (
                                <button type="button" onClick={() => handleStartAgendaItem(it.id)}
                                  className="h-6 px-2 bg-emerald-600/30 hover:bg-emerald-600/60 text-emerald-300 font-meta text-[9px] rounded-lg">▶</button>
                              )}
                              {it.status === "paused" && (
                                <button type="button" onClick={() => handleResumeAgendaItem(it.id)}
                                  className="h-6 px-2 bg-emerald-600/30 hover:bg-emerald-600/60 text-emerald-300 font-meta text-[9px] rounded-lg">▶</button>
                              )}
                              {it.status !== "completed" && (
                                <button type="button" onClick={() => handleDeleteAgendaItem(it.id)}
                                  className="h-6 w-6 text-neutral-600 hover:text-red-400 font-meta text-[10px] rounded-lg hover:bg-red-950/30 flex items-center justify-center" title="Delete">×</button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {/* Add agenda item form */}
                    {isHost && (
                      agendaFormOpen ? (
                        <div className="p-3 rounded-xl border border-neutral-700 bg-neutral-900 space-y-2">
                          <input
                            type="text" value={newAgendaTitle} onChange={(e) => setNewAgendaTitle(e.target.value)}
                            placeholder="Topic title…" maxLength={80}
                            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white placeholder-neutral-500 outline-none focus:border-[var(--dept)]"
                          />
                          <div className="flex items-center gap-2">
                            <label className="font-meta text-[9px] text-neutral-400 shrink-0">Duration:</label>
                            <input
                              type="number" min={1} max={120} value={newAgendaDuration} onChange={(e) => setNewAgendaDuration(Number(e.target.value))}
                              className="w-16 bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1 text-xs text-white outline-none focus:border-[var(--dept)]"
                            />
                            <span className="font-meta text-[9px] text-neutral-400">min</span>
                          </div>
                          <div className="flex gap-1.5">
                            <button type="button" onClick={handleAddAgendaItem}
                              disabled={!newAgendaTitle.trim()}
                              className="flex-1 h-7 bg-[var(--dept)] hover:opacity-90 disabled:opacity-40 text-black font-meta text-[9px] font-bold rounded-lg">
                              Add Item
                            </button>
                            <button type="button" onClick={() => setAgendaFormOpen(false)}
                              className="h-7 px-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-meta text-[9px] rounded-lg">
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button type="button" onClick={() => setAgendaFormOpen(true)}
                          className="w-full h-8 border border-dashed border-neutral-700 hover:border-[var(--dept)] rounded-xl text-neutral-500 hover:text-[var(--dept)] font-meta text-[9px] transition-colors">
                          + Add Agenda Item
                        </button>
                      )
                    )}
                  </div>
                </div>
              );
            })()}

            {/* DRAWER: LIVE ACTION BOARD */}
            {activeDrawer === "actions" && (() => {
              const actions = meeting?.liveActionItems ?? [];
              const statusColors: Record<string, string> = {
                todo: "bg-neutral-800 text-neutral-300",
                in_progress: "bg-blue-900/40 text-blue-300 border-blue-500/30",
                blocked: "bg-red-900/40 text-red-300 border-red-500/30",
                done: "bg-emerald-900/40 text-emerald-300 border-emerald-500/30",
                cancelled: "bg-neutral-900/40 text-neutral-500",
              };
              const approvalBadge: Record<string, { color: string; label: string }> = {
                suggested: { color: "bg-amber-500/20 text-amber-300 border-amber-500/30", label: "Proposed" },
                awaiting_confirmation: { color: "bg-sky-500/20 text-sky-300 border-sky-500/30", label: "Pending" },
                approved: { color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30", label: "✓ Approved" },
                rejected: { color: "bg-red-500/20 text-red-400 border-red-500/30", label: "Rejected" },
              };
              return (
                <div className="flex-1 flex flex-col overflow-hidden bg-neutral-950 md:bg-neutral-900/50">
                  <div className="px-3 py-2 border-b border-neutral-800 flex items-center justify-between shrink-0">
                    <span className="font-meta text-[9px] text-neutral-400 uppercase font-bold">{actions.filter((a) => a.approvalStatus === "approved").length}/{actions.length} approved</span>
                    <button type="button" onClick={() => setActionFormOpen((v) => !v)}
                      className="h-7 px-3 bg-[var(--dept)] hover:opacity-90 text-black font-meta text-[9px] font-bold rounded-lg">
                      + Add Action
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {/* Propose form */}
                    {actionFormOpen && (
                      <div className="p-3 rounded-xl border border-neutral-700 bg-neutral-900 space-y-2">
                        <input type="text" value={newActionTitle} onChange={(e) => setNewActionTitle(e.target.value)}
                          placeholder="Action item…" maxLength={120}
                          className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white placeholder-neutral-500 outline-none focus:border-[var(--dept)]"
                        />
                        <input type="text" value={newActionAssignee} onChange={(e) => setNewActionAssignee(e.target.value)}
                          placeholder="Assign to (optional)…" maxLength={60}
                          className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white placeholder-neutral-500 outline-none focus:border-[var(--dept)]"
                        />
                        <div className="flex gap-1.5">
                          <button type="button" onClick={handleProposeAction} disabled={!newActionTitle.trim()}
                            className="flex-1 h-7 bg-[var(--dept)] hover:opacity-90 disabled:opacity-40 text-black font-meta text-[9px] font-bold rounded-lg">
                            Propose
                          </button>
                          <button type="button" onClick={() => setActionFormOpen(false)}
                            className="h-7 px-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-meta text-[9px] rounded-lg">Cancel</button>
                        </div>
                      </div>
                    )}
                    {actions.length === 0 && !actionFormOpen && (
                      <div className="text-center py-8 text-neutral-500">
                        <p className="text-2xl mb-2">✅</p>
                        <p className="font-meta text-xs">No action items yet.</p>
                        <p className="font-meta text-[10px] text-neutral-600 mt-1">Propose tasks to track meeting outcomes.</p>
                      </div>
                    )}
                    {actions.map((item) => (
                      <div key={item.id} className={`p-3 rounded-xl border text-xs space-y-2 ${statusColors[item.status] || "bg-neutral-900 border-neutral-800"}`}>
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-display text-xs font-bold text-white">{item.title}</p>
                            {item.assigneeName && <p className="font-meta text-[9px] text-neutral-400">→ {item.assigneeName}</p>}
                            <p className="font-meta text-[9px] text-neutral-500">by {item.proposedByName}</p>
                          </div>
                          <span className={`px-1.5 py-0.5 rounded-full text-[8px] font-bold border font-meta shrink-0 ${approvalBadge[item.approvalStatus]?.color}`}>
                            {approvalBadge[item.approvalStatus]?.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {/* Status changer */}
                          {item.approvalStatus === "approved" && (
                            <select
                              value={item.status}
                              onChange={(e) => handleUpdateActionStatus(item.id, e.target.value as ActionItemStatus)}
                              className="h-6 px-1 bg-neutral-800 border border-neutral-700 rounded-lg text-[9px] text-neutral-200 font-meta"
                            >
                              <option value="todo">To Do</option>
                              <option value="in_progress">In Progress</option>
                              <option value="blocked">Blocked</option>
                              <option value="done">Done</option>
                            </select>
                          )}
                          {/* Host approve/reject */}
                          {isHost && item.approvalStatus === "suggested" && (
                            <>
                              <button type="button" onClick={() => handleApproveAction(item.id)}
                                className="h-6 px-2 bg-emerald-600/30 hover:bg-emerald-600/60 text-emerald-300 font-meta text-[9px] rounded-lg">✓ Approve</button>
                              <button type="button" onClick={() => handleRejectAction(item.id)}
                                className="h-6 px-2 bg-red-900/30 hover:bg-red-900/60 text-red-400 font-meta text-[9px] rounded-lg">✗ Reject</button>
                            </>
                          )}
                          {isHost && (
                            <button type="button" onClick={() => handleDeleteAction(item.id)}
                              className="h-6 px-2 text-neutral-600 hover:text-red-400 hover:bg-red-950/30 font-meta text-[9px] rounded-lg ml-auto">Delete</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Bottom Control Bar: Dual Layout (Mobile 5-Action Dock + Desktop Expanded Bar) */}
      
      {/* MOBILE CONTROL DOCK (< md screens) */}
      <div className="flex md:hidden h-20 px-2.5 border-t border-neutral-800/90 bg-neutral-950/95 backdrop-blur-xl items-center justify-between gap-1.5 shrink-0 z-40 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] w-full">
        {/* 1. Microphone Toggle */}
        <button
          type="button"
          onClick={handleToggleMic}
          className={`flex-1 h-14 rounded-2xl flex flex-col items-center justify-center gap-1 text-xs font-bold transition-all active:scale-95 shadow-sm border ${
            isMicMuted
              ? "bg-red-500/15 text-red-400 border-red-500/40"
              : "bg-neutral-900/90 text-neutral-100 border-neutral-800 hover:bg-neutral-800 hover:border-neutral-700"
          }`}
          title={isMicMuted ? "Unmute Mic" : "Mute Mic"}
          aria-label={isMicMuted ? "Unmute Microphone" : "Mute Microphone"}
        >
          {isMicMuted ? <MicOff className="w-4 h-4" strokeWidth={2} /> : <Mic className="w-4 h-4" strokeWidth={2} />}
          <span className="font-meta text-[8px] uppercase tracking-wider font-bold leading-none whitespace-nowrap">
            {isMicMuted ? "Unmute" : "Mute"}
          </span>
        </button>

        {/* 2. Camera Toggle */}
        <button
          type="button"
          onClick={handleToggleVideo}
          className={`flex-1 h-14 rounded-2xl flex flex-col items-center justify-center gap-1 text-xs font-bold transition-all active:scale-95 shadow-sm border ${
            isVideoOff
              ? "bg-red-500/15 text-red-400 border-red-500/40"
              : "bg-neutral-900/90 text-neutral-100 border-neutral-800 hover:bg-neutral-800 hover:border-neutral-700"
          }`}
          title={isVideoOff ? "Start Video" : "Stop Video"}
          aria-label={isVideoOff ? "Start Camera" : "Stop Camera"}
        >
          {isVideoOff ? <VideoOff className="w-4 h-4" strokeWidth={2} /> : <Video className="w-4 h-4" strokeWidth={2} />}
          <span className="font-meta text-[8px] uppercase tracking-wider font-bold leading-none whitespace-nowrap">
            {isVideoOff ? "Start" : "Stop"}
          </span>
        </button>

        {/* 3. Share App / Screen / Proof (Emerald Hero Action) */}
        <button
          type="button"
          onClick={() => {
            if (isScreenSharing) {
              handleStartScreenShare(false);
            } else {
              setShowScreenShareMenu(true);
            }
          }}
          className={`flex-1 h-14 rounded-2xl flex flex-col items-center justify-center gap-1 text-xs font-bold transition-all active:scale-95 shadow-sm border ${
            isScreenSharing
              ? "bg-emerald-500/20 text-emerald-300 border-emerald-400/70"
              : "bg-emerald-600 hover:bg-emerald-500 border-emerald-500/80 text-white"
          }`}
          title={isScreenSharing ? "Stop Sharing" : "Share Application, Screen or Design"}
          aria-label={isScreenSharing ? "Stop Sharing" : "Share Application or Screen"}
        >
          {isScreenSharing ? <MonitorOff className="w-4 h-4" strokeWidth={2.1} /> : <MonitorUp className="w-4 h-4" strokeWidth={2.1} />}
          <span className="font-meta text-[8px] uppercase tracking-wider font-bold leading-none whitespace-nowrap">
            {isScreenSharing ? "Stop" : "Share"}
          </span>
        </button>

        {/* 4. In-Call Public Chat */}
        <button
          type="button"
          onClick={() => {
            const next = activeDrawer === "chat" ? "none" : "chat";
            setActiveDrawer(next);
            if (next === "chat") setUnreadChatCount(0);
          }}
          className={`relative flex-1 h-14 rounded-2xl flex flex-col items-center justify-center gap-1 text-xs font-bold transition-all active:scale-95 shadow-sm border ${
            activeDrawer === "chat"
              ? "bg-[var(--dept)] text-black border-[var(--dept)] font-extrabold"
              : "bg-neutral-900/90 text-neutral-100 border-neutral-800 hover:bg-neutral-800 hover:border-neutral-700"
          }`}
          title="Toggle In-Meeting Chat"
          aria-label="Toggle Chat"
        >
          {unreadChatCount > 0 && activeDrawer !== "chat" && (
            <span className="absolute -top-1.5 -right-1 bg-red-500 text-white text-[9px] font-bold h-4 min-w-[16px] px-1 rounded-full flex items-center justify-center animate-bounce shadow-md">
              {unreadChatCount}
            </span>
          )}
          <MessageSquare className="w-4 h-4" strokeWidth={2} />
          <span className="font-meta text-[8px] uppercase tracking-wider font-bold leading-none whitespace-nowrap">Chat</span>
        </button>

        {/* 5. More Actions Sheet Trigger */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowMobileActionsSheet(true);
          }}
          className={`relative flex-1 h-14 rounded-2xl flex flex-col items-center justify-center gap-1 text-xs font-bold transition-all active:scale-95 shadow-sm border ${
            showMobileActionsSheet || isHandRaised || (activeDrawer !== "none" && activeDrawer !== "chat")
              ? "bg-cyan-500/20 text-cyan-300 border-cyan-400/60"
              : "bg-neutral-900/90 text-neutral-100 border-neutral-800 hover:bg-neutral-800 hover:border-neutral-700"
          }`}
          title="More Meeting Actions"
          aria-label="Open More Actions"
        >
          {isHandRaised && (
            <span className="absolute -top-1.5 -right-1 bg-amber-400 text-black text-[9px] font-extrabold h-4 w-4 rounded-full flex items-center justify-center animate-bounce shadow-md">
              ✋
            </span>
          )}
          {isHost && waitingParticipants.length > 0 && !isHandRaised && (
            <span className="absolute -top-1.5 -right-1 bg-amber-400 text-black text-[9px] font-extrabold h-4 min-w-[16px] px-1 rounded-full flex items-center justify-center animate-bounce shadow-md">
              {waitingParticipants.length}
            </span>
          )}
          <MoreHorizontal className="w-4 h-4" strokeWidth={2.2} />
          <span className="font-meta text-[8px] uppercase tracking-wider font-bold leading-none whitespace-nowrap">More</span>
        </button>

        {/* 6. End / Leave Call */}
        {isHost ? (
          <button
            type="button"
            onClick={handleEndForAll}
            className="flex-1 h-14 rounded-2xl bg-red-600 hover:bg-red-500 active:scale-95 text-white font-display text-[9px] font-bold uppercase flex flex-col items-center justify-center gap-1 shadow-lg transition-all border border-red-400/40"
            title="End Meeting for All"
            aria-label="End Meeting"
          >
            <PhoneOff className="w-4 h-4" strokeWidth={2.2} />
            <span className="font-meta text-[8px] uppercase tracking-wider font-bold leading-none whitespace-nowrap">End</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleLeaveMeeting}
            className="flex-1 h-14 rounded-2xl bg-red-600/90 hover:bg-red-500 active:scale-95 text-white font-display text-[9px] font-bold uppercase flex flex-col items-center justify-center gap-1 shadow-lg transition-all border border-red-400/40"
            title="Leave Meeting"
            aria-label="Leave Meeting"
          >
            <LogOut className="w-4 h-4" strokeWidth={2.2} />
            <span className="font-meta text-[8px] uppercase tracking-wider font-bold leading-none whitespace-nowrap">Leave</span>
          </button>
        )}
      </div>

      {/* DESKTOP EXPANDED CONTROL BAR (>= md screens) */}
      <div className="hidden md:flex relative z-40 h-20 px-6 border-t border-neutral-800/90 bg-neutral-950/95 backdrop-blur-xl items-center justify-between shrink-0 gap-4">
        {/* Left: Mic & Camera split buttons with device-picker caret */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div
            className={`flex items-stretch h-12 rounded-xl border overflow-hidden transition-all shadow-sm ${
              isMicMuted
                ? "bg-red-500/15 border-red-500/40 text-red-400"
                : "bg-neutral-900/90 border-neutral-800 text-neutral-100 hover:border-neutral-700"
            }`}
          >
            <button
              type="button"
              onClick={handleToggleMic}
              className={`flex flex-col items-center justify-center gap-1 px-3.5 min-w-[60px] h-full transition-colors ${
                isMicMuted ? "hover:bg-red-500/20" : "hover:bg-neutral-800/80"
              }`}
              title={isMicMuted ? "Unmute Mic (M)" : "Mute Mic (M)"}
              aria-label={isMicMuted ? "Unmute Microphone" : "Mute Microphone"}
            >
              {isMicMuted ? <MicOff className="w-4 h-4 shrink-0" strokeWidth={2} /> : <Mic className="w-4 h-4 shrink-0" strokeWidth={2} />}
              <span className="font-meta text-[8.5px] uppercase tracking-wider font-bold leading-none whitespace-nowrap">
                {isMicMuted ? "Unmute" : "Mute"}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setShowDeviceSettingsModal(true)}
              className={`flex items-center justify-center w-6 h-full border-l transition-colors ${
                isMicMuted
                  ? "border-l-red-500/30 hover:bg-red-500/25 text-red-300"
                  : "border-l-neutral-800 hover:bg-neutral-800 text-neutral-400 hover:text-white"
              }`}
              title="Select microphone & speaker"
              aria-label="Audio device settings"
            >
              <ChevronUp className="w-3.5 h-3.5" strokeWidth={2.2} />
            </button>
          </div>

          <div
            className={`flex items-stretch h-12 rounded-xl border overflow-hidden transition-all shadow-sm ${
              isVideoOff
                ? "bg-red-500/15 border-red-500/40 text-red-400"
                : "bg-neutral-900/90 border-neutral-800 text-neutral-100 hover:border-neutral-700"
            }`}
          >
            <button
              type="button"
              onClick={handleToggleVideo}
              className={`flex flex-col items-center justify-center gap-1 px-3.5 min-w-[60px] h-full transition-colors ${
                isVideoOff ? "hover:bg-red-500/20" : "hover:bg-neutral-800/80"
              }`}
              title={isVideoOff ? "Start Video (V)" : "Stop Video (V)"}
              aria-label={isVideoOff ? "Start Camera" : "Stop Camera"}
            >
              {isVideoOff ? <VideoOff className="w-4 h-4 shrink-0" strokeWidth={2} /> : <Video className="w-4 h-4 shrink-0" strokeWidth={2} />}
              <span className="font-meta text-[8.5px] uppercase tracking-wider font-bold leading-none whitespace-nowrap">
                {isVideoOff ? "Start" : "Stop"}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setShowDeviceSettingsModal(true)}
              className={`flex items-center justify-center w-6 h-full border-l transition-colors ${
                isVideoOff
                  ? "border-l-red-500/30 hover:bg-red-500/25 text-red-300"
                  : "border-l-neutral-800 hover:bg-neutral-800 text-neutral-400 hover:text-white"
              }`}
              title="Select camera"
              aria-label="Camera settings"
            >
              <ChevronUp className="w-3.5 h-3.5" strokeWidth={2.2} />
            </button>
          </div>
        </div>

        {/* Center: Unified h-12 Dock (People, Chat, Share, Co-Design, Reactions, Hand, More)
            Scrolls horizontally instead of overflowing on narrow windows; the
            PRD module buttons (Breakouts/Queue/Agenda/Actions) collapse into
            the More menu below xl — same as Zoom's responsive toolbar. */}
        <div className="flex items-center gap-2 min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {/* People / Participants */}
          <button
            type="button"
            onClick={() => setActiveDrawer(activeDrawer === "participants" ? "none" : "participants")}
            className={`relative flex flex-col items-center justify-center gap-1 h-12 px-3.5 min-w-[68px] rounded-xl border transition-all shrink-0 shadow-sm active:scale-95 ${
              activeDrawer === "participants"
                ? "bg-[var(--dept)] text-black border-[var(--dept)] font-extrabold"
                : "bg-neutral-900/90 border-neutral-800 text-neutral-100 hover:bg-neutral-800 hover:border-neutral-700"
            }`}
            title="Participants panel"
            aria-label={`Participants, ${activeParticipants.length} in meeting`}
          >
            {isHost && waitingParticipants.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-amber-400 text-black text-[9px] font-extrabold h-4 min-w-[16px] px-1 rounded-full flex items-center justify-center animate-bounce shadow-md">
                {waitingParticipants.length}
              </span>
            )}
            <div className="flex items-center gap-1">
              <Users className="w-4 h-4 shrink-0" strokeWidth={2} />
              <span
                className={`font-meta text-[9px] font-extrabold px-1.5 py-0.5 rounded-full leading-none ${
                  activeDrawer === "participants"
                    ? "bg-black/20 text-black"
                    : "bg-neutral-800 text-neutral-300 border border-neutral-700/80"
                }`}
              >
                {activeParticipants.length}
              </span>
            </div>
            <span className="font-meta text-[8.5px] uppercase tracking-wider font-bold leading-none whitespace-nowrap">
              People
            </span>
          </button>

          {/* Chat */}
          <button
            type="button"
            onClick={() => {
              const next = activeDrawer === "chat" ? "none" : "chat";
              setActiveDrawer(next);
              if (next === "chat") setUnreadChatCount(0);
            }}
            className={`relative flex flex-col items-center justify-center gap-1 h-12 px-3.5 min-w-[64px] rounded-xl border transition-all shrink-0 shadow-sm active:scale-95 ${
              activeDrawer === "chat"
                ? "bg-[var(--dept)] text-black border-[var(--dept)] font-extrabold"
                : "bg-neutral-900/90 border-neutral-800 text-neutral-100 hover:bg-neutral-800 hover:border-neutral-700"
            }`}
            title="In-meeting chat"
            aria-label="Toggle chat"
          >
            {unreadChatCount > 0 && activeDrawer !== "chat" && (
              <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold h-4 min-w-[16px] px-1 rounded-full flex items-center justify-center animate-bounce shadow-md">
                {unreadChatCount}
              </span>
            )}
            <MessageSquare className="w-4 h-4 shrink-0" strokeWidth={2} />
            <span className="font-meta text-[8.5px] uppercase tracking-wider font-bold leading-none whitespace-nowrap">
              Chat
            </span>
          </button>

          {/* Share Screen — Emerald Hero Action */}
          <button
            type="button"
            onClick={() => {
              if (isScreenSharing) {
                handleStartScreenShare(false);
              } else {
                setShowScreenShareMenu(true);
              }
            }}
            className={`flex flex-col items-center justify-center gap-1 h-12 px-4 min-w-[72px] rounded-xl border transition-all shrink-0 shadow-sm active:scale-95 ${
              isScreenSharing
                ? "bg-emerald-500/20 text-emerald-300 border-emerald-400/70"
                : "bg-emerald-600 hover:bg-emerald-500 border-emerald-500/80 text-white"
            }`}
            title={isScreenSharing ? "Stop sharing your screen" : "Share your screen or a window"}
            aria-label={isScreenSharing ? "Stop screen share" : "Share screen"}
          >
            {isScreenSharing ? <MonitorOff className="w-4 h-4 shrink-0" strokeWidth={2} /> : <MonitorUp className="w-4 h-4 shrink-0" strokeWidth={2} />}
            <span className="font-meta text-[8.5px] uppercase tracking-wider font-bold leading-none whitespace-nowrap">
              {isScreenSharing ? "Stop Share" : "Share"}
            </span>
          </button>

          {/* Dedicated Studio Co-Design Button */}
          <button
            type="button"
            onClick={() => setShowStudioCoDesignModal(true)}
            className={`flex flex-col items-center justify-center gap-1 h-12 px-3.5 min-w-[78px] rounded-xl border transition-all shrink-0 shadow-sm active:scale-95 ${
              isStudioBroadcasting
                ? "bg-purple-500/25 text-purple-200 border-purple-400 animate-pulse"
                : "bg-purple-950/50 hover:bg-purple-900/60 border-purple-500/40 text-purple-200 hover:text-white hover:border-purple-400/70"
            }`}
            title="Launch Live Studio Co-Design & Broadcast"
            aria-label="Launch co-design session"
          >
            <Palette className="w-4 h-4 shrink-0 text-purple-300" strokeWidth={2} />
            <span className="font-meta text-[8.5px] uppercase tracking-wider font-bold leading-none whitespace-nowrap">
              Co-Design
            </span>
          </button>

          {/* Dedicated Breakout Rooms Button (collapses into More below xl) */}
          <button
            type="button"
            onClick={() => setActiveDrawer(activeDrawer === "breakouts" ? "none" : "breakouts")}
            className={`relative hidden xl:flex flex-col items-center justify-center gap-1 h-12 px-3.5 min-w-[74px] rounded-xl border transition-all shrink-0 shadow-sm active:scale-95 ${
              activeDrawer === "breakouts"
                ? "bg-[var(--dept)] text-black border-[var(--dept)] font-extrabold"
                : myActiveBreakoutRoom
                ? "bg-purple-600/25 text-purple-200 border-purple-400/70"
                : "bg-neutral-900/90 border-neutral-800 text-neutral-100 hover:bg-neutral-800 hover:border-neutral-700"
            }`}
            title="Breakout Rooms — create, assign, and join breakout sessions"
            aria-label="Breakout Rooms"
          >
            {isHost && breakoutHelpRequests.length > 0 ? (
              <span className="absolute -top-1.5 -right-1.5 bg-amber-400 text-black text-[9px] font-extrabold h-4 min-w-[16px] px-1 rounded-full flex items-center justify-center animate-bounce shadow-md">
                🆘
              </span>
            ) : openBreakoutRooms.length > 0 ? (
              <span className="absolute -top-1.5 -right-1.5 bg-purple-500 text-white text-[9px] font-extrabold h-4 min-w-[16px] px-1 rounded-full flex items-center justify-center shadow-md">
                {openBreakoutRooms.length}
              </span>
            ) : null}
            <GitBranch className="w-4 h-4 shrink-0" strokeWidth={2} />
            <span className="font-meta text-[8.5px] uppercase tracking-wider font-bold leading-none whitespace-nowrap">
              {myActiveBreakoutRoom ? "In Room" : "Breakouts"}
            </span>
          </button>

          {/* PRD Module 1 — Speaker Queue Button (collapses into More below xl) */}
          <button
            type="button"
            onClick={() => setActiveDrawer(activeDrawer === "queue" ? "none" : "queue")}
            className={`relative hidden xl:flex flex-col items-center justify-center gap-1 h-12 px-3.5 min-w-[62px] rounded-xl border transition-all shrink-0 shadow-sm active:scale-95 ${
              activeDrawer === "queue"
                ? "bg-[var(--dept)] text-black border-[var(--dept)] font-extrabold"
                : "bg-neutral-900/90 border-neutral-800 text-neutral-100 hover:bg-neutral-800 hover:border-neutral-700"
            }`}
            title="Speaker Queue"
            aria-label="Speaker Queue"
          >
            {(meeting?.speakerQueue ?? []).filter((e) => e.status === "waiting").length > 0 && activeDrawer !== "queue" && (
              <span className="absolute -top-1.5 -right-1.5 bg-amber-400 text-black text-[9px] font-extrabold h-4 min-w-[16px] px-1 rounded-full flex items-center justify-center shadow-md">
                {(meeting?.speakerQueue ?? []).filter((e) => e.status === "waiting").length}
              </span>
            )}
            <span className="text-sm leading-none">✋</span>
            <span className="font-meta text-[8.5px] uppercase tracking-wider font-bold leading-none whitespace-nowrap">Queue</span>
          </button>

          {/* PRD Module 2 — Agenda & Timer Button (collapses into More below xl) */}
          <button
            type="button"
            onClick={() => setActiveDrawer(activeDrawer === "agenda" ? "none" : "agenda")}
            className={`relative hidden xl:flex flex-col items-center justify-center gap-1 h-12 px-3.5 min-w-[62px] rounded-xl border transition-all shrink-0 shadow-sm active:scale-95 ${
              activeDrawer === "agenda"
                ? "bg-[var(--dept)] text-black border-[var(--dept)] font-extrabold"
                : (meeting?.agendaItems ?? []).some((it) => it.status === "active")
                ? "bg-emerald-950/40 text-emerald-300 border-emerald-500/40 animate-pulse"
                : "bg-neutral-900/90 border-neutral-800 text-neutral-100 hover:bg-neutral-800 hover:border-neutral-700"
            }`}
            title="Agenda & Focus Timer"
            aria-label="Agenda and Focus Timer"
          >
            <span className="text-sm leading-none">⏱</span>
            <span className="font-meta text-[8.5px] uppercase tracking-wider font-bold leading-none whitespace-nowrap">Agenda</span>
          </button>

          {/* PRD Module 4 — Action Board Button (collapses into More below xl) */}
          <button
            type="button"
            onClick={() => setActiveDrawer(activeDrawer === "actions" ? "none" : "actions")}
            className={`relative hidden xl:flex flex-col items-center justify-center gap-1 h-12 px-3.5 min-w-[62px] rounded-xl border transition-all shrink-0 shadow-sm active:scale-95 ${
              activeDrawer === "actions"
                ? "bg-[var(--dept)] text-black border-[var(--dept)] font-extrabold"
                : (meeting?.liveActionItems ?? []).some((a) => a.approvalStatus === "suggested" && isHost)
                ? "bg-amber-950/40 text-amber-300 border-amber-500/40"
                : "bg-neutral-900/90 border-neutral-800 text-neutral-100 hover:bg-neutral-800 hover:border-neutral-700"
            }`}
            title="Live Action Board"
            aria-label="Live Action Board"
          >
            {(meeting?.liveActionItems ?? []).filter((a) => a.approvalStatus === "suggested").length > 0 && isHost && activeDrawer !== "actions" && (
              <span className="absolute -top-1.5 -right-1.5 bg-amber-400 text-black text-[9px] font-extrabold h-4 min-w-[16px] px-1 rounded-full flex items-center justify-center shadow-md">
                {(meeting?.liveActionItems ?? []).filter((a) => a.approvalStatus === "suggested").length}
              </span>
            )}
            <span className="text-sm leading-none">✅</span>
            <span className="font-meta text-[8.5px] uppercase tracking-wider font-bold leading-none whitespace-nowrap">Actions</span>
          </button>

          {/* Reaction Triggers — matched h-12 container */}
          <div
            className="hidden lg:flex items-center gap-0.5 h-12 px-2 bg-neutral-900/90 rounded-xl border border-neutral-800 shadow-sm"
            role="group"
            aria-label="Send a reaction"
          >
            <button type="button" onClick={() => handleSendReaction("thumbs_up")} className="w-8 h-8 rounded-lg hover:bg-neutral-800 active:scale-110 flex items-center justify-center text-sm transition-all" title="Thumbs Up">👍</button>
            <button type="button" onClick={() => handleSendReaction("heart")} className="w-8 h-8 rounded-lg hover:bg-neutral-800 active:scale-110 flex items-center justify-center text-sm transition-all" title="Heart">❤️</button>
            <button type="button" onClick={() => handleSendReaction("clap")} className="w-8 h-8 rounded-lg hover:bg-neutral-800 active:scale-110 flex items-center justify-center text-sm transition-all" title="Clap">👏</button>
            <button type="button" onClick={() => handleSendReaction("celebrate")} className="w-8 h-8 rounded-lg hover:bg-neutral-800 active:scale-110 flex items-center justify-center text-sm transition-all" title="Celebrate">🎉</button>
            <button type="button" onClick={() => handleSendReaction("laugh")} className="w-8 h-8 rounded-lg hover:bg-neutral-800 active:scale-110 flex items-center justify-center text-sm transition-all" title="Laugh">😂</button>
          </div>

          {/* Raise Hand */}
          <button
            type="button"
            onClick={handleToggleRaiseHand}
            className={`flex flex-col items-center justify-center gap-1 h-12 px-3.5 min-w-[60px] rounded-xl border transition-all shrink-0 shadow-sm active:scale-95 ${
              isHandRaised
                ? "bg-amber-500/20 text-amber-300 border-amber-400 animate-pulse"
                : "bg-neutral-900/90 border-neutral-800 text-neutral-100 hover:bg-neutral-800 hover:border-neutral-700"
            }`}
            title="Raise / Lower Hand (H)"
            aria-label={isHandRaised ? "Lower hand" : "Raise hand"}
          >
            <Hand className="w-4 h-4 shrink-0" strokeWidth={2} />
            <span className="font-meta text-[8.5px] uppercase tracking-wider font-bold leading-none whitespace-nowrap">
              {isHandRaised ? "Lower" : "Hand"}
            </span>
          </button>

          {/* More ⋯ — secondary tools trigger */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowMoreMenu((v) => !v);
            }}
            className={`flex flex-col items-center justify-center gap-1 h-12 px-3.5 min-w-[60px] rounded-xl border transition-all shrink-0 shadow-sm active:scale-95 ${
              showMoreMenu
                ? "bg-[var(--dept)] text-black border-[var(--dept)] font-extrabold shadow-md"
                : "bg-neutral-900/90 border-neutral-800 text-neutral-100 hover:bg-neutral-800 hover:border-neutral-700"
            }`}
            title="More meeting actions"
            aria-label="More meeting actions"
            aria-haspopup="menu"
            aria-expanded={showMoreMenu}
          >
            <MoreHorizontal className="w-4 h-4 shrink-0" strokeWidth={2.2} />
            <span className="font-meta text-[8.5px] uppercase tracking-wider font-bold leading-none whitespace-nowrap">
              More
            </span>
          </button>
        </div>

        {/* Right: Leave / End Call (Matched h-12 height & icon-label hierarchy) */}
        <div className="flex items-center gap-2 shrink-0">
          {isHost ? (
            <>
              <button
                type="button"
                onClick={handleLeaveMeeting}
                className="flex flex-col items-center justify-center gap-1 h-12 px-3.5 min-w-[60px] bg-neutral-900/90 hover:bg-neutral-800 border border-neutral-800 hover:border-neutral-700 text-neutral-200 hover:text-white rounded-xl transition-all shadow-sm active:scale-95"
                title="Leave without ending the meeting for others"
              >
                <LogOut className="w-4 h-4 shrink-0" strokeWidth={2} />
                <span className="font-meta text-[8.5px] uppercase tracking-wider font-bold leading-none whitespace-nowrap">
                  Leave
                </span>
              </button>
              <button
                type="button"
                onClick={handleEndForAll}
                className="flex flex-col items-center justify-center gap-1 h-12 px-4 min-w-[68px] bg-red-600 hover:bg-red-500 border border-red-500 text-white rounded-xl transition-all shadow-sm active:scale-95"
                title="End meeting for everyone (asks for confirmation)"
              >
                <PhoneOff className="w-4 h-4 shrink-0" strokeWidth={2.2} />
                <span className="font-meta text-[8.5px] uppercase tracking-wider font-bold leading-none whitespace-nowrap">
                  End Call
                </span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleLeaveMeeting}
              className="flex flex-col items-center justify-center gap-1 h-12 px-4 min-w-[68px] bg-red-600 hover:bg-red-500 border border-red-500 text-white rounded-xl transition-all shadow-sm active:scale-95"
              title="Leave meeting"
            >
              <LogOut className="w-4 h-4 shrink-0" strokeWidth={2.2} />
              <span className="font-meta text-[8.5px] uppercase tracking-wider font-bold leading-none whitespace-nowrap">
                Leave
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Fullscreen / Theater Mode Maximized Proofing Modal */}
      {isProofingMaximized && (
        <div className="fixed inset-0 z-[120] bg-black/95 backdrop-blur-md flex flex-col p-2 sm:p-4 animate-in zoom-in-95 duration-200 select-none">
          {/* Top Theater Header Bar */}
          <div className="flex flex-wrap items-center justify-between pb-3 border-b border-neutral-800 shrink-0 gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 text-sm font-bold shrink-0">
                🎨
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-display text-sm font-bold uppercase text-white truncate max-w-xs sm:max-w-md">
                    {activeMockup.title}
                  </h3>
                  {meeting?.liveProofing?.approvedDeliverables?.some((a) => a.mockupId === activeMockup.id && a.approved) ? (
                    <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-meta text-[8px] px-2 py-0.5 rounded-full font-bold uppercase shrink-0">
                      ✓ Concept Approved
                    </span>
                  ) : (
                    <span className="font-meta text-[8px] px-2 py-0.5 rounded-full bg-[var(--dept)] text-black font-extrabold uppercase shrink-0">
                      Deliverable {proofingIndex + 1}/{proofingMockups.length}
                    </span>
                  )}
                </div>
                <p className="font-meta text-[9px] text-neutral-400">
                  {activeMockup.category} {activeMockup.uploadedBy ? `· by ${activeMockup.uploadedBy}` : ""} · Right-click canvas for tools &amp; safe zones
                </p>
              </div>
            </div>

            {/* Actions, Navigation, Fullscreen & Zoom */}
            <div className="flex items-center gap-2">
              {isHost && (
                <button
                  type="button"
                  onClick={() => handleStartStudioCoDesign()}
                  className="font-meta text-[10px] px-2.5 py-1.5 bg-purple-950/70 hover:bg-purple-900 text-purple-300 border border-purple-500/30 rounded-lg font-bold flex items-center gap-1 shadow-sm shrink-0"
                  title="Open in KON10 Studio and broadcast live to client"
                >
                  <span>✏️</span> Live Co-Design
                </button>
              )}

              {isHost && (
                <button
                  type="button"
                  onClick={() => setShowUploadModal(true)}
                  className="font-meta text-[10px] px-3 py-1.5 bg-[var(--dept)] text-black rounded-lg font-bold hover:brightness-110 flex items-center gap-1.5 shadow-sm shrink-0"
                >
                  <span>📁</span> + Upload
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowApprovedArchiveModal(true)}
                className="px-2.5 py-1.5 rounded-lg bg-cyan-950/70 hover:bg-cyan-900 text-cyan-300 border border-cyan-500/30 text-xs font-bold flex items-center gap-1 shadow-sm"
                title="View Approved Deliverables & Preserved Pins"
              >
                <span>📜</span>
                <span className="hidden sm:inline">Sign-Offs</span>
              </button>

              <button
                type="button"
                onClick={() => setCompareMode(true)}
                className="px-2.5 py-1.5 rounded-lg bg-purple-950/70 hover:bg-purple-900 text-purple-300 border border-purple-500/30 text-xs font-bold flex items-center gap-1 shadow-sm"
                title="A/B Split Version Comparison"
              >
                <span>↔️</span>
                <span className="hidden sm:inline">A/B Diff</span>
              </button>

              <div className="flex items-center bg-neutral-800 rounded-lg p-0.5 border border-neutral-700">
                <button
                  type="button"
                  onClick={() => setProofZoom((z) => Math.max(0.75, z - 0.25))}
                  className="px-2 py-1 text-xs hover:bg-neutral-700 rounded text-white"
                >
                  -
                </button>
                <span className="font-mono text-[10px] px-1.5 text-neutral-300">{Math.round(proofZoom * 100)}%</span>
                <button
                  type="button"
                  onClick={() => setProofZoom((z) => Math.min(3, z + 0.25))}
                  className="px-2 py-1 text-xs hover:bg-neutral-700 rounded text-white"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => setProofZoom(1)}
                  className="font-meta text-[9px] px-2 py-1 border-l border-neutral-700 text-neutral-400 hover:text-white"
                >
                  Reset
                </button>
              </div>

              <button
                type="button"
                onClick={handleToggleFullscreen}
                className="px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold flex items-center gap-1"
                title={isFullscreen ? "Exit Fullscreen (Esc)" : "Enter True Fullscreen"}
              >
                <span>{isFullscreen ? "🗗" : "⛶"}</span>
                <span className="hidden lg:inline text-[9px] font-meta uppercase">{isFullscreen ? "Exit FS" : "Fullscreen"}</span>
              </button>

              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => handleSelectProof(proofingIndex - 1)}
                  disabled={proofingIndex === 0}
                  className="px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 text-xs font-bold"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectProof(proofingIndex + 1)}
                  disabled={proofingIndex === proofingMockups.length - 1}
                  className="px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 text-xs font-bold"
                >
                  →
                </button>
              </div>

              <button
                type="button"
                onClick={() => setIsProofingMaximized(false)}
                className="w-8 h-8 rounded-full bg-neutral-800 hover:bg-neutral-700 text-white flex items-center justify-center font-bold text-sm ml-1"
                title="Close Theater Mode"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Large High-Res Interactive Canvas with Markup SVG Layer & Right-Click */}
          <div className="flex-1 flex items-center justify-center overflow-auto p-2 sm:p-4 relative">
            <div
              onContextMenu={handleCanvasContextMenu}
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={handleCanvasPointerUp}
              onPointerCancel={handleCanvasPointerUp}
              className={`relative max-h-full max-w-full rounded-2xl overflow-hidden shadow-2xl border border-neutral-800 transition-all duration-200 select-none touch-none ${
                canvasBackdrop === "black"
                  ? "bg-black"
                  : canvasBackdrop === "white"
                  ? "bg-white text-black"
                  : canvasBackdrop === "grid"
                  ? "bg-neutral-900 bg-[radial-gradient(#475569_1.5px,transparent_1.5px)] [background-size:20px_20px]"
                  : canvasBackdrop === "checker"
                  ? "bg-neutral-900 bg-[repeating-conic-gradient(#1e293b_0%_25%,#0f172a_0%_50%)] [background-size:24px_24px]"
                  : "bg-slate-950"
              } ${
                activeProofTool === "laser"
                  ? "cursor-crosshair"
                  : activeProofTool === "pin"
                  ? "cursor-pointer"
                  : "cursor-crosshair"
              }`}
              style={{ transform: `scale(${proofZoom})` }}
            >
              <img
                src={activeMockup.image}
                alt={activeMockup.title}
                className="max-h-[68vh] w-auto object-contain rounded-2xl pointer-events-none"
              />

              {/* SVG Vector Drawing Layer */}
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none z-10">
                {mockupStrokes.map((stroke) => renderCanvasStroke(stroke))}
                {renderActiveStrokePreview()}
                {vanishingStrokes.map((stroke) => renderCanvasStroke(stroke))}
              </svg>

              {/* Safe Zone Overlays (Instagram, TikTok, Facebook, YouTube, LinkedIn, Print) */}
              {renderSafeZoneOverlay(safeZoneOverlay)}

              {/* Numbered Pins with Hover Message Preview */}
              {mockupPins.map((pin) => {
                const isNearBottom = pin.y > 60;
                const isNearRight = pin.x > 65;
                const isNearLeft = pin.x < 35;
                return (
                  <div
                    key={pin.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedPinDetail(pin);
                    }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 z-20 cursor-pointer group"
                    style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
                  >
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[10px] shadow-lg border-2 border-white transition-transform group-hover:scale-125 ${
                        pin.resolved
                          ? "bg-emerald-500 text-white ring-2 ring-emerald-300"
                          : "bg-[var(--dept)] text-black ring-2 ring-cyan-300"
                      }`}
                    >
                      {pin.number}
                    </div>

                    {/* Hover Floating Message Preview Tooltip */}
                    <div
                      className={`absolute opacity-0 group-hover:opacity-100 transition-all duration-150 pointer-events-none group-hover:pointer-events-auto z-40 w-56 sm:w-64 bg-neutral-900/95 backdrop-blur-md border border-neutral-700/90 rounded-xl p-2.5 shadow-2xl text-white select-none ${
                        isNearBottom ? "bottom-full mb-2" : "top-full mt-2"
                      } ${
                        isNearRight ? "right-0" : isNearLeft ? "left-0" : "left-1/2 -translate-x-1/2"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5 pb-1 border-b border-neutral-800">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className={`w-4 h-4 rounded-full font-bold text-[8px] flex items-center justify-center shrink-0 ${
                              pin.resolved ? "bg-emerald-500 text-white" : "bg-[var(--dept)] text-black"
                            }`}
                          >
                            {pin.number}
                          </span>
                          <span className="font-bold text-[9px] text-white truncate">
                            {pin.senderName || "Client"}
                          </span>
                        </div>
                        <span
                          className={`font-meta text-[7.5px] px-1.5 py-0.2 rounded font-bold uppercase shrink-0 ${
                            pin.resolved
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                            : "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                          }`}
                        >
                          {pin.resolved ? "Resolved" : "Active"}
                        </span>
                      </div>

                      <p className="text-[10px] text-neutral-200 mt-1.5 line-clamp-3 leading-relaxed font-normal">
                        {pin.text}
                      </p>

                      <div className="mt-1.5 pt-1 border-t border-neutral-800 flex items-center justify-between text-[7.5px] font-meta text-neutral-400">
                        <span>{new Date(pin.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                        <span className="text-[var(--dept)] font-bold">Tap to view / resolve →</span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Glowing Laser Pointer Indicator */}
              {laserPointer.active && (
                <div
                  className="absolute -ml-4 -mt-4 pointer-events-none z-30 transition-all duration-75"
                  style={{ left: `${laserPointer.x}%`, top: `${laserPointer.y}%` }}
                >
                  <div className="relative">
                    <div className="w-8 h-8 rounded-full bg-red-500/40 animate-ping absolute -inset-0.5" />
                    <div className="w-7 h-7 rounded-full bg-red-500 border-2 border-white shadow-[0_0_20px_red] flex items-center justify-center text-[8px] text-white font-bold" />
                    {laserPointer.senderName && (
                      <span className="absolute left-8 top-1 whitespace-nowrap bg-black/90 text-white font-meta text-[9px] px-2 py-0.5 rounded-full border border-neutral-700 shadow-lg">
                        🔴 {laserPointer.senderName}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Right Click Tip */}
              <div className="absolute bottom-2 right-2 bg-black/80 backdrop-blur-sm px-2 py-0.5 rounded text-[8px] text-neutral-300 flex items-center gap-1 pointer-events-none z-20">
                <span>⚡</span> Right-click for tool palette
              </div>
            </div>
          </div>

          {/* Bottom Feedback Action Bar & Thumbnail Selector in Theater Mode */}
          <div className="pt-2 border-t border-neutral-800 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
            {/* Thumbnail Row in Theater Mode */}
            <div className="flex items-center gap-1.5 overflow-x-auto max-w-full sm:max-w-md no-scrollbar py-0.5">
              {proofingMockups.map((m, idx) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleSelectProof(idx)}
                  className={`w-12 h-8 rounded-lg overflow-hidden border-2 transition-all shrink-0 ${
                    idx === proofingIndex ? "border-[var(--dept)] scale-105" : "border-neutral-700 opacity-60 hover:opacity-100"
                  }`}
                >
                  <img src={m.image} alt={m.title} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <input
                type="text"
                value={proofFeedbackDraft}
                onChange={(e) => setProofFeedbackDraft(e.target.value)}
                placeholder="Type revision notes..."
                className="bg-neutral-800 border border-neutral-700 px-3 py-1.5 rounded-lg text-[16px] md:text-xs outline-none text-white flex-1 sm:w-64"
              />
              <button
                type="button"
                onClick={() => handleSubmitProofFeedback(true)}
                className="btn btn-dept !py-1.5 !px-4 font-display text-[10px] font-bold uppercase shadow-sm shrink-0"
              >
                ✓ Approve Concept
              </button>
              <button
                type="button"
                onClick={() => handleSubmitProofFeedback(false)}
                className="px-3 py-1.5 rounded-lg border border-neutral-700 bg-neutral-800 text-neutral-300 text-[10px] font-bold uppercase hover:bg-neutral-700 shrink-0"
              >
                Request Edits
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Artwork / Deliverable Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-[130] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-[var(--panel)] border border-[var(--line-strong)] p-6 rounded-2xl shadow-2xl text-[var(--ink)] space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">🎨</span>
                <div>
                  <h3 className="font-display text-sm font-bold uppercase">Upload Artwork to Live Proofing</h3>
                  <p className="font-meta text-[10px] text-[var(--muted)]">Upload design concepts or client deliverables to present live.</p>
                </div>
              </div>
              <button
                onClick={() => setShowUploadModal(false)}
                className="text-[var(--muted)] hover:text-[var(--ink)] text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddArtworkSubmit} className="space-y-4 text-xs">
              {/* Image File Chooser */}
              <div>
                <label className="font-meta text-[9px] uppercase font-bold text-[var(--muted)] block mb-1">
                  Artwork File (PNG, JPG, SVG, WebP)
                </label>
                <input
                  ref={artworkFileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleArtworkFileChange}
                  className="hidden"
                />
                <div
                  onClick={() => artworkFileInputRef.current?.click()}
                  className="border-2 border-dashed border-[var(--line)] hover:border-[var(--dept)] rounded-xl p-4 text-center cursor-pointer transition-colors bg-[var(--bg)]"
                >
                  {uploadImagePreview ? (
                    <div className="relative aspect-video max-h-40 mx-auto rounded-lg overflow-hidden border border-[var(--line)]">
                      <img src={uploadImagePreview} alt="Preview" className="w-full h-full object-contain bg-black" />
                      <span className="absolute bottom-1 right-1 bg-black/80 text-white font-meta text-[8px] px-2 py-0.5 rounded">
                        Tap to change image
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-1 text-center py-2">
                      <span className="text-2xl block">📁</span>
                      <p className="font-bold text-[11px] uppercase dept-accent">Click to choose image file from device</p>
                      <p className="font-meta text-[9px] text-[var(--muted)]">Maximum file size: 8MB</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Or URL */}
              <div>
                <label className="font-meta text-[9px] uppercase font-bold text-[var(--muted)] block mb-1">
                  Or Paste Image Web URL
                </label>
                <input
                  type="url"
                  value={uploadImageUrl}
                  onChange={(e) => {
                    setUploadImageUrl(e.target.value);
                    if (e.target.value) setUploadImagePreview(e.target.value);
                  }}
                  placeholder="https://images.unsplash.com/... or Figma export link"
                  className="w-full bg-[var(--bg)] border border-[var(--line)] px-3 py-2 text-xs rounded-lg outline-none focus:border-[var(--dept)]"
                />
              </div>

              {/* Title & Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-meta text-[9px] uppercase font-bold text-[var(--muted)] block mb-1">
                    Deliverable Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                    placeholder="e.g. Hero Banner 2026 Mockup"
                    className="w-full bg-[var(--bg)] border border-[var(--line)] px-3 py-2 text-xs rounded-lg outline-none focus:border-[var(--dept)]"
                  />
                </div>

                <div>
                  <label className="font-meta text-[9px] uppercase font-bold text-[var(--muted)] block mb-1">
                    Category
                  </label>
                  <select
                    value={uploadCategory}
                    onChange={(e) => setUploadCategory(e.target.value)}
                    className="w-full bg-[var(--bg)] border border-[var(--line)] px-3 py-2 text-xs rounded-lg outline-none focus:border-[var(--dept)]"
                  >
                    <option value="Social Campaign">Social Campaign</option>
                    <option value="Identity & Branding">Identity &amp; Branding</option>
                    <option value="E-Commerce / Ads">E-Commerce / Ads</option>
                    <option value="Web & App UI">Web &amp; App UI</option>
                    <option value="Print / Banner">Print / Banner</option>
                    <option value="Packaging & Merch">Packaging &amp; Merch</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              {/* Design Notes */}
              <div>
                <label className="font-meta text-[9px] uppercase font-bold text-[var(--muted)] block mb-1">
                  Design Notes / Client Focus
                </label>
                <textarea
                  rows={2}
                  value={uploadNotes}
                  onChange={(e) => setUploadNotes(e.target.value)}
                  placeholder="e.g. Focus on color hierarchy, button typography, and contrast."
                  className="w-full bg-[var(--bg)] border border-[var(--line)] px-3 py-2 text-xs rounded-lg outline-none focus:border-[var(--dept)] resize-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={isUploadingArtwork || (!uploadImagePreview && !uploadImageUrl.trim())}
                  className="btn btn-dept flex-1 !py-2.5 font-display text-xs font-bold uppercase tracking-wider disabled:opacity-40 shadow-md"
                >
                  {isUploadingArtwork ? "Uploading..." : "🚀 Add & Present to Client"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2.5 rounded-lg border border-[var(--line)] text-xs text-[var(--muted)] hover:text-[var(--ink)]"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Right-Click Canvas Showcase Context Menu (Appears right under cursor) */}
      {canvasContextMenu?.visible && (
        <div
          style={{ left: `${canvasContextMenu.x}px`, top: `${canvasContextMenu.y}px` }}
          className="fixed z-[150] w-64 bg-neutral-900/95 backdrop-blur-md border border-neutral-700 rounded-2xl shadow-2xl p-2.5 text-xs text-white animate-in zoom-in-95 duration-100 space-y-2 select-none"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between pb-1.5 border-b border-neutral-800 px-1">
            <span className="font-display text-[10px] font-bold uppercase tracking-wider text-[var(--dept)] flex items-center gap-1">
              <span>⚡</span> Showcase Markup Tools
            </span>
            <span className="font-meta text-[8px] text-neutral-500">Right-Click Menu</span>
          </div>

          {/* Primary Tool Switcher Grid */}
          <div className="grid grid-cols-4 gap-1">
            {[
              { id: "laser", icon: "🎯", label: "Laser" },
              { id: "pen", icon: "✏️", label: "Pen" },
              { id: "vanishing", icon: "✨", label: "Vanish" },
              { id: "highlighter", icon: "🖊️", label: "Marker" },
              { id: "arrow", icon: "➡️", label: "Arrow" },
              { id: "rect", icon: "🔲", label: "Box" },
              { id: "circle", icon: "⭕", label: "Circle" },
              { id: "pin", icon: "📍", label: "Pin" },
            ].map((tool) => (
              <button
                key={tool.id}
                type="button"
                onClick={() => {
                  setActiveProofTool(tool.id as any);
                  setCanvasContextMenu(null);
                }}
                className={`flex flex-col items-center justify-center p-1.5 rounded-xl border text-[9px] font-bold transition-colors ${
                  activeProofTool === tool.id
                    ? "bg-[var(--dept)] text-black border-[var(--dept)] font-extrabold shadow-sm"
                    : "bg-neutral-800/80 border-neutral-700 text-neutral-300 hover:bg-neutral-700"
                }`}
              >
                <span className="text-sm">{tool.icon}</span>
                <span className="truncate mt-0.5">{tool.label}</span>
              </button>
            ))}
          </div>

          {/* Color Palette & Stroke Width in Context Menu */}
          <div className="pt-1.5 border-t border-neutral-800 space-y-1.5">
            <div className="flex items-center justify-between px-1">
              <span className="font-meta text-[8px] uppercase text-neutral-400">Color:</span>
              <div className="flex gap-1.5">
                {["#06b6d4", "#ec4899", "#eab308", "#22c55e", "#ef4444", "#ffffff"].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setProofStrokeColor(c)}
                    style={{ backgroundColor: c }}
                    className={`w-4 h-4 rounded-full border ${
                      proofStrokeColor === c ? "ring-2 ring-white scale-110 border-white" : "border-black/40 opacity-80 hover:opacity-100"
                    }`}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setCanvasContextMenu(null);
                    handleSampleColorEyeDropper();
                  }}
                  className="w-4 h-4 rounded bg-neutral-800 hover:bg-neutral-700 text-white flex items-center justify-center text-[9px]"
                  title="Eyedropper"
                >
                  🎨
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between px-1">
              <span className="font-meta text-[8px] uppercase text-neutral-400">Width:</span>
              <div className="flex gap-1">
                {[2, 4, 8].map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setProofStrokeWidth(w)}
                    className={`px-2 py-0.5 text-[9px] rounded font-mono ${
                      proofStrokeWidth === w ? "bg-[var(--dept)] text-black font-bold" : "bg-neutral-800 text-neutral-400 hover:text-white"
                    }`}
                  >
                    {w}px
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Overlays & Actions */}
          <div className="pt-1.5 border-t border-neutral-800 flex flex-col gap-1">
            <div className="flex items-center justify-between px-1">
              <span className="font-meta text-[8px] uppercase text-neutral-400">Safe Overlay:</span>
              <select
                value={safeZoneOverlay}
                onChange={(e) => setSafeZoneOverlay(e.target.value as any)}
                className="bg-neutral-800 border border-neutral-700 text-[9px] rounded px-1.5 py-0.5 outline-none text-neutral-300 font-meta"
              >
                <option value="none">None</option>
                <option value="tiktok_reels_shorts">📱 TikTok / Reels (9:16)</option>
                <option value="ig_feed_grid">📸 IG 4:5 / 1:1 Grid</option>
                <option value="facebook_feed_ad">👥 Facebook Ads (1:1/4:5)</option>
                <option value="youtube_thumb">▶️ YouTube Thumb (16:9)</option>
                <option value="linkedin_post">💼 LinkedIn Post</option>
                <option value="print_bleed">🖨️ Print 0.125" Bleed</option>
                <option value="thirds">📐 Rule of Thirds</option>
                <option value="golden_ratio">🌀 Golden Ratio</option>
              </select>
            </div>

            <div className="flex items-center justify-between px-1">
              <span className="font-meta text-[8px] uppercase text-neutral-400">Backdrop:</span>
              <div className="flex gap-1">
                {[
                  { id: "slate", label: "Slate" },
                  { id: "black", label: "Dark" },
                  { id: "white", label: "Light" },
                  { id: "grid", label: "Grid" },
                  { id: "checker", label: "Check" },
                ].map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setCanvasBackdrop(b.id as any)}
                    className={`px-1.5 py-0.5 text-[8px] rounded ${
                      canvasBackdrop === b.id ? "bg-[var(--dept)] text-black font-bold" : "bg-neutral-800 text-neutral-400"
                    }`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Actions: Undo, Redo, Clear, Export */}
          <div className="pt-1.5 border-t border-neutral-800 grid grid-cols-4 gap-1">
            <button
              type="button"
              onClick={() => {
                handleUndoAnnotations();
                setCanvasContextMenu(null);
              }}
              disabled={undoStack.length === 0}
              className="px-1.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 text-[8.5px] font-bold text-center"
            >
              ⤺ Undo
            </button>
            <button
              type="button"
              onClick={() => {
                handleRedoAnnotations();
                setCanvasContextMenu(null);
              }}
              disabled={redoStack.length === 0}
              className="px-1.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 text-[8.5px] font-bold text-center"
            >
              ⤻ Redo
            </button>
            <button
              type="button"
              onClick={() => {
                handleClearAnnotations();
                setCanvasContextMenu(null);
              }}
              className="px-1.5 py-1 rounded bg-neutral-800 hover:bg-red-950 text-red-400 text-[8.5px] font-bold text-center"
            >
              🧹 Clear
            </button>
            <button
              type="button"
              onClick={() => {
                handleExportMarkedProof();
                setCanvasContextMenu(null);
              }}
              className="px-1.5 py-1 rounded bg-emerald-900/50 hover:bg-emerald-800 text-emerald-300 text-[8.5px] font-bold text-center"
            >
              💾 Export
            </button>
          </div>
        </div>
      )}

      {/* Drop Pin Revision Comment Modal */}
      {pendingPinCoord && (
        <div className="fixed inset-0 z-[140] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-100">
          <div className="w-full max-w-sm bg-neutral-900 border border-neutral-700 p-5 rounded-2xl shadow-2xl text-white space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[var(--dept)] text-black font-bold flex items-center justify-center text-xs">
                  {mockupPins.length + 1}
                </span>
                <h4 className="font-display text-xs font-bold uppercase">Drop Revision Pin #{mockupPins.length + 1}</h4>
              </div>
              <button
                type="button"
                onClick={() => setPendingPinCoord(null)}
                className="text-neutral-400 hover:text-white text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveNewPin} className="space-y-3 text-xs">
              <div>
                <label className="font-meta text-[9px] uppercase font-bold text-neutral-400 block mb-1">
                  Revision Note / Client Feedback *
                </label>
                <textarea
                  autoFocus
                  required
                  rows={3}
                  value={pinCommentDraft}
                  onChange={(e) => setPinCommentDraft(e.target.value)}
                  placeholder="e.g. Change this button label to 'Book Free Audit' and increase contrast."
                  className="w-full bg-neutral-800 border border-neutral-700 px-3 py-2 rounded-xl text-xs outline-none focus:border-[var(--dept)] text-white placeholder-neutral-500 resize-none"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={!pinCommentDraft.trim()}
                  className="btn btn-dept flex-1 !py-2 font-display text-[10px] font-bold uppercase disabled:opacity-40"
                >
                  Drop Pin Here
                </button>
                <button
                  type="button"
                  onClick={() => setPendingPinCoord(null)}
                  className="px-3 py-2 rounded-xl border border-neutral-700 text-neutral-400 hover:text-white text-[10px] font-bold uppercase"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View / Manage Pin Detail Dialog */}
      {selectedPinDetail && (
        <div className="fixed inset-0 z-[140] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-100">
          <div className="w-full max-w-sm bg-neutral-900 border border-neutral-700 p-5 rounded-2xl shadow-2xl text-white space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={`w-6 h-6 rounded-full font-bold flex items-center justify-center text-xs ${
                    selectedPinDetail.resolved ? "bg-emerald-500 text-white" : "bg-[var(--dept)] text-black"
                  }`}
                >
                  {selectedPinDetail.number}
                </span>
                <div>
                  <h4 className="font-display text-xs font-bold uppercase">
                    Pin #{selectedPinDetail.number} {selectedPinDetail.resolved ? "· Resolved" : "· Active"}
                  </h4>
                  <p className="font-meta text-[8px] text-neutral-400">
                    By {selectedPinDetail.senderName} · {new Date(selectedPinDetail.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPinDetail(null)}
                className="text-neutral-400 hover:text-white text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-3 bg-neutral-800/80 rounded-xl border border-neutral-700/80 text-xs leading-relaxed text-neutral-200">
              <p className="whitespace-pre-wrap">{selectedPinDetail.text}</p>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  handleToggleResolvePin(selectedPinDetail.id);
                  setSelectedPinDetail((prev) => (prev ? { ...prev, resolved: !prev.resolved } : null));
                }}
                className={`flex-1 py-2 rounded-xl font-display text-[10px] font-bold uppercase border transition-colors ${
                  selectedPinDetail.resolved
                    ? "bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700"
                    : "bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500"
                }`}
              >
                {selectedPinDetail.resolved ? "Mark as Active" : "✓ Mark as Resolved"}
              </button>
              <button
                type="button"
                onClick={() => handleDeletePin(selectedPinDetail.id)}
                className="px-3 py-2 rounded-xl border border-red-500/40 bg-red-950/30 text-red-300 hover:bg-red-900/50 text-[10px] font-bold uppercase"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Canvas Confirmation Modal (Protects Pins vs Drawings) */}
      {showClearConfirmModal && (
        <div className="fixed inset-0 z-[160] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-100 select-none">
          <div className="w-full max-w-sm bg-neutral-900 border border-neutral-700 p-5 rounded-2xl shadow-2xl text-white space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">🧹</span>
                <h4 className="font-display text-xs font-bold uppercase">Clear Canvas Options</h4>
              </div>
              <button
                type="button"
                onClick={() => setShowClearConfirmModal(false)}
                className="text-neutral-400 hover:text-white text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed">
              You have <strong className="text-[var(--dept)]">{mockupPins.length} revision {mockupPins.length === 1 ? 'pin' : 'pins'}</strong> with client notes on this deliverable. What would you like to clear?
            </p>

            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={handleClearDrawingsOnly}
                className="w-full p-3 rounded-xl bg-cyan-950/40 hover:bg-cyan-900/60 border border-cyan-500/50 text-cyan-200 text-left text-xs font-bold flex items-center justify-between transition-colors group"
              >
                <div>
                  <div className="flex items-center gap-1.5 text-[var(--dept)] font-bold">
                    <span>✏️</span> Clear Drawings Only
                  </div>
                  <p className="text-[9.5px] text-neutral-400 font-normal mt-0.5">
                    (Recommended) Keep all {mockupPins.length} feedback pins &amp; review notes intact.
                  </p>
                </div>
                <span className="text-xs font-bold opacity-75 group-hover:opacity-100">✓</span>
              </button>

              <button
                type="button"
                onClick={handleClearAllAnnotations}
                className="w-full p-3 rounded-xl bg-red-950/30 hover:bg-red-900/50 border border-red-500/40 text-red-300 text-left text-xs font-bold flex items-center justify-between transition-colors"
              >
                <div>
                  <div className="flex items-center gap-1.5 text-red-300 font-bold">
                    <span>💥</span> Clear Everything
                  </div>
                  <p className="text-[9.5px] text-neutral-400 font-normal mt-0.5">
                    Remove all drawings AND delete all {mockupPins.length} feedback pins.
                  </p>
                </div>
                <span className="text-xs font-bold">🗑️</span>
              </button>
            </div>

            <div className="pt-1 text-center">
              <button
                type="button"
                onClick={() => setShowClearConfirmModal(false)}
                className="px-4 py-2 rounded-xl text-xs text-neutral-400 hover:text-white font-meta uppercase font-bold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approved Deliverables & Pin History Sign-Off Archive Modal */}
      {showApprovedArchiveModal && (
        <div className="fixed inset-0 z-[170] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-100 select-none">
          <div className="w-full max-w-2xl bg-neutral-900 border border-neutral-700 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] text-white">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/60">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">📜</span>
                <div>
                  <h3 className="font-display text-sm font-bold uppercase tracking-wider text-cyan-300">
                    Approved Deliverables &amp; Revision Log
                  </h3>
                  <p className="text-[10px] text-neutral-400 font-meta">
                    Permanent audit record of client concept approvals, revision requests, and numbered pin notes.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowApprovedArchiveModal(false)}
                className="w-8 h-8 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center text-xs font-bold text-neutral-300 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Approvals & Pins List */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
              {(!meeting?.liveProofing?.approvedDeliverables || meeting.liveProofing.approvedDeliverables.length === 0) ? (
                <div className="text-center py-12 space-y-3">
                  <span className="text-4xl block opacity-40">📂</span>
                  <p className="text-xs text-neutral-400 font-meta">
                    No approved deliverables recorded yet in this session.
                  </p>
                  <p className="text-[10px] text-neutral-500 max-w-sm mx-auto">
                    When you or the client clicks <strong className="text-emerald-400">[✓ Approve Concept]</strong> on any mockup, all dropped revision pins and notes are permanently preserved here.
                  </p>
                </div>
              ) : (
                meeting.liveProofing.approvedDeliverables.map((record, i) => (
                  <div
                    key={record.id || i}
                    className="bg-neutral-950/80 border border-neutral-800 rounded-2xl p-4 space-y-3 hover:border-neutral-700 transition-colors shadow-lg"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        {record.mockupImage && (
                          <img
                            src={record.mockupImage}
                            alt={record.mockupTitle}
                            className="w-14 h-14 rounded-xl object-cover border border-neutral-700 shrink-0"
                          />
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs font-bold text-white">{record.mockupTitle}</h4>
                            <span
                              className={`font-meta text-[8px] px-2 py-0.5 rounded-full font-bold uppercase ${
                                record.approved
                                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                                  : "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                              }`}
                            >
                              {record.approved ? "✓ Approved" : "Revision Requested"}
                            </span>
                          </div>
                          <p className="text-[10px] text-neutral-400 font-meta mt-0.5">
                            {record.mockupCategory} • By <strong className="text-neutral-200">{record.approvedBy}</strong> • {new Date(record.approvedAt).toLocaleDateString()} {new Date(record.approvedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="font-meta text-[9px] bg-cyan-950/60 text-cyan-300 border border-cyan-500/30 px-2 py-1 rounded-lg font-bold">
                          📍 {record.pinsCount} {record.pinsCount === 1 ? "Pin Note" : "Pin Notes"} Saved
                        </span>
                      </div>
                    </div>

                    {record.feedbackText && (
                      <p className="text-[11px] text-neutral-300 italic bg-neutral-900/60 p-2 rounded-xl border border-neutral-800">
                        "{record.feedbackText}"
                      </p>
                    )}

                    {/* Preserved Pins Details */}
                    {record.pins && record.pins.length > 0 && (
                      <div className="pt-2 border-t border-neutral-800/80 space-y-1.5">
                        <span className="font-meta text-[8.5px] uppercase font-bold text-neutral-400 block">
                          Preserved Numbered Pin Feedback:
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {record.pins.map((pin) => (
                            <div
                              key={pin.id}
                              className="p-2 rounded-xl bg-neutral-900/90 border border-neutral-800 text-[10px] space-y-1"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-[var(--dept)]">
                                  #{pin.number} • {pin.senderName || "Client"}
                                </span>
                                <span className={`text-[7.5px] uppercase font-bold px-1 rounded ${pin.resolved ? "text-emerald-400 bg-emerald-950" : "text-cyan-300 bg-cyan-950"}`}>
                                  {pin.resolved ? "Resolved" : "Active"}
                                </span>
                              </div>
                              <p className="text-neutral-300 line-clamp-2 leading-relaxed">
                                {pin.text}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Footer with Sign-Off Export */}
            <div className="p-4 border-t border-neutral-800 flex items-center justify-between bg-neutral-950/80">
              <span className="text-[10px] font-meta text-neutral-400">
                {meeting?.liveProofing?.approvedDeliverables?.length || 0} approved deliverable records
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const approvals = meeting?.liveProofing?.approvedDeliverables || [];
                    const summary = JSON.stringify(approvals, null, 2);
                    const blob = new Blob([summary], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `Proofing_SignOff_Log_${meeting?.roomId || "session"}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                    toast.success("Sign-Off Log downloaded!");
                  }}
                  className="px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-black text-xs font-bold font-meta uppercase shadow-md flex items-center gap-1.5"
                >
                  <span>📄</span> Export Sign-Off Log
                </button>
                <button
                  type="button"
                  onClick={() => setShowApprovedArchiveModal(false)}
                  className="px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-bold"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* A/B Split Revision Compare Modal */}
      {compareMode && (
        <div className="fixed inset-0 z-[170] bg-black/90 backdrop-blur-md flex flex-col p-4 select-none animate-in fade-in duration-100">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
            <div className="flex items-center gap-2">
              <span className="text-xl">↔️</span>
              <div>
                <h3 className="font-display text-sm font-bold uppercase tracking-wider text-purple-300">
                  A/B Revision Version Comparison
                </h3>
                <p className="text-[10px] text-neutral-400 font-meta">
                  Drag the center divider to inspect differences between Version A and Version B.
                </p>
              </div>
            </div>

            {/* Version B Selector */}
            <div className="flex items-center gap-2">
              <span className="font-meta text-xs text-neutral-400 hidden sm:inline">Compare with:</span>
              <select
                value={compareMockupIdx}
                onChange={(e) => setCompareMockupIdx(Number(e.target.value))}
                className="bg-neutral-800 border border-neutral-700 text-xs rounded-lg px-2.5 py-1 text-white outline-none"
              >
                {proofingMockups.map((m, idx) => (
                  <option key={m.id} value={idx} disabled={idx === proofingIndex}>
                    {idx === proofingIndex ? `(Current) ${m.title}` : `Version B: ${m.title}`}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => setCompareMode(false)}
                className="w-8 h-8 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center font-bold text-sm text-white ml-2"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Interactive Split View Area */}
          <div className="flex-1 flex items-center justify-center p-2 relative overflow-hidden">
            <div className="relative aspect-video max-h-[75vh] w-full max-w-5xl rounded-2xl overflow-hidden border-2 border-purple-500/40 shadow-2xl bg-neutral-950">
              {/* Version B (Background) */}
              <img
                src={proofingMockups[compareMockupIdx]?.image || activeMockup.image}
                alt="Version B"
                className="absolute inset-0 w-full h-full object-contain pointer-events-none"
              />
              <div className="absolute top-3 right-3 bg-purple-950/90 border border-purple-500/50 px-2.5 py-1 rounded-full text-[9px] font-meta text-purple-200 font-bold shadow-md">
                Version B: {proofingMockups[compareMockupIdx]?.title || "Revised Deliverable"}
              </div>

              {/* Version A (Foreground with clip-path) */}
              <div
                className="absolute inset-0 overflow-hidden"
                style={{ clipPath: `inset(0 ${100 - compareSplitPos}% 0 0)` }}
              >
                <img
                  src={activeMockup.image}
                  alt="Version A"
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                />
                <div className="absolute top-3 left-3 bg-cyan-950/90 border border-cyan-500/50 px-2.5 py-1 rounded-full text-[9px] font-meta text-cyan-200 font-bold shadow-md">
                  Version A (Current): {activeMockup.title}
                </div>
              </div>

              {/* Draggable Divider Line */}
              <div
                className="absolute top-0 bottom-0 w-1 bg-white shadow-[0_0_15px_rgba(255,255,255,0.8)] cursor-ew-resize flex items-center justify-center pointer-events-none"
                style={{ left: `${compareSplitPos}%` }}
              >
                <div className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center font-bold text-xs shadow-2xl border-2 border-purple-600">
                  ↔️
                </div>
              </div>

              {/* Transparent Slider Input across Canvas */}
              <input
                type="range"
                min="0"
                max="100"
                value={compareSplitPos}
                onChange={(e) => setCompareSplitPos(Number(e.target.value))}
                className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize z-30"
              />
            </div>
          </div>

          <div className="text-center pb-2">
            <span className="font-meta text-xs text-neutral-400 bg-neutral-900 px-3 py-1 rounded-full border border-neutral-800">
              Drag anywhere horizontally across the screen to slide comparison ({compareSplitPos}% Split)
            </span>
          </div>
        </div>
      )}

      {/* DESKTOP & TABLET MORE ACTIONS FLOATING POPOVER */}
      {showMoreMenu && (
        <div 
          className="fixed inset-0 z-[140] pointer-events-auto flex flex-col justify-end items-center pb-24 md:pb-20 animate-in fade-in duration-100 select-none"
          onClick={() => setShowMoreMenu(false)}
        >
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs" />
          <div
            role="menu"
            aria-label="More meeting actions"
            className="relative z-10 w-72 sm:w-80 bg-neutral-900/98 backdrop-blur-2xl border border-neutral-700/90 rounded-3xl p-3 shadow-2xl text-white space-y-1 max-h-[75vh] overflow-y-auto ring-1 ring-white/10 animate-in zoom-in-95 slide-in-from-bottom-2 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-2 py-1.5 border-b border-neutral-800 mb-1">
              <span className="font-meta text-[9px] uppercase tracking-wider font-bold text-neutral-400">
                More Actions &amp; Tools
              </span>
              <button
                type="button"
                onClick={() => setShowMoreMenu(false)}
                className="w-6 h-6 rounded-full bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white flex items-center justify-center text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <button
              type="button"
              role="menuitem"
              onClick={() => { setActiveDrawer("proofing"); setShowMoreMenu(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-xs text-neutral-200 hover:text-white hover:bg-neutral-800 transition-colors"
            >
              <Palette className="w-4 h-4 text-cyan-400 shrink-0" strokeWidth={2} />
              <span>Deliverable Proof Canvas</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => { setActiveDrawer("intelligence"); setShowMoreMenu(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-xs text-neutral-200 hover:text-white hover:bg-neutral-800 transition-colors"
            >
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" strokeWidth={2} />
              <span>AI Meeting Notes</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => { setActiveDrawer("breakouts"); setShowMoreMenu(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-xs text-neutral-200 hover:text-white hover:bg-neutral-800 transition-colors"
            >
              <GitBranch className="w-4 h-4 text-purple-400 shrink-0" strokeWidth={2} />
              <span>Breakout Rooms</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => { setActiveDrawer("queue"); setShowMoreMenu(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-xs text-neutral-200 hover:text-white hover:bg-neutral-800 transition-colors"
            >
              <Hand className="w-4 h-4 text-amber-400 shrink-0" strokeWidth={2} />
              <span>Speaker Queue</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => { setActiveDrawer("agenda"); setShowMoreMenu(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-xs text-neutral-200 hover:text-white hover:bg-neutral-800 transition-colors"
            >
              <span className="w-4 h-4 flex items-center justify-center text-emerald-400 shrink-0 font-bold">⏱</span>
              <span>Agenda &amp; Focus Timer</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => { setActiveDrawer("actions"); setShowMoreMenu(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-xs text-neutral-200 hover:text-white hover:bg-neutral-800 transition-colors"
            >
              <span className="w-4 h-4 flex items-center justify-center text-sky-400 shrink-0 font-bold">✅</span>
              <span>Live Action Board</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => { setShareModalOpen(true); setShowMoreMenu(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-xs text-neutral-200 hover:text-white hover:bg-neutral-800 transition-colors"
            >
              <Share2 className="w-4 h-4 text-emerald-400 shrink-0" strokeWidth={2} />
              <span>Copy Invite Link</span>
            </button>
            <div className="my-1 border-t border-neutral-800" />
            <button
              type="button"
              role="menuitem"
              onClick={() => { setShowDeviceSettingsModal(true); setShowMoreMenu(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-xs text-neutral-200 hover:text-white hover:bg-neutral-800 transition-colors"
            >
              <Settings className="w-4 h-4 text-neutral-400 shrink-0" strokeWidth={2} />
              <span>Audio &amp; Video Settings</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => { handleToggleFullscreen(); setShowMoreMenu(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-xs text-neutral-200 hover:text-white hover:bg-neutral-800 transition-colors"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4 text-neutral-400 shrink-0" strokeWidth={2} /> : <Maximize2 className="w-4 h-4 text-neutral-400 shrink-0" strokeWidth={2} />}
              <span>{isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}</span>
            </button>
            {isHost && (
              <>
                <div className="my-1 border-t border-neutral-800" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { setShowMoreMenu(false); handleEndForAll(); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-xs text-red-400 hover:bg-red-950/50 font-bold transition-colors"
                >
                  <PhoneOff className="w-4 h-4 shrink-0" strokeWidth={2} />
                  <span>End Meeting for All</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* 2026 MOBILE ACTION SHEET MODAL */}
      {showMobileActionsSheet && (
        <div 
          className="fixed inset-0 z-[140] pointer-events-auto bg-black/80 backdrop-blur-sm flex flex-col justify-end md:hidden animate-in fade-in duration-150 select-none"
          onClick={() => setShowMobileActionsSheet(false)}
        >
          <div
            className="w-full bg-neutral-900 border-t border-neutral-700 rounded-t-3xl p-4 sm:p-5 shadow-2xl space-y-4 max-h-[85dvh] overflow-y-auto animate-in slide-in-from-bottom duration-200 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sheet Header */}
            <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                <h3 className="font-display text-xs font-bold uppercase tracking-wider text-white">
                  Meeting Tools &amp; Actions
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowMobileActionsSheet(false)}
                className="w-8 h-8 rounded-full bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white flex items-center justify-center text-xs font-bold"
              >
                ✕
              </button>
            </div>

            {/* Quick Emoji Reactions Bar */}
            <div className="space-y-1.5">
              <span className="font-meta text-[9px] uppercase font-bold text-neutral-400 px-1">
                Send Live Reaction
              </span>
              <div className="grid grid-cols-6 gap-2 bg-neutral-950/70 p-2 rounded-2xl border border-neutral-800">
                {[
                  { id: "thumbs_up", icon: "👍", label: "Thumbs Up" },
                  { id: "heart", icon: "❤️", label: "Heart" },
                  { id: "clap", icon: "👏", label: "Clap" },
                  { id: "celebrate", icon: "🎉", label: "Celebrate" },
                  { id: "laugh", icon: "🔥", label: "Fire" },
                  { id: "laugh", icon: "😂", label: "Laugh" },
                ].map((r, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      handleSendReaction(r.id as any);
                      setShowMobileActionsSheet(false);
                    }}
                    className="py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 active:scale-125 text-lg flex items-center justify-center transition-transform"
                    title={r.label}
                  >
                    {r.icon}
                  </button>
                ))}
              </div>
            </div>

            {/* Main Action Grid */}
            <div className="grid grid-cols-3 gap-2.5 pt-1">
              {/* Hand Raise */}
              <button
                type="button"
                onClick={() => {
                  handleToggleRaiseHand();
                  setShowMobileActionsSheet(false);
                }}
                className={`p-3 rounded-2xl border flex flex-col items-center justify-center gap-1.5 transition-all text-center ${
                  isHandRaised
                    ? "bg-amber-500/20 text-amber-300 border-amber-400 shadow-md animate-pulse"
                    : "bg-neutral-950/80 border-neutral-800 hover:border-neutral-700 text-white"
                }`}
              >
                <Hand className="w-5 h-5" strokeWidth={2} />
                <span className="font-meta text-[9.5px] font-bold uppercase whitespace-nowrap">{isHandRaised ? "Lower Hand" : "Raise Hand"}</span>
              </button>

              {/* Proof Canvas */}
              <button
                type="button"
                onClick={() => {
                  setActiveDrawer("proofing");
                  setShowMobileActionsSheet(false);
                }}
                className="p-3 rounded-2xl border border-cyan-500/30 bg-cyan-950/25 hover:bg-cyan-900/40 text-cyan-300 flex flex-col items-center justify-center gap-1.5 text-center transition-all"
              >
                <Palette className="w-5 h-5" strokeWidth={2} />
                <span className="font-meta text-[9.5px] font-bold uppercase whitespace-nowrap">Proof Canvas</span>
              </button>

              {/* KON10 Co-Design */}
              <button
                type="button"
                onClick={() => {
                  setShowStudioCoDesignModal(true);
                  setShowMobileActionsSheet(false);
                }}
                className="p-3 rounded-2xl border border-purple-500/30 bg-purple-950/25 hover:bg-purple-900/40 text-purple-300 flex flex-col items-center justify-center gap-1.5 text-center transition-all"
              >
                <Palette className="w-5 h-5" strokeWidth={2} />
                <span className="font-meta text-[9.5px] font-bold uppercase whitespace-nowrap">Co-Design</span>
              </button>

              {/* Screen Share */}
              <button
                type="button"
                onClick={() => {
                  setShowMobileActionsSheet(false);
                  if (isScreenSharing) {
                    handleStartScreenShare(false);
                  } else {
                    setShowScreenShareMenu(true);
                  }
                }}
                className={`p-3 rounded-2xl border flex flex-col items-center justify-center gap-1.5 transition-all text-center ${
                  isScreenSharing
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-400"
                    : "bg-neutral-950/80 border-neutral-800 hover:border-neutral-700 text-white"
                }`}
              >
                {isScreenSharing ? <MonitorOff className="w-5 h-5" strokeWidth={2} /> : <MonitorUp className="w-5 h-5" strokeWidth={2} />}
                <span className="font-meta text-[9.5px] font-bold uppercase whitespace-nowrap">{isScreenSharing ? "Stop Share" : "Share Screen"}</span>
              </button>

              {/* People & Waiting Room */}
              <button
                type="button"
                onClick={() => {
                  setActiveDrawer("participants");
                  setShowMobileActionsSheet(false);
                }}
                className="relative p-3 rounded-2xl border border-neutral-800 bg-neutral-950/80 hover:border-neutral-700 text-white flex flex-col items-center justify-center gap-1.5 text-center transition-all"
              >
                {isHost && waitingParticipants.length > 0 && (
                  <span className="absolute top-1.5 right-1.5 bg-amber-400 text-black text-[8px] font-extrabold px-1 rounded-full">
                    {waitingParticipants.length}
                  </span>
                )}
                <Users className="w-5 h-5" strokeWidth={2} />
                <span className="font-meta text-[9.5px] font-bold uppercase whitespace-nowrap">People ({activeParticipants.length})</span>
              </button>

              {/* AI Meeting Intelligence */}
              <button
                type="button"
                onClick={() => {
                  setActiveDrawer("intelligence");
                  setShowMobileActionsSheet(false);
                }}
                className="p-3 rounded-2xl border border-neutral-800 bg-neutral-950/80 hover:border-neutral-700 text-white flex flex-col items-center justify-center gap-1.5 text-center transition-all"
              >
                <Sparkles className="w-5 h-5" strokeWidth={2} />
                <span className="font-meta text-[9.5px] font-bold uppercase whitespace-nowrap">AI Notes</span>
              </button>

              {/* Audio & Video Device Settings */}
              <button
                type="button"
                onClick={() => {
                  setShowDeviceSettingsModal(true);
                  setShowMobileActionsSheet(false);
                }}
                className="p-3 rounded-2xl border border-neutral-800 bg-neutral-950/80 hover:border-neutral-700 text-white flex flex-col items-center justify-center gap-1.5 text-center transition-all"
              >
                <Settings className="w-5 h-5" strokeWidth={2} />
                <span className="font-meta text-[9.5px] font-bold uppercase whitespace-nowrap">A/V Settings</span>
              </button>

              {/* Breakout Rooms */}
              <button
                type="button"
                onClick={() => {
                  setActiveDrawer("breakouts");
                  setShowMobileActionsSheet(false);
                }}
                className={`relative p-3 rounded-2xl border flex flex-col items-center justify-center gap-1.5 text-center transition-all ${
                  myActiveBreakoutRoom
                    ? "bg-purple-950/50 border-purple-400/70 text-purple-200"
                    : "border-neutral-800 bg-neutral-950/80 hover:border-neutral-700 text-white"
                }`}
              >
                {isHost && breakoutHelpRequests.length > 0 ? (
                  <span className="absolute top-1.5 right-1.5 bg-amber-400 text-black text-[8px] font-extrabold px-1 rounded-full animate-bounce">
                    🆘 {breakoutHelpRequests.length}
                  </span>
                ) : openBreakoutRooms.length > 0 ? (
                  <span className="absolute top-1.5 right-1.5 bg-purple-500 text-white text-[8px] font-extrabold px-1.5 rounded-full">
                    {openBreakoutRooms.length}
                  </span>
                ) : null}
                <GitBranch className="w-5 h-5" strokeWidth={2} />
                <span className="font-meta text-[9.5px] font-bold uppercase whitespace-nowrap">
                  {myActiveBreakoutRoom ? myActiveBreakoutRoom.name : "Breakouts"}
                </span>
              </button>

              {/* PRD: Speaker Queue */}
              <button
                type="button"
                onClick={() => { setActiveDrawer("queue"); setShowMobileActionsSheet(false); }}
                className="relative p-3 rounded-2xl border border-amber-500/30 bg-amber-950/20 hover:bg-amber-900/30 text-amber-300 flex flex-col items-center justify-center gap-1.5 text-center transition-all"
              >
                {(meeting?.speakerQueue ?? []).filter((e) => e.status === "waiting").length > 0 && (
                  <span className="absolute top-1.5 right-1.5 bg-amber-400 text-black text-[8px] font-extrabold px-1.5 rounded-full">
                    {(meeting?.speakerQueue ?? []).filter((e) => e.status === "waiting").length}
                  </span>
                )}
                <Hand className="w-5 h-5" strokeWidth={2} />
                <span className="font-meta text-[9.5px] font-bold uppercase whitespace-nowrap">Queue</span>
              </button>

              {/* PRD: Agenda & Timer */}
              <button
                type="button"
                onClick={() => { setActiveDrawer("agenda"); setShowMobileActionsSheet(false); }}
                className={`p-3 rounded-2xl border flex flex-col items-center justify-center gap-1.5 text-center transition-all ${
                  (meeting?.agendaItems ?? []).some((it) => it.status === "active")
                    ? "border-emerald-500/40 bg-emerald-950/30 text-emerald-300 animate-pulse"
                    : "border-neutral-800 bg-neutral-950/80 hover:border-neutral-700 text-white"
                }`}
              >
                <span className="text-lg leading-none">⏱</span>
                <span className="font-meta text-[9.5px] font-bold uppercase whitespace-nowrap">Agenda</span>
              </button>

              {/* PRD: Action Board */}
              <button
                type="button"
                onClick={() => { setActiveDrawer("actions"); setShowMobileActionsSheet(false); }}
                className="p-3 rounded-2xl border border-sky-500/30 bg-sky-950/20 hover:bg-sky-900/30 text-sky-300 flex flex-col items-center justify-center gap-1.5 text-center transition-all"
              >
                <span className="text-lg leading-none">✅</span>
                <span className="font-meta text-[9.5px] font-bold uppercase whitespace-nowrap">Actions</span>
              </button>

              {/* Share / Invite Link */}
              <button
                type="button"
                onClick={() => {
                  setShareModalOpen(true);
                  setShowMobileActionsSheet(false);
                }}
                className="p-3 rounded-2xl border border-[var(--dept)]/40 bg-[var(--dept)]/10 hover:bg-[var(--dept)]/20 text-white flex flex-col items-center justify-center gap-1.5 text-center transition-all"
              >
                <Share2 className="w-5 h-5" strokeWidth={2} />
                <span className="font-meta text-[9.5px] font-bold uppercase whitespace-nowrap">Invite Link</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2026 CAMERA & AUDIO DEVICE SETTINGS MODAL */}
      {showDeviceSettingsModal && (
        <div className="fixed inset-0 z-[150] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150 select-none">
          <div className="w-full max-w-md bg-neutral-900 border border-neutral-700 rounded-3xl p-5 sm:p-6 shadow-2xl text-white space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <span className="text-xl">⚙️</span>
                <h3 className="font-display text-sm font-bold uppercase text-white">
                  Audio &amp; Video Hardware Settings
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowDeviceSettingsModal(false)}
                className="w-8 h-8 rounded-full bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white flex items-center justify-center text-xs font-bold"
              >
                ✕
              </button>
            </div>

            {/* Camera Switcher */}
            <div className="space-y-1.5">
              <label className="font-meta text-[10px] font-bold uppercase text-neutral-400 flex items-center gap-1">
                <span>📹</span> Camera Source
              </label>
              <select
                value={selectedVideoInput}
                onChange={(e) => setSelectedVideoInput(e.target.value)}
                className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-[var(--dept)]"
              >
                {devices.videoInputs.length === 0 && (
                  <option value="">Default System Camera</option>
                )}
                {devices.videoInputs.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Camera (${d.deviceId.slice(0, 5)})`}
                  </option>
                ))}
              </select>
            </div>

            {/* Microphone Switcher */}
            <div className="space-y-1.5">
              <label className="font-meta text-[10px] font-bold uppercase text-neutral-400 flex items-center gap-1">
                <span>🎙️</span> Microphone Source
              </label>
              <select
                value={selectedAudioInput}
                onChange={(e) => setSelectedAudioInput(e.target.value)}
                className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-[var(--dept)]"
              >
                {devices.audioInputs.length === 0 && (
                  <option value="">Default System Microphone</option>
                )}
                {devices.audioInputs.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Microphone (${d.deviceId.slice(0, 5)})`}
                  </option>
                ))}
              </select>
            </div>

            {/* Live Mic Volume Level Meter */}
            <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800 space-y-1.5">
              <div className="flex justify-between items-center text-[10px] font-meta text-neutral-400">
                <span>Live Mic Signal:</span>
                <span className={micVolume > 10 ? "text-emerald-400 font-bold" : "text-neutral-500"}>
                  {micVolume > 10 ? "Receiving Input" : "Silent"}
                </span>
              </div>
              <div className="h-2 w-full bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-cyan-400 transition-all duration-75"
                  style={{ width: `${Math.min(100, micVolume * 2)}%` }}
                />
              </div>
            </div>

            {/* Speaker Test */}
            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={async () => {
                  setIsTestingSpeaker(true);
                  await playSpeakerTestSound();
                  setIsTestingSpeaker(false);
                }}
                disabled={isTestingSpeaker}
                className="btn btn-ghost !py-2 !px-3 font-meta text-[10px] font-bold uppercase flex items-center gap-1.5"
              >
                <span>🔊</span> {isTestingSpeaker ? "Testing Chime…" : "Test Speaker"}
              </button>

              <button
                type="button"
                onClick={() => setShowDeviceSettingsModal(false)}
                className="btn btn-dept !py-2 !px-4 font-display text-[10px] font-bold uppercase"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
