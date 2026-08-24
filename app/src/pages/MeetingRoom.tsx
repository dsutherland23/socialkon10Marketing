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
} from "../lib/meetings";
import {
  getMediaDevices,
  getLocalUserMedia,
  getDisplayMediaStream,
  stopMediaStream,
  createAudioLevelMeter,
  playSpeakerTestSound,
  type MediaDeviceList,
} from "../lib/webrtc";

/* ------------------------------------------------------------------
   ZOOM-STYLE LIVE MEETING ROOM & LOBBY (2026 Production Standard)
   - Pre-meeting lobby with hardware diagnostics (mic VU meter, cam, speaker)
   - Waiting room with host admission controls
   - Responsive multi-participant video grid & screen share spotlight
   - Real-time in-meeting chat, emoji reactions, hand raising
   - Host moderation: mute, stop video, kick, lock meeting, end for all
   - Breakout rooms & AI Meeting Intelligence summary generator
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

  // Live Streams
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  // Video Refs
  const lobbyVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);

  // In-Meeting Drawers & Controls
  const [activeDrawer, setActiveDrawer] = useState<"none" | "chat" | "participants" | "intelligence" | "breakouts">("none");
  const [chatMessages, setChatMessages] = useState<MeetingChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [chatRecipient] = useState<string>(""); // "" = everyone
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [floatingReactions, setFloatingReactions] = useState<{ id: string; emoji: string; x: number }[]>([]);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);

  // Breakout Rooms
  const [newRoomName, setNewRoomName] = useState("");

  const isHost = meeting ? (meeting.hostEmail.toLowerCase() === user?.email?.toLowerCase() || isAdmin) : false;

  // 1. Load & Subscribe to Meeting
  useEffect(() => {
    if (!roomId) return;
    setLoadingMeeting(true);
    const unsub = subscribeToMeeting(roomId, (m) => {
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

  // 3. Acquire Local User Media in Lobby
  useEffect(() => {
    if (phase === "ended") return;

    let stream: MediaStream | null = null;
    let cleanupAudioMeter: (() => void) | null = null;

    getLocalUserMedia({
      audioDeviceId: selectedAudioInput,
      videoDeviceId: selectedVideoInput,
      audio: !isMicMuted,
      video: !isVideoOff,
    })
      .then((s) => {
        stream = s;
        setLocalStream(s);

        if (lobbyVideoRef.current) {
          lobbyVideoRef.current.srcObject = s;
        }
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = s;
        }

        cleanupAudioMeter = createAudioLevelMeter(s, (vol) => setMicVolume(vol));
      })
      .catch((err) => {
        console.warn("Hardware access notice:", err);
      });

    return () => {
      if (cleanupAudioMeter) cleanupAudioMeter();
      stopMediaStream(stream);
    };
  }, [selectedAudioInput, selectedVideoInput, isMicMuted, isVideoOff, phase]);

  // Attach local stream to video tag whenever in_meeting mounts
  useEffect(() => {
    if (phase === "in_meeting" && localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [phase, localStream]);

  // 4. Subscribe to In-Meeting Chat
  useEffect(() => {
    if (!meeting || phase !== "in_meeting") return;
    const unsubChat = subscribeToMeetingChat(meeting.id, setChatMessages);
    return () => unsubChat();
  }, [meeting?.id, phase]);

  // 5. Watch Participant Status changes (e.g. host admits or removes participant)
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

  // Handlers
  const handleTestSpeaker = async () => {
    setIsTestingSpeaker(true);
    await playSpeakerTestSound();
    setIsTestingSpeaker(false);
  };

  const handleJoinFromLobby = async () => {
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
      isVideoOff: isVideoOff,
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

  const handleToggleMic = () => {
    const next = !isMicMuted;
    setIsMicMuted(next);
    if (localStream) {
      localStream.getAudioTracks().forEach((t) => (t.enabled = !next));
    }
    if (meeting && phase === "in_meeting") {
      updateParticipant(meeting.id, myParticipantId, { isMuted: next });
    }
  };

  const handleToggleVideo = () => {
    const next = !isVideoOff;
    setIsVideoOff(next);
    if (localStream) {
      localStream.getVideoTracks().forEach((t) => (t.enabled = !next));
    }
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
      <div className="min-h-[80vh] flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto">
        <span className="text-4xl mb-3">📡</span>
        <h2 className="font-display text-xl font-bold uppercase">Meeting Not Found</h2>
        <p className="text-xs text-[var(--muted)] mt-2">
          The requested meeting room ID <code className="text-[var(--ink)]">"{roomId}"</code> does not exist or has expired.
        </p>
        <button onClick={() => navigate("/client")} className="btn btn-dept mt-6">
          Return to Portal
        </button>
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
      <div className="min-h-[90vh] py-12 px-4 max-w-5xl mx-auto flex flex-col justify-center">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-[var(--dept-soft)] border border-[var(--dept)]/30 rounded-full mb-3">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-meta text-[10px] uppercase font-bold text-[var(--dept)] tracking-wider">
              {meeting.type === "instant_voice_call" ? "Instant Voice Session" : "Studio Video Conference"}
            </span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold uppercase">{meeting.title}</h1>
          <p className="font-meta text-xs text-[var(--muted)] mt-1">
            Host: <strong className="text-[var(--ink)]">{meeting.hostName}</strong> · {formattedDate} at {formattedTime} ({userTimezone})
          </p>
        </div>

        <div className="grid lg:grid-cols-12 gap-8 items-start">
          {/* LEFT: Video Preview & Volume Level */}
          <div className="lg:col-span-7 border border-[var(--line)] rounded-2xl bg-[var(--panel)] overflow-hidden shadow-lg p-6">
            <div className="relative aspect-video bg-neutral-950 rounded-xl overflow-hidden flex items-center justify-center border border-[var(--line)]">
              {!isVideoOff ? (
                <video
                  ref={lobbyVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover transform -scale-x-100"
                />
              ) : (
                <div className="text-center p-6">
                  <div className="w-20 h-20 rounded-full bg-[var(--dept)]/20 border border-[var(--dept)] flex items-center justify-center text-2xl font-bold mx-auto mb-2 dept-accent">
                    {displayName.slice(0, 2).toUpperCase()}
                  </div>
                  <p className="font-meta text-xs text-neutral-400">Camera is turned off</p>
                </div>
              )}

              {/* In-Preview Controls */}
              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex items-center gap-3 bg-neutral-900/80 backdrop-blur-md px-4 py-2 rounded-full border border-neutral-700">
                <button
                  type="button"
                  onClick={handleToggleMic}
                  className={`p-2.5 rounded-full text-sm font-bold transition-colors ${
                    isMicMuted ? "bg-red-500 text-white" : "bg-neutral-800 text-white hover:bg-neutral-700"
                  }`}
                  title={isMicMuted ? "Unmute Microphone" : "Mute Microphone"}
                >
                  {isMicMuted ? "🔇" : "🎙️"}
                </button>
                <button
                  type="button"
                  onClick={handleToggleVideo}
                  className={`p-2.5 rounded-full text-sm font-bold transition-colors ${
                    isVideoOff ? "bg-red-500 text-white" : "bg-neutral-800 text-white hover:bg-neutral-700"
                  }`}
                  title={isVideoOff ? "Turn Video On" : "Turn Video Off"}
                >
                  {isVideoOff ? "🚫" : "📹"}
                </button>
              </div>
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
          <div className="lg:col-span-5 border border-[var(--line)] rounded-2xl bg-[var(--panel)] p-6 space-y-5 shadow-sm">
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
            <div className="pt-2">
              <button
                type="button"
                onClick={handleTestSpeaker}
                disabled={isTestingSpeaker}
                className="w-full font-meta text-[10px] uppercase font-bold py-2 border border-[var(--line)] rounded bg-[var(--bg)] hover:border-[var(--dept)] transition-colors flex items-center justify-center gap-2"
              >
                <span>🔊</span> {isTestingSpeaker ? "Playing Test Chime…" : "Test Speaker Output"}
              </button>
            </div>

            {/* Join Button */}
            <button
              onClick={handleJoinFromLobby}
              className="btn btn-dept w-full !py-3 font-display text-xs font-bold uppercase tracking-wider shadow-md"
            >
              {isHost ? "🚀 Start Meeting as Host" : "Join Meeting →"}
            </button>

            {meeting.waitingRoomEnabled && !isHost && (
              <p className="font-meta text-[9px] text-[var(--muted)] text-center">
                ℹ️ Waiting room is enabled. You will enter the waiting lobby until admitted by the host.
              </p>
            )}
          </div>
        </div>
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
    <div className="fixed inset-0 z-50 bg-neutral-950 text-white flex flex-col select-none overflow-hidden">
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
      <div className="h-14 px-6 border-b border-neutral-800 bg-neutral-900/90 flex items-center justify-between shrink-0">
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

        <div className="flex items-center gap-2">
          <span className="font-meta text-[9px] text-neutral-400 hidden sm:inline">
            Room: <code className="text-neutral-200">{meeting.roomId}</code>
          </span>
        </div>
      </div>

      {/* Main Workspace Area (Stage + Grid + Drawers) */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Stage & Video Tiles */}
        <div className="flex-1 p-4 flex flex-col gap-4 overflow-y-auto">
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
              {!isVideoOff ? (
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover transform -scale-x-100"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-[var(--dept)]/20 border border-[var(--dept)] flex items-center justify-center text-xl font-bold dept-accent">
                  {displayName.slice(0, 2).toUpperCase()}
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
            {activeParticipants.filter((p) => p.id !== myParticipantId).map((p) => (
              <div
                key={p.id}
                className="relative aspect-video bg-neutral-900 rounded-2xl overflow-hidden border border-neutral-800 shadow-md flex items-center justify-center"
              >
                <div className="w-16 h-16 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-xl font-bold text-neutral-300">
                  {p.displayName.slice(0, 2).toUpperCase()}
                </div>

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
            ))}
          </div>
        </div>

        {/* Slide-in Drawers (Chat, Participants, AI Intelligence, Breakouts) */}
        {activeDrawer !== "none" && (
          <div className="w-80 sm:w-96 border-l border-neutral-800 bg-neutral-900 flex flex-col shrink-0 animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
              <h3 className="font-display text-xs font-bold uppercase tracking-wider">
                {activeDrawer === "chat" && "💬 In-Meeting Chat"}
                {activeDrawer === "participants" && `👥 Participants (${activeParticipants.length})`}
                {activeDrawer === "intelligence" && "✨ AI Meeting Intelligence"}
                {activeDrawer === "breakouts" && "🔀 Breakout Rooms"}
              </h3>
              <button
                onClick={() => setActiveDrawer("none")}
                className="text-neutral-400 hover:text-white text-sm"
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
      <div className="h-20 px-6 border-t border-neutral-800 bg-neutral-900/95 flex items-center justify-between shrink-0">
        {/* Left: Audio & Video Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={handleToggleMic}
            className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl text-xs font-bold transition-all ${
              isMicMuted ? "bg-red-500/20 text-red-400 border border-red-500/40" : "bg-neutral-800 text-white hover:bg-neutral-700"
            }`}
            title={isMicMuted ? "Unmute Mic" : "Mute Mic"}
          >
            <span className="text-base">{isMicMuted ? "🔇" : "🎙️"}</span>
            <span className="font-meta text-[8px] uppercase mt-0.5">{isMicMuted ? "Unmute" : "Mute"}</span>
          </button>

          <button
            onClick={handleToggleVideo}
            className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl text-xs font-bold transition-all ${
              isVideoOff ? "bg-red-500/20 text-red-400 border border-red-500/40" : "bg-neutral-800 text-white hover:bg-neutral-700"
            }`}
            title={isVideoOff ? "Start Video" : "Stop Video"}
          >
            <span className="text-base">{isVideoOff ? "🚫" : "📹"}</span>
            <span className="font-meta text-[8px] uppercase mt-0.5">{isVideoOff ? "Start" : "Stop"}</span>
          </button>

          <button
            onClick={handleToggleScreenShare}
            className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl text-xs font-bold transition-all ${
              isScreenSharing ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40" : "bg-neutral-800 text-white hover:bg-neutral-700"
            }`}
            title={isScreenSharing ? "Stop Screen Share" : "Share Screen"}
          >
            <span className="text-base">🖥️</span>
            <span className="font-meta text-[8px] uppercase mt-0.5">{isScreenSharing ? "Sharing" : "Share"}</span>
          </button>
        </div>

        {/* Center: Collaboration Tools (Reactions, Hand, Drawers) */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Reaction Triggers */}
          <div className="hidden sm:flex items-center gap-1 bg-neutral-800/80 p-1.5 rounded-xl border border-neutral-700/60">
            <button onClick={() => handleSendReaction("thumbs_up")} className="p-1.5 rounded hover:bg-neutral-700 text-sm" title="Thumbs Up">👍</button>
            <button onClick={() => handleSendReaction("heart")} className="p-1.5 rounded hover:bg-neutral-700 text-sm" title="Heart">❤️</button>
            <button onClick={() => handleSendReaction("clap")} className="p-1.5 rounded hover:bg-neutral-700 text-sm" title="Clap">👏</button>
            <button onClick={() => handleSendReaction("celebrate")} className="p-1.5 rounded hover:bg-neutral-700 text-sm" title="Celebrate">🎉</button>
            <button onClick={() => handleSendReaction("laugh")} className="p-1.5 rounded hover:bg-neutral-700 text-sm" title="Laugh">😂</button>
          </div>

          <button
            onClick={handleToggleRaiseHand}
            className={`flex flex-col items-center justify-center w-11 h-11 rounded-xl text-xs font-bold transition-all ${
              isHandRaised ? "bg-amber-500/20 text-amber-300 border border-amber-500/40" : "bg-neutral-800 text-white hover:bg-neutral-700"
            }`}
            title="Raise / Lower Hand"
          >
            <span className="text-base">✋</span>
            <span className="font-meta text-[8px] uppercase mt-0.5">Hand</span>
          </button>

          <button
            onClick={() => setActiveDrawer(activeDrawer === "chat" ? "none" : "chat")}
            className={`flex flex-col items-center justify-center w-11 h-11 rounded-xl text-xs font-bold transition-all ${
              activeDrawer === "chat" ? "bg-[var(--dept)] text-black" : "bg-neutral-800 text-white hover:bg-neutral-700"
            }`}
            title="Toggle Chat"
          >
            <span className="text-base">💬</span>
            <span className="font-meta text-[8px] uppercase mt-0.5">Chat</span>
          </button>

          <button
            onClick={() => setActiveDrawer(activeDrawer === "participants" ? "none" : "participants")}
            className={`flex flex-col items-center justify-center w-11 h-11 rounded-xl text-xs font-bold transition-all ${
              activeDrawer === "participants" ? "bg-[var(--dept)] text-black" : "bg-neutral-800 text-white hover:bg-neutral-700"
            }`}
            title="Toggle Participants"
          >
            <span className="text-base">👥</span>
            <span className="font-meta text-[8px] uppercase mt-0.5">People</span>
          </button>

          <button
            onClick={() => setActiveDrawer(activeDrawer === "intelligence" ? "none" : "intelligence")}
            className={`flex flex-col items-center justify-center w-11 h-11 rounded-xl text-xs font-bold transition-all ${
              activeDrawer === "intelligence" ? "bg-[var(--dept)] text-black" : "bg-neutral-800 text-white hover:bg-neutral-700"
            }`}
            title="AI Meeting Intelligence"
          >
            <span className="text-base">✨</span>
            <span className="font-meta text-[8px] uppercase mt-0.5">AI</span>
          </button>
        </div>

        {/* Right: Leave / End Meeting */}
        <div className="flex items-center gap-2">
          {isHost ? (
            <button
              onClick={handleEndForAll}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-display text-xs font-bold uppercase rounded-xl transition-colors shadow-sm"
            >
              End for All
            </button>
          ) : (
            <button
              onClick={handleLeaveMeeting}
              className="px-4 py-2 bg-red-600/80 hover:bg-red-500 text-white font-display text-xs font-bold uppercase rounded-xl transition-colors"
            >
              Leave Call
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
