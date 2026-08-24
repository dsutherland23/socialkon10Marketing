import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { onSnapshot, collection, query, where, orderBy, doc, updateDoc } from "firebase/firestore";
import { db, firebaseReady } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import { type CallHistoryRecord } from "../lib/meetings";
import { playIncomingCallRingtone } from "../lib/webrtc";

/* ------------------------------------------------------------------
   GLOBAL INCOMING CALL NOTIFICATION MODAL (Instant Voice & Video)
   - Plays Web Audio API ringing chime
   - Displays caller details and call type (Voice vs Video)
   - 1-click Accept (routes to /meet/:roomId) or Decline
------------------------------------------------------------------- */

export function IncomingCallModal() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeCall, setActiveCall] = useState<CallHistoryRecord | null>(null);

  useEffect(() => {
    if (!user?.email) return;
    const userEmail = user.email.toLowerCase();

    // Listen for incoming ringing calls directed at the current user
    if (firebaseReady && db) {
      const q = query(
        collection(db, "call_history"),
        where("recipientEmail", "==", userEmail),
        where("status", "==", "ringing"),
        orderBy("startedAt", "desc")
      );

      const unsub = onSnapshot(
        q,
        (snap) => {
          if (!snap.empty) {
            const call = snap.docs[0].data() as CallHistoryRecord;
            // Only alert if call started less than 45 seconds ago
            const callAge = Date.now() - new Date(call.startedAt).getTime();
            if (callAge < 45000) {
              setActiveCall(call);
            } else {
              setActiveCall(null);
            }
          } else {
            setActiveCall(null);
          }
        },
        () => setActiveCall(null)
      );

      return () => unsub();
    }
  }, [user?.email]);

  // Handle ringtone while modal is open
  useEffect(() => {
    if (!activeCall) return;
    const stopRinging = playIncomingCallRingtone();
    return () => stopRinging();
  }, [activeCall]);

  if (!activeCall) return null;

  const handleAccept = async () => {
    if (firebaseReady && db) {
      try {
        await updateDoc(doc(db, "call_history", activeCall.id), {
          status: "accepted",
          answeredAt: new Date().toISOString(),
        });
      } catch {}
    }
    const targetRoom = activeCall.sessionId;
    setActiveCall(null);
    navigate(`/meet/${targetRoom}`);
  };

  const handleDecline = async () => {
    if (firebaseReady && db) {
      try {
        await updateDoc(doc(db, "call_history", activeCall.id), {
          status: "declined",
          endedAt: new Date().toISOString(),
        });
      } catch {}
    }
    setActiveCall(null);
  };

  return (
    <div className="fixed inset-0 z-50 pointer-events-none flex items-start justify-center p-4 sm:p-6 animate-in slide-in-from-top-6 duration-300">
      <div className="pointer-events-auto max-w-md w-full bg-neutral-950 text-white border-2 border-[var(--dept)] rounded-2xl shadow-2xl p-5 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="w-14 h-14 rounded-full bg-[var(--dept)]/20 border border-[var(--dept)] flex items-center justify-center text-2xl font-bold dept-accent">
              {activeCall.callerName.slice(0, 2).toUpperCase()}
            </div>
            <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500"></span>
            </span>
          </div>

          <div className="flex-1 truncate">
            <div className="flex items-center gap-2">
              <span className="font-meta text-[9px] uppercase font-bold text-[var(--dept)] tracking-wider">
                Incoming {activeCall.type === "video" ? "Video Call" : "Voice Call"}
              </span>
            </div>
            <h4 className="font-display text-base font-bold uppercase truncate mt-0.5">
              {activeCall.callerName}
            </h4>
            <p className="font-meta text-[10px] text-neutral-400 truncate">
              {activeCall.callerEmail}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3 mt-5">
          <button
            onClick={handleDecline}
            className="w-full py-2.5 px-4 bg-red-600/20 border border-red-500/40 hover:bg-red-600 text-red-300 hover:text-white font-display text-xs font-bold uppercase rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <span>✕</span> Decline
          </button>
          <button
            onClick={handleAccept}
            className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-display text-xs font-bold uppercase rounded-xl transition-colors shadow-lg flex items-center justify-center gap-2 animate-pulse"
          >
            <span>📞</span> Accept Call
          </button>
        </div>
      </div>
    </div>
  );
}
