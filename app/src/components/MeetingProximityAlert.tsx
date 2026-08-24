import { useEffect, useState, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { listUserMeetings, listAllMeetings, type MeetingRecord } from "../lib/meetings";
import { playMeetingReminderChime, triggerHapticFeedback } from "../lib/webrtc";

export function MeetingProximityAlert() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [activeMeeting, setActiveMeeting] = useState<MeetingRecord | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const [isSnoozed, setIsSnoozed] = useState(false);
  const [snoozeUntil, setSnoozeUntil] = useState<number>(0);

  // Track triggered alerts to prevent duplicate sound/haptics in the same window
  const alertedMarks = useRef<Set<string>>(new Set());

  // Do not show the banner if the user is already inside a meeting room
  const isInMeetingRoom = location.pathname.startsWith("/meet/");

  // 1. Poll for upcoming meetings
  useEffect(() => {
    if (!user && !isAdmin) {
      setActiveMeeting(null);
      return;
    }

    let isMounted = true;

    const checkUpcomingMeetings = async () => {
      try {
        let meetings: MeetingRecord[] = [];
        if (isAdmin) {
          meetings = await listAllMeetings();
        } else if (user?.email) {
          meetings = await listUserMeetings(user.email);
        }

        if (!isMounted) return;

        const now = Date.now();
        // Find meetings that are scheduled within next 15 minutes OR currently live
        const urgentMeetings = meetings.filter((m) => {
          if (m.status === "completed" || m.status === "cancelled") return false;
          const startTime = new Date(m.scheduledStart).getTime();
          const diffMs = startTime - now;
          // Live or within 15 minutes before start (or up to 60 mins past start if not completed)
          return (m.status === "live") || (diffMs <= 15 * 60 * 1000 && diffMs >= -60 * 60 * 1000);
        });

        if (urgentMeetings.length > 0) {
          // Sort by closest start time
          urgentMeetings.sort((a, b) => new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime());
          setActiveMeeting(urgentMeetings[0]);
        } else {
          setActiveMeeting(null);
        }
      } catch (err) {
        console.warn("Proximity alert check error:", err);
      }
    };

    checkUpcomingMeetings();
    const interval = setInterval(checkUpcomingMeetings, 25000); // Check every 25s

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [user?.email, isAdmin]);

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

      // Check if snoozed
      if (snoozeUntil && now < snoozeUntil) {
        setIsSnoozed(true);
        return;
      } else if (isSnoozed) {
        setIsSnoozed(false);
      }

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
  }, [activeMeeting, snoozeUntil, isSnoozed]);

  if (!activeMeeting || isInMeetingRoom || isSnoozed) return null;

  const isLive = activeMeeting.status === "live" || (secondsRemaining !== null && secondsRemaining <= 0);

  // Format countdown
  const formatCountdown = () => {
    if (isLive) return "● LIVE NOW";
    if (secondsRemaining === null) return "Starting soon";
    const mins = Math.floor(secondsRemaining / 60);
    const secs = secondsRemaining % 60;
    return `Starts in ${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const handleSnooze = () => {
    // Snooze for 4 minutes
    setSnoozeUntil(Date.now() + 4 * 60 * 1000);
    setIsSnoozed(true);
  };

  return (
    <div className="fixed top-3 left-1/2 transform -translate-x-1/2 z-[99] w-[94%] max-w-lg animate-in slide-in-from-top duration-300">
      <div className="p-3 sm:p-3.5 rounded-2xl bg-neutral-950/95 text-white border border-[var(--dept)] shadow-2xl backdrop-blur-md flex items-center justify-between gap-3">
        {/* Left: Icon & Title & Countdown */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative shrink-0">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base ${
              isLive ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40" : "bg-[var(--dept-soft)] text-[var(--dept)] border border-[var(--dept)]/30"
            }`}>
              {isLive ? "🎥" : "⏳"}
            </div>
            <span className={`absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ${
              isLive ? "bg-emerald-400 animate-ping" : "bg-amber-400 animate-pulse"
            }`} />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={`font-meta text-[8px] uppercase font-bold px-1.5 py-0.5 rounded ${
                isLive ? "bg-emerald-500 text-black font-extrabold" : "bg-amber-400/20 text-amber-300"
              }`}>
                {formatCountdown()}
              </span>
              <span className="font-meta text-[8.5px] text-neutral-400 hidden xs:inline truncate">
                Host: {activeMeeting.hostName}
              </span>
            </div>
            <p className="font-display text-xs font-bold uppercase truncate mt-0.5">
              {activeMeeting.title}
            </p>
          </div>
        </div>

        {/* Right: Join & Snooze Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => {
              navigate(`/meet/${activeMeeting.roomId}`);
            }}
            className="btn btn-dept !py-1.5 !px-3 font-display text-[10px] font-bold uppercase tracking-wider shadow-sm flex items-center gap-1"
          >
            <span>🚀</span> Join
          </button>

          <button
            onClick={handleSnooze}
            className="text-neutral-400 hover:text-white p-1 text-xs rounded hover:bg-neutral-800"
            title="Snooze reminder for 4 minutes"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
