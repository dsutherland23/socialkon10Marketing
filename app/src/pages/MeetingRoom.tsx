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
  generateMeetingIntelligence,
  isMeetingJoinable,
  getMeetingShareDetails,
  sendWebRTCSignal,
  subscribeToWebRTCSignals,
  downloadCalendarIcs,
  normalizeRoomCode,
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
  const [activeDrawer, setActiveDrawer] = useState<"none" | "chat" | "participants" | "intelligence" | "breakouts">("none");
  const [chatMessages, setChatMessages] = useState<MeetingChatMessage[]>([]);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const prevChatCount = useRef(0);
  const [chatDraft, setChatDraft] = useState("");
  const [chatRecipient] = useState<string>(""); // "" = everyone
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [floatingReactions, setFloatingReactions] = useState<{ id: string; emoji: string; x: number }[]>([]);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);

  const [showPermissionGuide, setShowPermissionGuide] = useState(false);
  const [isRequestingMedia, setIsRequestingMedia] = useState(false);

  // Breakout Rooms
  const [newRoomName, setNewRoomName] = useState("");

  const isHost = meeting ? (meeting.hostEmail.toLowerCase() === user?.email?.toLowerCase() || isAdmin) : false;

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

  // 2. Refresh available media devices on load
  useEffect(() => {
    getMediaDevices().then((devs) => {
      setDevices(devs);
      if (devs.audioInputs.length > 0) setSelectedAudioInput(devs.audioInputs[0].deviceId);
      if (devs.videoInputs.length > 0) setSelectedVideoInput(devs.videoInputs[0].deviceId);
    });
  }, []);

  // 3. Acquire Local User Media (Persistent across Lobby & Meeting)
  const requestMediaPermissions = async () => {
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
      toast.success("Camera & microphone connected!");
    } catch (err: any) {
      console.warn("Hardware media notice:", err);
      const errMsg = err?.message || String(err);
      const isBlocked = errMsg.includes("denied") || errMsg.includes("not allowed") || errMsg.includes("NotAllowedError") || errMsg.includes("Permission");
      setHardwareError(
        isBlocked
          ? "Permission blocked in browser settings. Follow the mobile guide below to enable camera access."
          : "Camera access notice: Tap 'Guide' to allow permissions in your address bar."
      );
      setShowPermissionGuide(true);
      toast.error("Camera access needed. Follow the on-screen steps.");
    } finally {
      setIsRequestingMedia(false);
    }
  };

  useEffect(() => {
    if (phase === "ended" || !localStream) return;
    requestMediaPermissions();
  }, [selectedAudioInput, selectedVideoInput]);

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

  // 6. Watch Participant Status changes (e.g. host admits or removes participant)
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

  // 7. Watch for incoming Waiting Room participants (Host Doorbell Notification)
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

  // Handlers
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

    const participantData: MeetingParticipant = {
      id: myParticipantId,
      meetingId: meeting.id,
      userId: user?.uid,
      email: user?.email || `${displayName.toLowerCase().replace(/\s+/g, ".")}@guest.local`,
      displayName: displayName.trim() || "Participant",
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

    await updateParticipant(meeting.id, myParticipantId, participantData);

    if (initialStatus === "waiting") {
      setPhase("waiting_room");
      toast.info("You are in the waiting room. The host will admit you shortly.");
    } else {
      setPhase("in_meeting");
      toast.success(`Connected to "${meeting.title}"`);
    }
  };

  const handleToggleMic = async () => {
    if (!localStream || localStream.getAudioTracks().length === 0) {
      await requestMediaPermissions();
      return;
    }
    const next = !isMicMuted;
    setIsMicMuted(next);
    localStream.getAudioTracks().forEach((t) => (t.enabled = !next));
    if (meeting && phase === "in_meeting") {
      updateParticipant(meeting.id, myParticipantId, { isMuted: next });
    }
  };

  const handleToggleVideo = async () => {
    if (!localStream || localStream.getVideoTracks().length === 0) {
      await requestMediaPermissions();
      return;
    }
    const next = !isVideoOff;
    setIsVideoOff(next);
    localStream.getVideoTracks().forEach((t) => (t.enabled = !next));
    if (meeting && phase === "in_meeting") {
      updateParticipant(meeting.id, myParticipantId, { isVideoOff: next });
    }
  };

  const handleToggleScreenShare = async () => {
    if (isScreenSharing) {
      stopMediaStream(screenStream);
      setScreenStream(null);
      setIsScreenSharing(false);
      if (meeting) updateParticipant(meeting.id, myParticipantId, { isScreenSharing: false });
      return;
    }

    try {
      const stream = await getDisplayMediaStream();
      setScreenStream(stream);
      setIsScreenSharing(true);
      if (screenVideoRef.current) screenVideoRef.current.srcObject = stream;

      stream.getVideoTracks()[0].onended = () => {
        setIsScreenSharing(false);
        setScreenStream(null);
        if (meeting) updateParticipant(meeting.id, myParticipantId, { isScreenSharing: false });
      };

      if (meeting) updateParticipant(meeting.id, myParticipantId, { isScreenSharing: true });
    } catch (err) {
      console.warn("Screen share cancelled or failed:", err);
    }
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatDraft.trim() || !meeting) return;
    const text = chatDraft;
    setChatDraft("");
    const role: ParticipantRole = isHost ? "host" : isAdmin ? "cohost" : "participant";
    await sendMeetingChatMessage(
      meeting.id,
      myParticipantId,
      displayName,
      role,
      text,
      chatRecipient || undefined
    );
  };

  const handleSendReaction = (emoji: "thumbs_up" | "heart" | "laugh" | "clap" | "celebrate" | "question") => {
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
    setFloatingReactions((prev) => [...prev, { id, emoji: symbolMap[emoji], x }]);
    setTimeout(() => {
      setFloatingReactions((prev) => prev.filter((r) => r.id !== id));
    }, 2500);
  };

  const handleToggleRaiseHand = () => {
    const next = !isHandRaised;
    setIsHandRaised(next);
    if (meeting) {
      updateParticipant(meeting.id, myParticipantId, { isHandRaised: next });
    }
    toast.info(next ? "Hand raised ✋" : "Hand lowered");
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
                          onClick={requestMediaPermissions}
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
                  onClick={requestMediaPermissions}
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
  const activeParticipants = meeting.participants.filter((p) => p.status === "joined" || p.status === "admitted");
  const waitingParticipants = meeting.participants.filter((p) => p.status === "waiting");

  return (
    <div className="fixed inset-0 z-50 h-[100dvh] max-h-[100dvh] w-screen bg-neutral-950 text-white flex flex-col select-none overflow-hidden">
      {/* Floating Animated Emoji Reactions */}
      <div className="absolute inset-0 pointer-events-none z-50 overflow-hidden">
        {floatingReactions.map((r) => (
          <div
            key={r.id}
            className="absolute bottom-20 text-4xl animate-in slide-in-from-bottom duration-1000"
            style={{ left: `${r.x}%`, animation: "floatUp 2.5s ease-out forwards" }}
          >
            {r.emoji}
          </div>
        ))}
      </div>

      {/* Top Header Bar */}
      <div className="h-12 sm:h-14 px-3 sm:px-6 border-b border-neutral-800 bg-neutral-900/90 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <h2 className="font-display text-sm font-bold uppercase tracking-wider truncate max-w-xs sm:max-w-md">
            {meeting.title}
          </h2>
          <span className="font-meta text-[9px] px-2 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-neutral-400">
            {activeParticipants.length} Connected
          </span>
          {meeting.meetingLocked && (
            <span className="font-meta text-[9px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40">
              🔒 Locked
            </span>
          )}
        </div>

        {/* Host Waiting Tray Notification */}
        {isHost && waitingParticipants.length > 0 && (
          <div className="flex items-center gap-2 bg-amber-500/20 border border-amber-500/40 px-3 py-1 rounded-full animate-bounce">
            <span className="text-xs">⏳</span>
            <span className="font-meta text-[9px] font-bold text-amber-300">
              {waitingParticipants.length} in waiting room
            </span>
            <button
              onClick={() => admitAllParticipants(meeting.id)}
              className="font-meta text-[9px] px-2 py-0.5 bg-amber-500 text-black font-bold rounded hover:bg-amber-400"
            >
              Admit All
            </button>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShareModalOpen(true)}
            className="font-meta text-[10px] px-3 py-1.5 rounded-full bg-[var(--dept)] text-[var(--on-dept)] font-bold flex items-center gap-1.5 hover:brightness-110 shadow-sm transition-all"
          >
            <span>🔗</span> Share Meeting
          </button>

          <span className="font-meta text-[9px] text-neutral-400 hidden sm:inline">
            Room: <code className="text-neutral-200">{meeting.roomId}</code>
          </span>
        </div>
      </div>

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
        {/* Floating Waiting Room Admission Bar for Host */}
        {isHost && waitingParticipants.length > 0 && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-40 bg-neutral-900/95 border-2 border-amber-400 p-3 sm:p-3.5 rounded-2xl shadow-2xl backdrop-blur-md flex flex-col sm:flex-row items-center justify-between gap-3 animate-in slide-in-from-top-3 max-w-lg w-[92%]">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center text-base shrink-0">
                🔔
              </div>
              <div className="min-w-0">
                <p className="font-display text-xs font-bold uppercase text-white truncate">
                  {waitingParticipants.length === 1
                    ? `${waitingParticipants[0].displayName} is in the waiting room`
                    : `${waitingParticipants.length} people in waiting room`}
                </p>
                <p className="font-meta text-[9px] text-amber-300">
                  Grant permission to admit into live meeting
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
              {waitingParticipants.length === 1 ? (
                <>
                  <button
                    type="button"
                    onClick={() => admitParticipant(meeting.id, waitingParticipants[0].id)}
                    className="btn btn-dept !py-1.5 !px-3 font-display text-[10px] font-bold uppercase shadow-sm"
                  >
                    ✅ Admit
                  </button>
                  <button
                    type="button"
                    onClick={() => removeParticipant(meeting.id, waitingParticipants[0].id)}
                    className="px-2.5 py-1.5 rounded-lg border border-neutral-700 bg-neutral-800 text-neutral-300 hover:text-white font-meta text-[10px]"
                  >
                    Deny
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => admitAllParticipants(meeting.id)}
                  className="btn btn-dept !py-1.5 !px-3 font-display text-[10px] font-bold uppercase shadow-sm"
                >
                  ⚡ Admit All ({waitingParticipants.length})
                </button>
              )}
            </div>
          </div>
        )}

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
            </div>
          )}

          {/* Participant Video Grid */}
          <div className={`grid gap-4 flex-1 ${
            activeParticipants.length <= 1 ? "grid-cols-1 max-w-3xl mx-auto w-full" :
            activeParticipants.length === 2 ? "grid-cols-1 sm:grid-cols-2" :
            activeParticipants.length <= 4 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4"
          }`}>
            {/* My Local Tile */}
            <div className="relative aspect-video bg-neutral-900 rounded-2xl overflow-hidden border border-neutral-800 shadow-md flex items-center justify-center">
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

              {/* Tile Badges */}
              <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm px-2.5 py-1 rounded-lg text-[10px] font-display font-bold uppercase flex items-center gap-2">
                <span>{displayName} (You)</span>
                {isHost && <span className="text-amber-400 text-[8px] bg-amber-400/20 px-1 rounded">HOST</span>}
              </div>

              <div className="absolute top-2 right-2 flex items-center gap-1.5">
                {isHandRaised && (
                  <span className="bg-amber-500 text-black px-1.5 py-0.5 rounded text-xs animate-bounce" title="Hand Raised">
                    ✋
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
            {activeParticipants.filter((p) => p.id !== myParticipantId).map((p) => {
              const rStream = remoteStreams.get(p.id);
              const hasVideo = rStream && rStream.getVideoTracks().some((t) => t.enabled && t.readyState === "live") && !p.isVideoOff;

              return (
                <div
                  key={p.id}
                  className="relative aspect-video bg-neutral-900 rounded-2xl overflow-hidden border border-neutral-800 shadow-md flex items-center justify-center"
                >
                  {hasVideo && rStream ? (
                    <VideoTile stream={rStream} muted={false} />
                  ) : (
                    <div className="text-center">
                      <div className="w-16 h-16 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-xl font-bold text-neutral-300 mx-auto mb-1">
                        {p.displayName.slice(0, 2).toUpperCase()}
                      </div>
                      <p className="font-meta text-[9px] text-neutral-500">Audio Stream Active</p>
                      {/* Audio playback element */}
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

                  <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm px-2.5 py-1 rounded-lg text-[10px] font-display font-bold uppercase flex items-center gap-2">
                    <span>{p.displayName}</span>
                    {p.role === "host" && <span className="text-amber-400 text-[8px] bg-amber-400/20 px-1 rounded">HOST</span>}
                    {p.role === "cohost" && <span className="text-cyan-400 text-[8px] bg-cyan-400/20 px-1 rounded">CO-HOST</span>}
                  </div>

                  <div className="absolute top-2 right-2 flex items-center gap-1.5">
                    {p.isHandRaised && (
                      <span className="bg-amber-500 text-black px-1.5 py-0.5 rounded text-xs animate-bounce">
                        ✋
                      </span>
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
        </div>

        {/* Slide-in Drawers (Chat, Participants, AI Intelligence, Breakouts) */}
        {activeDrawer !== "none" && (
          <div className="fixed inset-0 z-50 md:static md:w-80 sm:md:w-96 md:border-l md:border-neutral-800 bg-neutral-950 md:bg-neutral-900 flex flex-col shrink-0 animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
              <h3 className="font-display text-xs font-bold uppercase tracking-wider text-white">
                {activeDrawer === "chat" && "💬 In-Meeting Chat"}
                {activeDrawer === "participants" && `👥 Participants (${activeParticipants.length})`}
                {activeDrawer === "intelligence" && "✨ AI Meeting Intelligence"}
                {activeDrawer === "breakouts" && "🔀 Breakout Rooms"}
              </h3>
              <button
                onClick={() => setActiveDrawer("none")}
                className="w-8 h-8 rounded-full bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white flex items-center justify-center text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {/* DRAWER: CHAT */}
            {activeDrawer === "chat" && (
              <div className="flex-1 flex flex-col p-4 overflow-hidden">
                <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
                  {chatMessages.length === 0 ? (
                    <p className="text-neutral-500 text-center py-8">No messages yet. Say hello!</p>
                  ) : (
                    chatMessages.map((msg) => (
                      <div key={msg.id} className="p-2.5 rounded-lg bg-neutral-800/80 border border-neutral-700/50">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="font-display font-bold text-[11px] text-cyan-400">
                            {msg.senderName} {msg.senderId === myParticipantId ? "(You)" : ""}
                          </span>
                          <span className="font-meta text-[8.5px] text-neutral-500">
                            {new Date(msg.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                          </span>
                        </div>
                        <p className="text-neutral-200 text-xs break-words">{msg.message}</p>
                      </div>
                    ))
                  )}
                </div>

                <form onSubmit={handleSendChat} className="mt-3 pt-3 border-t border-neutral-800 flex gap-2">
                  <input
                    type="text"
                    value={chatDraft}
                    onChange={(e) => setChatDraft(e.target.value)}
                    placeholder="Type a message to everyone…"
                    className="flex-1 bg-neutral-800 border border-neutral-700 px-3 py-2 rounded text-xs outline-none focus:border-cyan-400 text-white placeholder-neutral-500"
                  />
                  <button type="submit" className="btn btn-dept !py-2 !px-3 font-meta text-[10px]">
                    Send
                  </button>
                </form>
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
                      className="p-2.5 rounded-lg bg-neutral-800 border border-neutral-700 flex items-center justify-between gap-2"
                    >
                      <div className="truncate">
                        <p className="font-bold text-xs truncate">
                          {p.displayName} {p.id === myParticipantId ? "(You)" : ""}
                        </p>
                        <p className="font-meta text-[9px] text-neutral-400 capitalize">
                          {p.role} · {p.isMuted ? "Muted" : "Active"}
                        </p>
                      </div>

                      {/* Host Actions */}
                      {isHost && p.id !== myParticipantId && (
                        <div className="flex items-center gap-1.5 shrink-0">
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
                        </div>
                      )}
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
        {/* Left: Audio & Video Controls */}
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
            onClick={handleToggleScreenShare}
            className={`hidden xs:flex flex-col items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-xl text-xs font-bold transition-all shrink-0 ${
              isScreenSharing ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40" : "bg-neutral-800 text-white hover:bg-neutral-700"
            }`}
            title={isScreenSharing ? "Stop Screen Share" : "Share Screen"}
          >
            <span className="text-sm sm:text-base">🖥️</span>
            <span className="font-meta text-[7px] sm:text-[8px] uppercase mt-0.5">{isScreenSharing ? "Sharing" : "Share"}</span>
          </button>
        </div>

        {/* Center: Collaboration Tools (Reactions, Hand, Drawers) */}
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
              isHandRaised ? "bg-amber-500/20 text-amber-300 border border-amber-500/40" : "bg-neutral-800 text-white hover:bg-neutral-700"
            }`}
            title="Raise / Lower Hand"
          >
            <span className="text-sm sm:text-base">✋</span>
            <span className="font-meta text-[7px] sm:text-[8px] uppercase mt-0.5">Hand</span>
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

        {/* Right: Leave / End Meeting */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
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
    </div>
  );
}
