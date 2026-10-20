import { useEffect, useState, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import {
  listUserMeetings,
  listAllMeetings,
  subscribeAllMeetings,
  admitAllParticipants,
  updateMeeting,
  type MeetingRecord,
} from "../lib/meetings";
import { playMeetingReminderChime, playDoorbellChime, triggerHapticFeedback } from "../lib/webrtc";

const DISMISSED_MEETING_ALERTS_KEY = "sk_dismissed_meeting_alerts";

function getDismissedMeetingAlerts(): Set<string> {
  try {
    const raw = sessionStorage.getItem(DISMISSED_MEETING_ALERTS_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function dismissMeetingAlert(meetingId: string) {
  try {
    const set = getDismissedMeetingAlerts();
    set.add(meetingId);
    sessionStorage.setItem(DISMISSED_MEETING_ALERTS_KEY, JSON.stringify(Array.from(set)));
  } catch {}
}

export function MeetingProximityAlert() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [activeMeeting, setActiveMeeting] = useState<MeetingRecord | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);

  // Track triggered alerts to prevent duplicate sound/haptics in the same window
  const alertedMarks = useRef<Set<string>>(new Set());
  // Track which waiting-room participant IDs have already rung the global doorbell
  const alertedWaitingIds = useRef<Set<string>>(new Set());

  // Do not show the banner if the user is already inside a meeting room
  const isInMeetingRoom = location.pathname.startsWith("/meet/");
  const isInMeetingRoomRef = useRef(isInMeetingRoom);
  isInMeetingRoomRef.current = isInMeetingRoom;

  // 1. Real-time subscription + polling for upcoming meetings & waiting room knocks
  useEffect(() => {
    if (!user && !isAdmin) {
      setActiveMeeting(null);
      return;
    }

    let isMounted = true;
    const userEmail = user?.email?.toLowerCase().trim() || "";

    const isHostForMeeting = (m: MeetingRecord) => {
      if (isAdmin) return true;
      if (!userEmail) return false;
      return m.hostEmail?.toLowerCase().trim() === userEmail;
    };

    const evaluateMeetings = (meetings: MeetingRecord[]) => {
      if (!isMounted) return;

      const now = Date.now();
      const dismissed = getDismissedMeetingAlerts();

      // Priority A: Check if any active/scheduled meeting has participants waiting in the lobby for this host
      const waitingMeetings = meetings.filter((m) => {
        if (!m || !m.id) return false;
        if (m.status === "completed" || m.status === "cancelled" || m.status === "expired") return false;
        if (!isHostForMeeting(m)) return false;
        return (m.participants || []).some((p) => p.status === "waiting");
      });

      if (waitingMeetings.length > 0 && !isInMeetingRoomRef.current) {
        const currentWaitingKeys = new Set<string>();
        const newlyKnocking: { meeting: MeetingRecord; names: string[] }[] = [];

        waitingMeetings.forEach((m) => {
          const waitingList = (m.participants || []).filter((p) => p.status === "waiting");
          const newNames: string[] = [];
          waitingList.forEach((p) => {
            const key = `${m.id}_${p.id}`;
            currentWaitingKeys.add(key);
            if (!alertedWaitingIds.current.has(key)) {
              alertedWaitingIds.current.add(key);
              newNames.push(p.displayName || "Guest");
            }
          });
          if (newNames.length > 0) {
            newlyKnocking.push({ meeting: m, names: newNames });
          }
        });

        // Clean up keys for participants no longer waiting so re-joins re-trigger
        Array.from(alertedWaitingIds.current).forEach((k) => {
          if (!currentWaitingKeys.has(k)) alertedWaitingIds.current.delete(k);
        });

        // Ring global doorbell + toast + OS notification for newly knocking guests
        if (newlyKnocking.length > 0) {
          playDoorbellChime();
          triggerHapticFeedback([150, 80, 200]);
          const first = newlyKnocking[0];
          const namesStr = first.names.join(", ");
          const plural = first.names.length > 1 ? "are" : "is";
          toast.warning(`🔔 ${namesStr} ${plural} waiting in "${first.meeting.title}"`, {
            duration: 15000,
            action: {
              label: "Admit & Join",
              onClick: () => {
                void admitAllParticipants(first.meeting.id);
                navigate(`/meet/${first.meeting.roomId}`);
              },
            },
          });

          if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
            try {
              const n = new Notification(`🔔 Waiting Room: ${first.meeting.title}`, {
                body: `${namesStr} ${plural} waiting in the lobby. Click to join & admit.`,
                icon: "/favicon.ico",
                tag: `global_waiting_${first.meeting.id}`,
              });
              n.onclick = () => {
                window.focus();
                navigate(`/meet/${first.meeting.roomId}`);
                n.close();
              };
            } catch {}
          }
        }

        // Waiting room meetings bypass session dismissal so the host is always alerted
        waitingMeetings.sort(
          (a, b) =>
            new Date(b.updatedAt || b.scheduledStart).getTime() -
            new Date(a.updatedAt || a.scheduledStart).getTime()
        );
        setActiveMeeting(waitingMeetings[0]);
        return;
      } else {
        alertedWaitingIds.current.clear();
      }

      // Priority B: Find meetings that are scheduled within next 15 minutes OR currently live
      const urgentMeetings = meetings.filter((m) => {
        if (!m || !m.id) return false;
        if (dismissed.has(m.id)) return false;
        if (m.status === "completed" || m.status === "cancelled" || m.status === "expired") return false;

        const startTime = new Date(m.scheduledStart).getTime();
        if (isNaN(startTime)) return false;

        const ageMs = now - startTime;

        // If status is "live":
        // Auto-retire stale live meetings that started more than 60 minutes ago
        if (m.status === "live") {
          if (ageMs > 60 * 60 * 1000) {
            void updateMeeting(m.id, { status: "completed" });
            return false;
          }
          return ageMs >= -5 * 60 * 1000 && ageMs <= 60 * 60 * 1000;
        }

        // Upcoming meetings: within 15 minutes before start (or up to 15 mins past start)
        const diffMs = startTime - now;
        return diffMs <= 15 * 60 * 1000 && diffMs >= -15 * 60 * 1000;
      });

      if (urgentMeetings.length > 0) {
        urgentMeetings.sort((a, b) => new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime());
        setActiveMeeting(urgentMeetings[0]);
      } else {
        setActiveMeeting(null);
      }
    };

    const filterForUser = (all: MeetingRecord[]) => {
      if (isAdmin) return all;
      if (!userEmail) return [];
      return all.filter((m) => {
        const hostMatch = m.hostEmail?.toLowerCase().trim() === userEmail;
        const partMatch = (m.participants || []).some((p) => {
          const pEmail = p.email?.toLowerCase().trim() || "";
          const pName = p.displayName?.toLowerCase().trim() || "";
          return pEmail === userEmail || pName === userEmail;
        });
        return hostMatch || partMatch;
      });
    };

    // Real-time subscription so waiting room knocks trigger immediately
    const unsub = subscribeAllMeetings((all) => {
      evaluateMeetings(filterForUser(all));
    });

    const checkUpcomingMeetings = async () => {
      try {
        let meetings: MeetingRecord[] = [];
        if (isAdmin) {
          meetings = await listAllMeetings();
        } else if (user?.email) {
          meetings = await listUserMeetings(user.email);
        }
        evaluateMeetings(meetings);
      } catch (err) {
        console.warn("Proximity alert check error:", err);
      }
    };

    const interval = setInterval(checkUpcomingMeetings, 25000);

    return () => {
      isMounted = false;
      unsub();
      clearInterval(interval);
    };
  }, [user?.email, isAdmin, navigate]);

  // 2. Real-time second countdown ticker & Chime/Haptic triggers
  useEffect(() => {
    if (!activeMeeting) {
      setSecondsRemaining(null);
      return;
    }

    const updateCountdown = () => {
      const now = Date.now();
      const startTime = new Date(activeMeeting.scheduledStart).getTime();
      const diffSec = Math.floor((startTime - now) / 1000);
      setSecondsRemaining(diffSec);

      // Check Chime & Haptic Alert Thresholds: 10 mins (600s), 5 mins (300s), 1 min (60s), Starting Now (0s)
      const thresholds = [
        { mark: "10m", sec: 600, label: "10 minutes" },
        { mark: "5m", sec: 300, label: "5 minutes" },
        { mark: "1m", sec: 60, label: "1 minute" },
        { mark: "0m", sec: 0, label: "starting now" },
      ];

      thresholds.forEach(({ mark, sec, label }) => {
        // Trigger if within a 3-second window of the mark and not yet alerted
        if (diffSec <= sec && diffSec >= sec - 3 && !alertedMarks.current.has(`${activeMeeting.id}_${mark}`)) {
          alertedMarks.current.add(`${activeMeeting.id}_${mark}`);

          // 1. Play Web Audio ascending chime
          playMeetingReminderChime();

          // 2. Trigger Haptic Vibration feedback on mobile
          triggerHapticFeedback([120, 60, 120, 60, 240]);

          // 3. Browser Push Notification
          if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
            try {
              new Notification(`📅 Studio Meeting: ${activeMeeting.title}`, {
                body: `Your session is ${label}. Click to join now.`,
                icon: "/favicon.ico",
              });
            } catch {}
          }
        }
      });
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);

    return () => clearInterval(timer);
  }, [activeMeeting]);

  if (!activeMeeting || isInMeetingRoom) return null;

  const waitingList = (activeMeeting.participants || []).filter((p) => p.status === "waiting");
  const isWaitingLobbyAlert = waitingList.length > 0;
  const isLive = activeMeeting.status === "live" || (secondsRemaining !== null && secondsRemaining <= 0);

  // Format countdown
  const formatCountdown = () => {
    if (isWaitingLobbyAlert) {
      return `🔔 ${waitingList.length} IN WAITING ROOM`;
    }
    if (isLive) return "● LIVE NOW";
    if (secondsRemaining === null) return "Starting soon";
    const mins = Math.floor(secondsRemaining / 60);
    const secs = secondsRemaining % 60;
    return `Starts in ${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const handleDismiss = () => {
    if (activeMeeting?.id) {
      dismissMeetingAlert(activeMeeting.id);
    }
    setActiveMeeting(null);
  };

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed top-3 left-1/2 transform -translate-x-1/2 z-[99] w-[94%] max-w-lg animate-in slide-in-from-top duration-300"
    >
      <div
        className={`p-3 sm:p-3.5 rounded-2xl text-white border shadow-2xl backdrop-blur-md flex items-center justify-between gap-3 ${
          isWaitingLobbyAlert
            ? "bg-amber-950/95 border-amber-400 border-2"
            : "bg-neutral-950/95 border-[var(--dept)]"
        }`}
      >
        {/* Left: Icon & Title & Countdown */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative shrink-0">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center text-base ${
                isWaitingLobbyAlert
                  ? "bg-amber-500/20 text-amber-300 border border-amber-400/50 animate-bounce"
                  : isLive
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                  : "bg-[var(--dept-soft)] text-[var(--dept)] border border-[var(--dept)]/30"
              }`}
            >
              {isWaitingLobbyAlert ? "🔔" : isLive ? "🎥" : "⏳"}
            </div>
            <span
              className={`absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ${
                isWaitingLobbyAlert
                  ? "bg-amber-400 animate-ping"
                  : isLive
                  ? "bg-emerald-400 animate-ping"
                  : "bg-amber-400 animate-pulse"
              }`}
            />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={`font-meta text-[8px] uppercase font-bold px-1.5 py-0.5 rounded ${
                  isWaitingLobbyAlert
                    ? "bg-amber-400 text-black font-extrabold"
                    : isLive
                    ? "bg-emerald-500 text-black font-extrabold"
                    : "bg-amber-400/20 text-amber-300"
                }`}
              >
                {formatCountdown()}
              </span>
              <span className="font-meta text-[8.5px] text-neutral-300 hidden xs:inline truncate">
                {isWaitingLobbyAlert
                  ? waitingList.map((p) => p.displayName).join(", ")
                  : `Host: ${activeMeeting.hostName}`}
              </span>
            </div>
            <p className="font-display text-xs font-bold uppercase truncate mt-0.5">
              {activeMeeting.title}
            </p>
          </div>
        </div>

        {/* Right: Join & Dismiss Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {isWaitingLobbyAlert ? (
            <button
              type="button"
              onClick={async () => {
                await admitAllParticipants(activeMeeting.id);
                navigate(`/meet/${activeMeeting.roomId}`);
              }}
              className="btn btn-dept !py-1.5 !px-3 font-display text-[10px] font-bold uppercase tracking-wider shadow-sm flex items-center gap-1"
            >
              <span>⚡</span> Admit &amp; Join
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                navigate(`/meet/${activeMeeting.roomId}`);
              }}
              className="btn btn-dept !py-1.5 !px-3 font-display text-[10px] font-bold uppercase tracking-wider shadow-sm flex items-center gap-1"
            >
              <span>🚀</span> Join
            </button>
          )}

          {!isWaitingLobbyAlert && (
            <button
              type="button"
              onClick={handleDismiss}
              className="text-neutral-400 hover:text-white p-1.5 text-xs rounded hover:bg-neutral-800 transition-colors"
              title="Dismiss reminder"
              aria-label="Dismiss reminder"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
