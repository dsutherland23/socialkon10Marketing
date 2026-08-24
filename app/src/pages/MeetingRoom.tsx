import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import { useSEO } from "../lib/seo";
import {
  type MeetingRecord,
  type MeetingParticipant,
  type MeetingChatMessage,
  type ParticipantRole,
  type ParticipantStatus,
  subscribeToMeeting,
  updateParticipant,
  admitParticipant,
  admitAllParticipants,
  removeParticipant,
  setMeetingLock,
  endMeetingForAll,
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
} from "../lib/meetings";
import {
  getMediaDevices,
  getLocalUserMedia,
  getDisplayMediaStream,
  stopMediaStream,
  createAudioLevelMeter,
  playSpeakerTestSound,
  playMessageNotificationSound,
  playDoorbellChime,
  playHandRaiseChime,
  playSuccessChime,
  triggerHapticFeedback,
  WebRTCMeshSession,
  type MediaDeviceList,
} from "../lib/webrtc";

/* ------------------------------------------------------------------
   ROBUST VIDEO TILE COMPONENT (Autoplay + Clean SrcObject Binding)
------------------------------------------------------------------- */

function VideoTile({
  stream,
  muted = false,
  className = "w-full h-full object-cover",
  isMirrored = false,
}: {
  stream: MediaStream | null;
  muted?: boolean;
  className?: string;
  isMirrored?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    if (stream) {
      videoEl.srcObject = stream;
      videoEl.play().catch((err) => {
        console.warn("Video autoplay notice:", err);
      });
    } else {
      videoEl.srcObject = null;
    }
  }, [stream]);

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
  const [passcode, setPasscode] = useState("");
  const [displayName, setDisplayName] = useState(user?.displayName || user?.email?.split("@")[0] || "Guest Participant");
  const [myParticipantId] = useState<string>(() => `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);

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
  const [activeDrawer, setActiveDrawer] = useState<"none" | "chat" | "participants" | "intelligence" | "breakouts" | "proofing">("none");
  const [chatMessages, setChatMessages] = useState<MeetingChatMessage[]>([]);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const prevChatCount = useRef(0);
  const [chatDraft, setChatDraft] = useState("");
  const [chatRecipient] = useState<string>(""); // "" = everyone
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [floatingReactions, setFloatingReactions] = useState<{ id: string; emoji: string; x: number; senderName?: string }[]>([]);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);

  // Spotlight & Fullscreen & Presentation Modes
  const [pinnedParticipantId, setPinnedParticipantId] = useState<string | null>(null);
  const [autoSpotlightActiveSpeaker, setAutoSpotlightActiveSpeaker] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showScreenShareMenu, setShowScreenShareMenu] = useState(false);
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
  const [isRequestingMedia, setIsRequestingMedia] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");

  const isHost = Boolean(
    meeting && (
      isAdmin ||
      user?.email?.toLowerCase().trim() === "socialkon10@gmail.com" ||
      user?.email?.toLowerCase().trim() === "admin@socialkon10.pro" ||
      (user?.email && meeting.hostEmail && user.email.toLowerCase().trim() === meeting.hostEmail.toLowerCase().trim()) ||
      (user?.uid && meeting.hostId && user.uid === meeting.hostId)
    )
  );

  const hostParticipant = meeting?.participants.find((p) => p.role === "host");
  const effectiveMyId = isHost && hostParticipant ? hostParticipant.id : myParticipantId;

  const activeParticipants = (meeting?.participants || [])
    .filter((p) => p.status === "joined" || p.status === "admitted")
    .filter((p, idx, arr) => {
      if (p.role === "host") {
        return arr.findIndex((x) => x.role === "host") === idx;
      }
      return arr.findIndex((x) => x.id === p.id) === idx;
    });

  const waitingParticipants = (meeting?.participants || [])
    .filter((p) => p.status === "waiting")
    .filter((p, idx, arr) => arr.findIndex((x) => x.id === p.id) === idx);

  const otherConnectedParticipants = activeParticipants.filter((p) => {
    if (p.id === effectiveMyId || p.id === myParticipantId) return false;
    if (isHost && p.role === "host") return false;
    if (user?.email && p.email && p.email.toLowerCase().trim() === user.email.toLowerCase().trim()) return false;
    return true;
  });

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
          "Permission blocked in browser settings. Follow the mobile guide below to enable camera access."
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
      if (navigator.permissions?.query) {
        try {
          const camQuery = await navigator.permissions.query({ name: "camera" as any });
          if (camQuery.state === "granted") permissionGranted = true;
        } catch {
          // Ignore unsupported permission names in older/Safari browsers
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

  useEffect(() => {
    if (!localStream) return;
    const cleanup = createAudioLevelMeter(localStream, (vol) => {
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

  // 4. Initialize WebRTC Multi-Peer Mesh during Meeting
  useEffect(() => {
    if (!meeting || phase !== "in_meeting") return;

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

    // Connect to other active participants
    const activeOthers = meeting.participants.filter(
      (p) => p.id !== myParticipantId && (p.status === "joined" || p.status === "admitted")
    );

    activeOthers.forEach((p) => {
      // Host or deterministic lexicographical tie-breaker initiates offer
      const isInitiator = isHost || myParticipantId < p.id;
      mesh.connectToPeer(p.id, isInitiator);
    });

    // Subscribe to incoming WebRTC signals
    const unsubSignals = subscribeToWebRTCSignals(meeting.id, myParticipantId, (sig) => {
      mesh.handleIncomingSignal(sig.fromParticipantId, sig.type as any, sig.payload);
    });

    return () => {
      unsubSignals();
      mesh.closeAll();
      meshRef.current = null;
    };
  }, [meeting?.id, phase]);

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
  useEffect(() => {
    if (!meeting) return;
    const me = meeting.participants.find((p) => p.id === myParticipantId);
    if (!me) return;

    if (me.status === "admitted" && phase === "waiting_room") {
      setPhase("in_meeting");
      toast.success("You have been admitted to the meeting!");
    } else if (me.status === "removed") {
      setPhase("ended");
      toast.error("You have been removed from the meeting by the host.");
    }
  }, [meeting, myParticipantId, phase]);

  // 9. Watch for incoming Waiting Room participants (Host Doorbell Notification)
  const prevWaitingCount = useRef(0);
  useEffect(() => {
    if (!meeting || !isHost || phase !== "in_meeting") return;
    const count = meeting.participants.filter((p) => p.status === "waiting").length;
    if (count > prevWaitingCount.current && prevWaitingCount.current >= 0) {
      playDoorbellChime();
      triggerHapticFeedback([150, 80, 200]);
    }
    prevWaitingCount.current = count;
  }, [meeting?.participants, isHost, phase]);

  // 10. Listen for Fullscreen State Change
  useEffect(() => {
    const handleFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", handleFs);
    return () => document.removeEventListener("fullscreenchange", handleFs);
  }, []);

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

    // Check joinability
    const check = isMeetingJoinable(meeting);
    if (!check.canJoin && !isHost) {
      toast.error(check.reason || "Meeting is not currently joinable.");
      return;
    }

    // Check passcode if protected
    if (meeting.passcode && meeting.passcode !== passcode && !isHost) {
      toast.error("Invalid meeting passcode.");
      return;
    }

    if (audioOnly && localStream) {
      localStream.getVideoTracks().forEach((t) => (t.enabled = false));
      setIsVideoOff(true);
    }

    const myRole: ParticipantRole = isHost ? "host" : isAdmin ? "cohost" : "participant";
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
    if (localStream) {
      localStream.getAudioTracks().forEach((t) => (t.enabled = !next));
    }
    if (meeting && phase === "in_meeting") {
      await updateParticipant(meeting.id, myParticipantId, { isMuted: next });
    }
    toast.info(next ? "Microphone Muted" : "Microphone Active");
  };

  const handleToggleVideo = async () => {
    const next = !isVideoOff;
    setIsVideoOff(next);
    if (localStream) {
      localStream.getVideoTracks().forEach((t) => (t.enabled = !next));
    } else if (!next) {
      await requestMediaPermissions();
    }
    if (meeting && phase === "in_meeting") {
      await updateParticipant(meeting.id, myParticipantId, { isVideoOff: next });
    }
    toast.info(next ? "Camera Stopped" : "Camera Active");
  };

  const handleStartScreenShare = async (preferWindow: boolean = false) => {
    setShowScreenShareMenu(false);
    if (isScreenSharing) {
      stopMediaStream(screenStream);
      setScreenStream(null);
      setIsScreenSharing(false);
      if (meeting) updateParticipant(meeting.id, myParticipantId, { isScreenSharing: false });
      return;
    }

    try {
      const stream = await getDisplayMediaStream({ preferWindow, withAudio: true });
      if (!stream) return;
      setScreenStream(stream);
      setIsScreenSharing(true);

      if (screenVideoRef.current) {
        screenVideoRef.current.srcObject = stream;
        screenVideoRef.current.play().catch(() => {});
      }

      stream.getVideoTracks()[0].onended = () => {
        setIsScreenSharing(false);
        setScreenStream(null);
        if (meeting) updateParticipant(meeting.id, myParticipantId, { isScreenSharing: false });
      };

      if (meeting) updateParticipant(meeting.id, myParticipantId, { isScreenSharing: true });
      toast.success(preferWindow ? "Sharing Software / Window" : "Sharing Screen Presentation");
    } catch (err) {
      console.warn("Screen share cancelled or failed:", err);
    }
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatDraft.trim() || !meeting) return;
    const text = chatDraft.trim();
    setChatDraft("");
    const role: ParticipantRole = isHost ? "host" : isAdmin ? "cohost" : "participant";

    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const optimisticMsg: MeetingChatMessage = {
      id: tempId,
      meetingId: meeting.id,
      senderId: myParticipantId,
      senderName: displayName,
      senderRole: role,
      recipientId: chatRecipient || undefined,
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
        chatRecipient || undefined
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
        <div className="absolute inset-0 pointer-events-none z-15 border-2 border-pink-500/50 select-none">
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
        <div className="absolute inset-0 pointer-events-none z-15 flex items-center justify-center select-none">
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
        <div className="absolute inset-0 pointer-events-none z-15 border-2 border-blue-500/50 select-none">
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
        <div className="absolute inset-0 pointer-events-none z-15 border-2 border-red-500/50 select-none">
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
        <div className="absolute inset-0 pointer-events-none z-15 border-2 border-sky-500/50 select-none">
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
        <div className="absolute inset-0 pointer-events-none z-15 border-4 border-red-500 select-none">
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
        <div className="absolute inset-0 pointer-events-none z-15 grid grid-cols-3 grid-rows-3 border border-yellow-400/40 select-none">
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
        <div className="absolute inset-0 pointer-events-none z-15 border border-amber-400/40 select-none">
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
      updateParticipant(meeting.id, myParticipantId, { isHandRaised: next });
    }
    toast.info(next ? "Hand raised ✋" : "Hand lowered");
  };

  const handleLowerParticipantHand = (participantId: string) => {
    if (!meeting || !isHost) return;
    updateParticipant(meeting.id, participantId, { isHandRaised: false });
    toast.info("Hand lowered.");
  };

  const handleSpotlightParticipant = (participantId: string | null) => {
    setPinnedParticipantId((prev) => (prev === participantId ? null : participantId));
    if (participantId) {
      const p = meeting?.participants.find((x) => x.id === participantId);
      toast.info(`Spotlight: ${p?.displayName || "Participant"}`);
    } else {
      toast.info("Spotlight cleared. Grid view active.");
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

  const handleEndForAll = async () => {
    if (!meeting || !isHost) return;
    await endMeetingForAll(meeting.id);
    stopMediaStream(localStream);
    stopMediaStream(screenStream);
    setPhase("ended");
    toast.info("Meeting ended for all participants.");
  };

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
                        <p className="text-[11px] text-neutral-300 mt-0.5">
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
                <div className="absolute bottom-3 sm:bottom-4 left-1/2 transform -translate-x-1/2 flex items-center gap-2.5 sm:gap-3 bg-neutral-900/85 backdrop-blur-md px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-full border border-neutral-700 shadow-md">
                  <button
                    type="button"
                    onClick={handleToggleMic}
                    className={`p-2 sm:p-2.5 rounded-full text-xs sm:text-sm font-bold transition-colors ${
                      isMicMuted ? "bg-red-500 text-white" : "bg-neutral-800 text-white hover:bg-neutral-700"
                    }`}
                    title={isMicMuted ? "Unmute Microphone" : "Mute Microphone"}
                  >
                    {isMicMuted ? "🔇" : "🎙️"}
                  </button>
                  <button
                    type="button"
                    onClick={handleToggleVideo}
                    className={`p-2 sm:p-2.5 rounded-full text-xs sm:text-sm font-bold transition-colors ${
                      isVideoOff ? "bg-red-500 text-white" : "bg-neutral-800 text-white hover:bg-neutral-700"
                    }`}
                    title={isVideoOff ? "Turn Video On" : "Turn Video Off"}
                  >
                    {isVideoOff ? "🚫" : "📹"}
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
          </div>
        </div>

        {/* Mobile Setup Guide Modal */}
        {showPermissionGuide && (
          <div className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-[var(--panel)] border border-[var(--line-strong)] p-6 rounded-2xl shadow-2xl text-[var(--ink)] space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">📱</span>
                  <h3 className="font-display text-sm font-bold uppercase">Mobile Permission Guide</h3>
                </div>
                <button onClick={() => setShowPermissionGuide(false)} className="text-[var(--muted)] hover:text-[var(--ink)] text-sm">✕</button>
              </div>

              <div className="space-y-3 text-xs">
                <div className="p-3 bg-[var(--bg)] border border-[var(--line)] rounded-xl space-y-1.5">
                  <p className="font-bold text-[11px] uppercase flex items-center gap-1.5 text-cyan-400">
                    <span>🍎</span> iPhone / iPad (Safari)
                  </p>
                  <ol className="list-decimal list-inside space-y-1 text-[11px] text-[var(--muted)] leading-relaxed">
                    <li>Look at the top/bottom URL address bar in Safari.</li>
                    <li>Tap the <strong>"aA"</strong> or <strong>Lock icon (🔒)</strong> next to the web address.</li>
                    <li>Select <strong>Website Settings</strong>.</li>
                    <li>Set <strong>Camera</strong> ➔ <strong>Allow</strong> &amp; <strong>Microphone</strong> ➔ <strong>Allow</strong>.</li>
                    <li>Tap <strong>Done</strong>, then tap <strong>"Allow Media Access"</strong> button.</li>
                  </ol>
                </div>

                <div className="p-3 bg-[var(--bg)] border border-[var(--line)] rounded-xl space-y-1.5">
                  <p className="font-bold text-[11px] uppercase flex items-center gap-1.5 text-emerald-400">
                    <span>🤖</span> Android (Google Chrome)
                  </p>
                  <ol className="list-decimal list-inside space-y-1 text-[11px] text-[var(--muted)] leading-relaxed">
                    <li>Tap the <strong>Lock (🔒)</strong> or <strong>Tune (🎛️)</strong> icon to the left of the URL.</li>
                    <li>Tap <strong>Permissions</strong>.</li>
                    <li>Toggle ON both <strong>Camera</strong> and <strong>Microphone</strong>.</li>
                    <li>Return to the page and tap <strong>"Allow Media Access"</strong>.</li>
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

      {/* Floating Waiting Room Admission Banner */}
      {isHost && waitingParticipants.length > 0 && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 bg-amber-950/95 border-2 border-amber-500 backdrop-blur-md px-4 py-3 rounded-2xl shadow-2xl flex flex-wrap items-center justify-between gap-4 max-w-lg w-[92%] animate-in slide-in-from-top-4 duration-200">
          <div className="flex items-center gap-3">
            <span className="text-2xl animate-bounce">🔔</span>
            <div>
              <h4 className="font-display text-xs font-bold uppercase text-amber-300">
                {waitingParticipants.length} Person Waiting in Lobby
              </h4>
              <p className="font-meta text-[9.5px] text-neutral-300 truncate max-w-xs">
                {waitingParticipants.map((p) => p.displayName).join(", ")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {waitingParticipants.map((p) => (
              <button
                key={p.id}
                onClick={() => admitParticipant(meeting.id, p.id)}
                className="btn btn-dept !py-1.5 !px-3 font-display text-[10px] font-bold uppercase"
              >
                ✓ Admit {p.displayName.split(" ")[0]}
              </button>
            ))}
            {waitingParticipants.length > 1 && (
              <button
                onClick={() => admitAllParticipants(meeting.id)}
                className="font-meta text-[10px] px-3 py-1.5 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400"
              >
                Admit All
              </button>
            )}
          </div>
        </div>
      )}

      {/* Floating Attention Alert for Raised Hands */}
      {activeParticipants.some((p) => p.isHandRaised) && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 bg-neutral-900/95 border-2 border-amber-400 backdrop-blur-md px-4 py-2.5 rounded-2xl shadow-2xl flex items-center justify-between gap-4 max-w-md w-[92%] animate-in slide-in-from-top-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-xl animate-bounce">✋</span>
            <div className="min-w-0">
              <p className="font-display text-xs font-bold uppercase text-amber-300 truncate">
                {activeParticipants.filter((p) => p.isHandRaised).map((p) => p.displayName).join(", ")}
              </p>
              <p className="font-meta text-[8.5px] text-neutral-400">Raised hand to speak</p>
            </div>
          </div>

          {isHost && (
            <button
              onClick={() => {
                activeParticipants
                  .filter((p) => p.isHandRaised)
                  .forEach((p) => handleLowerParticipantHand(p.id));
              }}
              className="font-meta text-[9px] px-2.5 py-1 bg-amber-400 text-black font-bold rounded-lg hover:bg-amber-300 shrink-0"
            >
              Lower Hands
            </button>
          )}
        </div>
      )}

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
      <div className="h-12 sm:h-14 px-3 sm:px-6 border-b border-neutral-800 bg-neutral-900/90 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <h2 className="font-display text-sm font-bold uppercase tracking-wider truncate max-w-xs sm:max-w-md">
            {meeting.title}
          </h2>
          <span className="font-meta text-[9px] px-2 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-neutral-400 hidden sm:inline">
            {activeParticipants.length} Connected
          </span>
          {meeting.liveProofing?.active && (
            <button
              type="button"
              onClick={() => setActiveDrawer("proofing")}
              className={`font-meta text-[9px] px-2 py-0.5 rounded border flex items-center gap-1 transition-colors ${
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
            <span className="font-meta text-[9px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center gap-1">
              <span>⭐</span> Spotlight View
            </span>
          )}
          {meeting.meetingLocked && (
            <span className="font-meta text-[9px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40">
              🔒 Locked
            </span>
          )}
        </div>

        {/* Top Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Host Auto-Spotlight Toggle */}
          {isHost && (
            <button
              type="button"
              onClick={() => {
                const next = !autoSpotlightActiveSpeaker;
                setAutoSpotlightActiveSpeaker(next);
                toast.info(next ? "Auto-Spotlight Active Speaker: ON" : "Auto-Spotlight: OFF");
              }}
              className={`font-meta text-[9px] px-2.5 py-1 rounded-full border transition-all hidden md:flex items-center gap-1.5 ${
                autoSpotlightActiveSpeaker
                  ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-300"
                  : "bg-neutral-800 border-neutral-700 text-neutral-400 hover:text-white"
              }`}
              title="Automatically feature who is speaking"
            >
              <span>🗣️</span> {autoSpotlightActiveSpeaker ? "Auto-Spotlight ON" : "Auto-Spotlight"}
            </button>
          )}

          {/* Live Proofing Button */}
          <button
            type="button"
            onClick={() => setActiveDrawer(activeDrawer === "proofing" ? "none" : "proofing")}
            className={`font-meta text-[10px] px-3 py-1.5 rounded-full border flex items-center gap-1.5 transition-all ${
              activeDrawer === "proofing"
                ? "bg-[var(--dept)] text-[var(--on-dept)] font-bold border-[var(--dept)]"
                : "bg-neutral-800 border-neutral-700 text-neutral-300 hover:text-white"
            }`}
          >
            <span>🎨</span> <span className="hidden sm:inline">Live Proofing</span>
          </button>

          {/* Fullscreen Toggle */}
          <button
            type="button"
            onClick={handleToggleFullscreen}
            className="w-8 h-8 rounded-full bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 flex items-center justify-center text-xs text-neutral-300 hover:text-white transition-colors"
            title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
          >
            {isFullscreen ? "↙️" : "⛶"}
          </button>

          <button
            onClick={() => setShareModalOpen(true)}
            className="font-meta text-[10px] px-3 py-1.5 rounded-full bg-[var(--dept)] text-[var(--on-dept)] font-bold flex items-center gap-1.5 hover:brightness-110 shadow-sm transition-all"
          >
            <span>🔗</span> <span className="hidden sm:inline">Share</span>
          </button>
        </div>
      </div>

      {/* Screen Share Mode Selection Modal */}
      {showScreenShareMenu && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[var(--panel)] border border-[var(--line-strong)] p-5 rounded-2xl shadow-2xl text-[var(--ink)] space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xs font-bold uppercase tracking-wider">Choose Screen Share Mode</h3>
              <button onClick={() => setShowScreenShareMenu(false)} className="text-neutral-400 hover:text-white text-sm">✕</button>
            </div>
            <p className="text-[11px] text-[var(--muted)]">
              Select whether you want to present a specific application window or your entire desktop.
            </p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => handleStartScreenShare(true)}
                className="w-full p-3 rounded-xl border border-[var(--line)] hover:border-[var(--dept)] bg-[var(--bg)] text-left flex items-center gap-3 transition-colors group"
              >
                <span className="text-2xl">🖼️</span>
                <div>
                  <p className="font-display text-xs font-bold uppercase group-hover:text-[var(--dept)]">Software / Application Window</p>
                  <p className="font-meta text-[9.5px] text-[var(--muted)]">Share Figma, Photoshop, Illustrator, Premiere, or browser</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleStartScreenShare(false)}
                className="w-full p-3 rounded-xl border border-[var(--line)] hover:border-[var(--dept)] bg-[var(--bg)] text-left flex items-center gap-3 transition-colors group"
              >
                <span className="text-2xl">🖥️</span>
                <div>
                  <p className="font-display text-xs font-bold uppercase group-hover:text-[var(--dept)]">Entire Screen / Display</p>
                  <p className="font-meta text-[9.5px] text-[var(--muted)]">Present your complete monitor display with audio</p>
                </div>
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
      <div className="flex-1 flex overflow-hidden relative">
        {/* Stage & Video Tiles */}
        <div className="flex-1 p-2 sm:p-4 flex flex-col gap-4 overflow-y-auto">
          {/* Screen Share Stage (if active) */}
          {isScreenSharing && (
            <div className="relative w-full aspect-video max-h-[55vh] bg-black rounded-2xl overflow-hidden border border-neutral-700 shadow-2xl flex items-center justify-center">
              <video ref={screenVideoRef} autoPlay playsInline className="w-full h-full object-contain" />
              <div className="absolute top-3 left-3 bg-neutral-900/80 px-3 py-1 rounded-full border border-neutral-700 font-meta text-[10px] flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
                <span>Screen Presentation by {displayName}</span>
              </div>
              <button
                onClick={handleToggleFullscreen}
                className="absolute top-3 right-3 p-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-xs"
                title="Fullscreen presentation"
              >
                ⛶
              </button>
            </div>
          )}

          {/* SPOTLIGHT MODE: If someone is pinned, render Spotlight Stage + Filmstrip */}
          {pinnedParticipantId ? (
            <div className="flex-1 flex flex-col gap-4">
              {/* Main Spotlighted Speaker */}
              {(() => {
                const isLocal = pinnedParticipantId === myParticipantId || pinnedParticipantId === effectiveMyId;
                const p = isLocal
                  ? { id: myParticipantId, displayName: `${displayName} (You)`, isMuted: isMicMuted, isHandRaised, role: isHost ? "host" : "participant" }
                  : meeting.participants.find((x) => x.id === pinnedParticipantId);

                const rStream = !isLocal && p ? remoteStreams.get(p.id) : null;
                const hasVideo = isLocal ? (!isVideoOff && localStream) : (rStream && rStream.getVideoTracks().some((t) => t.enabled && t.readyState === "live"));

                return (
                  <div className={`relative w-full aspect-video max-h-[60vh] mx-auto bg-neutral-900 rounded-2xl overflow-hidden border-2 border-cyan-500 shadow-2xl flex items-center justify-center ${
                    p?.isHandRaised ? "ring-4 ring-amber-400 shadow-[0_0_35px_rgba(245,158,11,0.85)] animate-pulse" : ""
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
          ) : (
            /* STANDARD PARTICIPANT VIDEO GRID */
            <div className={`grid gap-4 flex-1 ${
              activeParticipants.length <= 1 ? "grid-cols-1 max-w-3xl mx-auto w-full" :
              activeParticipants.length === 2 ? "grid-cols-1 sm:grid-cols-2" :
              activeParticipants.length <= 4 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4"
            }`}>
              {/* My Local Tile */}
              <div className={`group relative aspect-video bg-neutral-900 rounded-2xl overflow-hidden border transition-all flex items-center justify-center ${
                isHandRaised
                  ? "ring-4 ring-amber-400 shadow-[0_0_35px_rgba(245,158,11,0.85)] border-amber-400 animate-pulse"
                  : "border-neutral-800 shadow-md"
              }`}>
                {!isVideoOff && localStream ? (
                  <VideoTile stream={localStream} muted={true} isMirrored={true} />
                ) : (
                  <div className="flex flex-col items-center justify-center p-4 text-center">
                    <div className="w-16 h-16 rounded-full bg-[var(--dept)]/20 border border-[var(--dept)] flex items-center justify-center text-xl font-bold dept-accent mb-2">
                      {displayName.slice(0, 2).toUpperCase()}
                    </div>
                    <button
                      type="button"
                      onClick={handleToggleVideo}
                      className="font-meta text-[9.5px] px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-300 hover:text-white rounded-lg flex items-center gap-1.5 transition-colors shadow-sm"
                    >
                      <span>📹</span> Enable Camera
                    </button>
                  </div>
                )}

                {/* Tile Hover Controls */}
                <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-black/60 backdrop-blur-sm p-1 rounded-lg">
                  <button
                    onClick={() => handleSpotlightParticipant(myParticipantId)}
                    className="font-meta text-[8.5px] px-2 py-0.5 rounded bg-neutral-800 hover:bg-cyan-600 text-white"
                    title="Spotlight your video"
                  >
                    ⭐ Pin
                  </button>
                  <button
                    onClick={handleToggleFullscreen}
                    className="font-meta text-[8.5px] px-1.5 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 text-white"
                    title="Fullscreen"
                  >
                    ⛶
                  </button>
                </div>

                {/* Tile Badges */}
                <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm px-2.5 py-1 rounded-lg text-[10px] font-display font-bold uppercase flex items-center gap-2">
                  <span>{displayName} (You)</span>
                  {isHost && <span className="text-amber-400 text-[8px] bg-amber-400/20 px-1 rounded">HOST</span>}
                </div>

                <div className="absolute top-2 right-2 flex items-center gap-1.5">
                  {isHandRaised && (
                    <span className="bg-amber-500 text-black px-2 py-0.5 rounded-full text-[9px] font-extrabold flex items-center gap-1 animate-bounce" title="Hand Raised">
                      ✋ RAISED
                    </span>
                  )}
                  {isMicMuted && (
                    <span className="bg-red-500/80 px-1.5 py-0.5 rounded text-[10px]" title="Muted">
                      🔇
                    </span>
                  )}
                </div>
              </div>

              {/* Other Connected Participants */}
              {otherConnectedParticipants.map((p) => {
                const rStream = remoteStreams.get(p.id);
                const hasVideo = rStream && rStream.getVideoTracks().some((t) => t.enabled && t.readyState === "live") && !p.isVideoOff;

                return (
                  <div
                    key={p.id}
                    className={`group relative aspect-video bg-neutral-900 rounded-2xl overflow-hidden border transition-all flex items-center justify-center ${
                      p.isHandRaised
                        ? "ring-4 ring-amber-400 shadow-[0_0_35px_rgba(245,158,11,0.85)] border-amber-400 animate-pulse"
                        : "border-neutral-800 shadow-md"
                    }`}
                  >
                    {hasVideo && rStream ? (
                      <VideoTile stream={rStream} muted={false} />
                    ) : (
                      <div className="text-center">
                        <div className="w-16 h-16 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-xl font-bold text-neutral-300 mx-auto mb-1">
                          {p.displayName.slice(0, 2).toUpperCase()}
                        </div>
                        <p className="font-meta text-[9px] text-neutral-500">Audio Active</p>
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
                        onClick={() => handleSpotlightParticipant(p.id)}
                        className="font-meta text-[8.5px] px-2 py-0.5 rounded bg-neutral-800 hover:bg-cyan-600 text-white"
                        title="Spotlight participant"
                      >
                        ⭐ Spotlight
                      </button>
                    </div>

                    <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm px-2.5 py-1 rounded-lg text-[10px] font-display font-bold uppercase flex items-center gap-2">
                      <span>{p.displayName}</span>
                      {p.role === "host" && <span className="text-amber-400 text-[8px] bg-amber-400/20 px-1 rounded">HOST</span>}
                      {p.role === "cohost" && <span className="text-cyan-400 text-[8px] bg-cyan-400/20 px-1 rounded">CO-HOST</span>}
                    </div>

                    <div className="absolute top-2 right-2 flex items-center gap-1.5">
                      {p.isHandRaised && (
                        <div className="flex items-center gap-1 bg-amber-500 text-black px-2 py-0.5 rounded-full text-[9px] font-extrabold animate-bounce">
                          <span>✋ RAISED</span>
                          {isHost && (
                            <button
                              onClick={() => handleLowerParticipantHand(p.id)}
                              className="ml-1 bg-black/20 hover:bg-black/40 rounded px-1"
                              title="Lower Hand"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      )}
                      {p.isMuted && (
                        <span className="bg-red-500/80 px-1.5 py-0.5 rounded text-[10px]">
                          🔇
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
                {/* Chat Message Stream */}
                <div className="flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4 space-y-3 text-xs">
                  {chatMessages.length === 0 ? (
                    <div className="text-center py-12 px-4 space-y-2">
                      <span className="text-3xl">💬</span>
                      <p className="font-display text-xs font-bold uppercase text-neutral-300">
                        In-Meeting Public Chat
                      </p>
                      <p className="font-meta text-[10px] text-neutral-500 max-w-xs mx-auto">
                        Messages sent here are visible to all admitted attendees in this session.
                      </p>
                    </div>
                  ) : (
                    chatMessages.map((msg) => {
                      const isMe = msg.senderId === myParticipantId;
                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${isMe ? "items-end" : "items-start"} max-w-[92%] ${isMe ? "ml-auto" : "mr-auto"}`}
                        >
                          <div className="flex items-center gap-1.5 mb-1 px-1">
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
                                : "bg-neutral-800/90 border border-neutral-700/60 text-neutral-200 rounded-tl-none"
                            }`}
                          >
                            <p className="whitespace-pre-wrap">{msg.message}</p>
                          </div>
                        </div>
                      );
                    })
                  )}
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
              <div className="flex-1 p-4 overflow-y-auto space-y-4 text-xs">
                {/* Proofing Status & Broadcaster Banner */}
                <div className="p-3 bg-neutral-800/90 rounded-xl border border-neutral-700 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="font-meta text-[9px] uppercase font-bold text-[var(--dept)]">
                        Live Proofing Canvas
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {isHost && (
                        <button
                          type="button"
                          onClick={() => setShowUploadModal(true)}
                          className="font-meta text-[9px] px-2.5 py-1 bg-[var(--dept)] text-black rounded font-bold hover:brightness-110 flex items-center gap-1 shadow-sm"
                          title="Upload new deliverable or concept image"
                        >
                          <span>📁</span> + Upload Artwork
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setIsProofingMaximized(true)}
                        className="font-meta text-[9px] px-2 py-1 bg-neutral-700 hover:bg-neutral-600 rounded text-white font-bold flex items-center gap-1"
                        title="Maximize Canvas"
                      >
                        <span>⛶</span> Maximize
                      </button>

                      {isHost && (
                        <button
                          type="button"
                          onClick={handleToggleProofingSession}
                          className={`font-meta text-[9px] px-2 py-1 rounded font-bold transition-all ${
                            meeting.liveProofing?.active
                              ? "bg-red-500/20 text-red-300 border border-red-500/40"
                              : "bg-neutral-700 text-neutral-300 hover:text-white"
                          }`}
                        >
                          {meeting.liveProofing?.active ? "Stop" : "Broadcast"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Thumbnail Strip for All Deliverables */}
                  <div className="pt-2 border-t border-neutral-700/60">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-meta text-[8.5px] uppercase font-bold text-neutral-400">
                        Deliverable #{proofingIndex + 1} of {proofingMockups.length}
                      </span>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => handleSelectProof(proofingIndex - 1)}
                          disabled={proofingIndex === 0}
                          className="px-2 py-0.5 rounded bg-neutral-700 hover:bg-neutral-600 disabled:opacity-40 text-xs font-bold"
                        >
                          ←
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSelectProof(proofingIndex + 1)}
                          disabled={proofingIndex === proofingMockups.length - 1}
                          className="px-2 py-0.5 rounded bg-neutral-700 hover:bg-neutral-600 disabled:opacity-40 text-xs font-bold"
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
                          className={`relative w-16 h-11 shrink-0 rounded-lg overflow-hidden border-2 cursor-pointer transition-all ${
                            idx === proofingIndex
                              ? "border-[var(--dept)] ring-2 ring-[var(--dept)]/30 scale-105 shadow-md"
                              : "border-neutral-700 opacity-60 hover:opacity-100"
                          }`}
                        >
                          <img src={m.image} alt={m.title} className="w-full h-full object-cover" />
                          <span className="absolute bottom-0 inset-x-0 bg-black/80 text-white font-mono text-[7px] text-center truncate px-0.5">
                            #{idx + 1}
                          </span>
                        </div>
                      ))}
                      {isHost && (
                        <button
                          type="button"
                          onClick={() => setShowUploadModal(true)}
                          className="w-16 h-11 shrink-0 rounded-lg border-2 border-dashed border-neutral-700 hover:border-[var(--dept)] bg-neutral-900/50 flex flex-col items-center justify-center text-neutral-400 hover:text-[var(--dept)] text-[9px] font-bold"
                          title="Upload new deliverable"
                        >
                          <span className="text-sm">+</span>
                          <span>Upload</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-start justify-between gap-2 pt-1 border-t border-neutral-700/60">
                    <div className="min-w-0">
                      <h4 className="font-display text-xs font-bold uppercase text-white truncate">
                        {activeMockup.title}
                      </h4>
                      <p className="font-meta text-[9px] text-neutral-400">
                        Category: {activeMockup.category} {activeMockup.uploadedBy ? `· by ${activeMockup.uploadedBy}` : ""}
                      </p>
                    </div>

                    {isHost && proofingMockups.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveArtwork(activeMockup.id)}
                        className="text-red-400 hover:text-red-300 font-meta text-[9px] px-1.5 py-0.5 rounded border border-red-500/30 hover:bg-red-500/20 shrink-0"
                        title="Remove this deliverable from meeting canvas"
                      >
                        🗑️ Delete
                      </button>
                    )}
                  </div>

                  {/* Clean Deliverable Header & Quick Actions */}
                  <div className="flex items-center justify-between gap-2 p-2 bg-neutral-900/90 rounded-xl border border-neutral-700/80">
                    <div className="min-w-0">
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
                        Deliverable {proofingIndex + 1} of {proofingMockups.length} · {activeMockup.category}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setShowApprovedArchiveModal(true)}
                        className="px-2 py-1 rounded-lg bg-cyan-950/70 hover:bg-cyan-900 text-cyan-300 border border-cyan-500/30 text-[9px] font-bold flex items-center gap-1"
                        title="View Approved Deliverables & Preserved Pins"
                      >
                        <span>📜</span>
                        <span className="hidden sm:inline">Sign-Offs</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setCompareMode(true)}
                        className="px-2 py-1 rounded-lg bg-purple-950/70 hover:bg-purple-900 text-purple-300 border border-purple-500/30 text-[9px] font-bold flex items-center gap-1"
                        title="A/B Split Version Comparison"
                      >
                        <span>↔️</span>
                        <span className="hidden sm:inline">A/B Diff</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setIsProofingMaximized(true)}
                        className="px-2 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white text-[9px] font-bold flex items-center gap-1"
                        title="Open Theater Mode / Fullscreen"
                      >
                        <span>⛶</span>
                        <span className="hidden sm:inline">Theater</span>
                      </button>
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
                      <div className="absolute top-2 inset-x-2 z-25 bg-emerald-950/90 border border-emerald-500/60 rounded-xl px-2.5 py-1 flex items-center justify-between text-emerald-200 font-meta text-[8.5px] shadow-lg backdrop-blur-xs">
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
                  {activeParticipants.map((p) => (
                    <div
                      key={p.id}
                      className={`p-2.5 rounded-lg bg-neutral-800 border flex items-center justify-between gap-2 ${
                        p.isHandRaised ? "border-amber-400 ring-1 ring-amber-400" : "border-neutral-700"
                      }`}
                    >
                      <div className="truncate">
                        <p className="font-bold text-xs truncate flex items-center gap-1.5">
                          <span>{p.displayName} {p.id === myParticipantId ? "(You)" : ""}</span>
                          {p.isHandRaised && <span className="text-amber-400">✋</span>}
                        </p>
                        <p className="font-meta text-[9px] text-neutral-400 capitalize">
                          {p.role} · {p.isMuted ? "Muted" : "Active"}
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
                        {isHost && p.id !== myParticipantId && (
                          <>
                            <button
                              onClick={() => updateParticipant(meeting.id, p.id, { isMuted: !p.isMuted })}
                              className="p-1 rounded bg-neutral-700 text-[10px] hover:bg-neutral-600"
                              title={p.isMuted ? "Unmute" : "Mute"}
                            >
                              {p.isMuted ? "🎙️" : "🔇"}
                            </button>
                            <button
                              onClick={() => removeParticipant(meeting.id, p.id)}
                              className="p-1 rounded bg-red-600/80 text-[10px] hover:bg-red-500"
                              title="Remove from meeting"
                            >
                              🚫
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
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

            {/* DRAWER: BREAKOUT ROOMS */}
            {activeDrawer === "breakouts" && (
              <div className="flex-1 p-4 overflow-y-auto space-y-4 text-xs">
                {isHost ? (
                  <div className="space-y-3">
                    <p className="text-neutral-400 text-xs">
                      Split participants into smaller creative breakout sessions.
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newRoomName}
                        onChange={(e) => setNewRoomName(e.target.value)}
                        placeholder="Room name (e.g. Brainstorm 1)"
                        className="flex-1 bg-neutral-800 border border-neutral-700 px-3 py-1.5 rounded text-xs outline-none text-white placeholder-neutral-500"
                      />
                      <button
                        onClick={() => {
                          if (!newRoomName.trim()) return;
                          toast.success(`Breakout room "${newRoomName}" created.`);
                          setNewRoomName("");
                        }}
                        className="btn btn-dept !py-1.5 !px-3 font-meta text-[10px]"
                      >
                        Create
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-neutral-400 text-center py-6 text-xs">
                    The host manages breakout rooms. You will be invited if assigned.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Control Bar */}
      <div className="h-16 sm:h-20 px-2 sm:px-6 border-t border-neutral-800 bg-neutral-900/95 flex items-center justify-between shrink-0 gap-1.5 overflow-x-auto">
        {/* Left: Audio, Video & Screen Share */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          <button
            onClick={handleToggleMic}
            className={`flex flex-col items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-xl text-xs font-bold transition-all shrink-0 ${
              isMicMuted ? "bg-red-500/20 text-red-400 border border-red-500/40" : "bg-neutral-800 text-white hover:bg-neutral-700"
            }`}
            title={isMicMuted ? "Unmute Mic" : "Mute Mic"}
          >
            <span className="text-sm sm:text-base">{isMicMuted ? "🔇" : "🎙️"}</span>
            <span className="font-meta text-[7px] sm:text-[8px] uppercase mt-0.5">{isMicMuted ? "Unmute" : "Mute"}</span>
          </button>

          <button
            onClick={handleToggleVideo}
            className={`flex flex-col items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-xl text-xs font-bold transition-all shrink-0 ${
              isVideoOff ? "bg-red-500/20 text-red-400 border border-red-500/40" : "bg-neutral-800 text-white hover:bg-neutral-700"
            }`}
            title={isVideoOff ? "Start Video" : "Stop Video"}
          >
            <span className="text-sm sm:text-base">{isVideoOff ? "🚫" : "📹"}</span>
            <span className="font-meta text-[7px] sm:text-[8px] uppercase mt-0.5">{isVideoOff ? "Start" : "Stop"}</span>
          </button>

          <button
            onClick={() => {
              if (isScreenSharing) {
                handleStartScreenShare(false);
              } else {
                setShowScreenShareMenu(true);
              }
            }}
            className={`flex flex-col items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-xl text-xs font-bold transition-all shrink-0 ${
              isScreenSharing ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40" : "bg-neutral-800 text-white hover:bg-neutral-700"
            }`}
            title={isScreenSharing ? "Stop Screen Share" : "Share Window or Screen"}
          >
            <span className="text-sm sm:text-base">🖥️</span>
            <span className="font-meta text-[7px] sm:text-[8px] uppercase mt-0.5">{isScreenSharing ? "Sharing" : "Share"}</span>
          </button>
        </div>

        {/* Center: Collaboration Tools (Reactions, Hand, Proofing, Chat, People, AI) */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {/* Reaction Triggers */}
          <div className="hidden md:flex items-center gap-1 bg-neutral-800/80 p-1.5 rounded-xl border border-neutral-700/60">
            <button onClick={() => handleSendReaction("thumbs_up")} className="p-1.5 rounded hover:bg-neutral-700 text-sm" title="Thumbs Up">👍</button>
            <button onClick={() => handleSendReaction("heart")} className="p-1.5 rounded hover:bg-neutral-700 text-sm" title="Heart">❤️</button>
            <button onClick={() => handleSendReaction("clap")} className="p-1.5 rounded hover:bg-neutral-700 text-sm" title="Clap">👏</button>
            <button onClick={() => handleSendReaction("celebrate")} className="p-1.5 rounded hover:bg-neutral-700 text-sm" title="Celebrate">🎉</button>
            <button onClick={() => handleSendReaction("laugh")} className="p-1.5 rounded hover:bg-neutral-700 text-sm" title="Laugh">😂</button>
          </div>

          <button
            onClick={handleToggleRaiseHand}
            className={`flex flex-col items-center justify-center w-10 h-10 sm:w-11 sm:h-11 rounded-xl text-xs font-bold transition-all shrink-0 ${
              isHandRaised ? "bg-amber-500/25 text-amber-300 border-2 border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.5)] animate-pulse" : "bg-neutral-800 text-white hover:bg-neutral-700"
            }`}
            title="Raise / Lower Hand"
          >
            <span className="text-sm sm:text-base">✋</span>
            <span className="font-meta text-[7px] sm:text-[8px] uppercase mt-0.5">Hand</span>
          </button>

          <button
            onClick={() => setActiveDrawer(activeDrawer === "proofing" ? "none" : "proofing")}
            className={`flex flex-col items-center justify-center w-10 h-10 sm:w-11 sm:h-11 rounded-xl text-xs font-bold transition-all shrink-0 ${
              activeDrawer === "proofing" ? "bg-[var(--dept)] text-black" : "bg-neutral-800 text-white hover:bg-neutral-700"
            }`}
            title="Live Proofing & Concepts"
          >
            <span className="text-sm sm:text-base">🎨</span>
            <span className="font-meta text-[7px] sm:text-[8px] uppercase mt-0.5">Proof</span>
          </button>

          <button
            onClick={() => {
              const next = activeDrawer === "chat" ? "none" : "chat";
              setActiveDrawer(next);
              if (next === "chat") setUnreadChatCount(0);
            }}
            className={`relative flex flex-col items-center justify-center w-10 h-10 sm:w-11 sm:h-11 rounded-xl text-xs font-bold transition-all shrink-0 ${
              activeDrawer === "chat" ? "bg-[var(--dept)] text-black" : "bg-neutral-800 text-white hover:bg-neutral-700"
            }`}
            title="Toggle Chat"
          >
            {unreadChatCount > 0 && activeDrawer !== "chat" && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold h-4 min-w-[16px] px-1 rounded-full flex items-center justify-center animate-bounce shadow-md">
                {unreadChatCount}
              </span>
            )}
            <span className="text-sm sm:text-base">💬</span>
            <span className="font-meta text-[7px] sm:text-[8px] uppercase mt-0.5">Chat</span>
          </button>

          <button
            onClick={() => setActiveDrawer(activeDrawer === "participants" ? "none" : "participants")}
            className={`relative flex flex-col items-center justify-center w-10 h-10 sm:w-11 sm:h-11 rounded-xl text-xs font-bold transition-all shrink-0 ${
              activeDrawer === "participants" ? "bg-[var(--dept)] text-black" : "bg-neutral-800 text-white hover:bg-neutral-700"
            }`}
            title="Toggle Participants"
          >
            {isHost && waitingParticipants.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-amber-400 text-black text-[9px] font-extrabold h-4 min-w-[16px] px-1 rounded-full flex items-center justify-center animate-bounce shadow-md">
                {waitingParticipants.length}
              </span>
            )}
            <span className="text-sm sm:text-base">👥</span>
            <span className="font-meta text-[7px] sm:text-[8px] uppercase mt-0.5">People</span>
          </button>

          <button
            onClick={() => setActiveDrawer(activeDrawer === "intelligence" ? "none" : "intelligence")}
            className={`flex flex-col items-center justify-center w-10 h-10 sm:w-11 sm:h-11 rounded-xl text-xs font-bold transition-all shrink-0 ${
              activeDrawer === "intelligence" ? "bg-[var(--dept)] text-black" : "bg-neutral-800 text-white hover:bg-neutral-700"
            }`}
            title="AI Meeting Intelligence"
          >
            <span className="text-sm sm:text-base">✨</span>
            <span className="font-meta text-[7px] sm:text-[8px] uppercase mt-0.5">AI</span>
          </button>
        </div>

        {/* Right: Fullscreen & Leave / End Meeting */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            onClick={handleToggleFullscreen}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white flex items-center justify-center text-xs"
            title="Fullscreen"
          >
            {isFullscreen ? "↙️" : "⛶"}
          </button>

          {isHost ? (
            <button
              onClick={handleEndForAll}
              className="px-2.5 sm:px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-display text-[10px] sm:text-xs font-bold uppercase rounded-xl transition-colors shadow-sm"
            >
              End
            </button>
          ) : (
            <button
              onClick={handleLeaveMeeting}
              className="px-2.5 sm:px-4 py-2 bg-red-600/80 hover:bg-red-500 text-white font-display text-[10px] sm:text-xs font-bold uppercase rounded-xl transition-colors"
            >
              Leave
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
        <div className="fixed inset-0 z-[140] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-100">
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
        <div className="fixed inset-0 z-[140] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-100">
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
        <div className="fixed inset-0 z-[160] bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-100 select-none">
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
    </div>
  );
}
