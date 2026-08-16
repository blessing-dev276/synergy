import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../supabaseClient.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import { logEarning, adminLogEarning, reviewEarning } from "../../lib/rpc.js";
import { useToast } from "../../components/state/Toast.jsx";
import Icon from "../../components/Icon.jsx";
import Modal from "../../components/Modal.jsx";
import Skeleton from "../../components/state/Skeleton.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";
import ErrorState from "../../components/state/ErrorState.jsx";
import SponsorPicker from "../../components/SponsorPicker.jsx";

const CATEGORY = {
  tasks: { icon: "check-square", label: "Improved Players", format: (s) => `${Math.round(s)}%` },
  prospects: { icon: "network", label: "Top Team Production", format: (s) => `${Math.round(s)}` },
  earnings: { icon: "dollar-sign", label: "Top Earner", format: (s) => `$${Math.round(s)}` },
};

const MEDAL = { 1: "🥇", 2: "🥈", 3: "🥉" };

// CSS's own prefers-reduced-motion guard (app.css) covers everything driven
// by `animation:` — this covers the two effects driven from JS instead
// (rAF count-up, confetti), which that guard can't reach.
function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

const EARNING_STATUS_BADGE = {
  pending: "badge-warning",
  verified: "badge-success",
  rejected: "badge-danger",
};

function rankClass(rank) {
  if (rank === 1) return "gold";
  if (rank === 2) return "silver";
  if (rank === 3) return "bronze";
  return "";
}

function initials(name) {
  return (
    (name ?? "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?"
  );
}

function Avatar({ name, photoUrl, size = 28, ring }) {
  const style = {
    width: size,
    height: size,
    borderRadius: "50%",
    objectFit: "cover",
    background: "var(--gradient-navy)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    fontWeight: 700,
    fontSize: Math.max(size / 2.6, 10),
    flexShrink: 0,
    border: ring ? `2px solid ${ring}` : "none",
  };
  if (photoUrl) {
    return <img src={photoUrl} alt="" style={{ ...style, background: "var(--line)" }} />;
  }
  return <div style={style}>{initials(name)}</div>;
}

// Batch-signs every distinct photo_url across all three boards in one round
// trip (profile-photos is a private bucket, see 0023) rather than one
// request per row.
function useSignedPhotoUrls(data) {
  const [photoUrls, setPhotoUrls] = useState({});

  useEffect(() => {
    const paths = [
      ...new Set([...(data?.tasks ?? []), ...(data?.prospects ?? []), ...(data?.earnings ?? [])].map((e) => e.photoUrl).filter(Boolean)),
    ];
    if (paths.length === 0) {
      setPhotoUrls({});
      return;
    }
    let cancelled = false;
    supabase.storage
      .from("profile-photos")
      .createSignedUrls(paths, 3600)
      .then(({ data: signed }) => {
        if (cancelled || !signed) return;
        const map = {};
        for (const entry of signed) {
          if (entry.signedUrl) map[entry.path] = entry.signedUrl;
        }
        setPhotoUrls(map);
      });
    return () => {
      cancelled = true;
    };
  }, [data]);

  return photoUrls;
}

// Animates a score counting up from 0 to its true value on first reveal —
// the raw target is used for the final frame so the displayed number always
// settles on the exact figure, only the climb there is eased.
function useCountUp(target, active) {
  const [value, setValue] = useState(0);
  const to = Number(target) || 0;

  useEffect(() => {
    if (!active || prefersReducedMotion()) {
      setValue(to);
      return;
    }
    let raf;
    const duration = 900;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(p >= 1 ? to : to * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, active]);

  return value;
}

function PodiumSlot({ rank, entry, meta, isSelf, photoUrls, animate }) {
  const score = useCountUp(entry ? meta.valueOf(entry) : 0, animate);
  if (!entry) return <div className={`podium-slot rank-${rank}`} style={{ visibility: "hidden" }} />;

  return (
    <div
      className={`podium-slot rank-${rank}${isSelf ? " self" : ""}`}
      style={{ animationDelay: `${(3 - rank) * 0.1}s` }}
    >
      <div className="podium-medal">{MEDAL[rank]}</div>
      <div className="podium-avatar-wrap">
        <Avatar name={entry.displayName} photoUrl={photoUrls[entry.photoUrl]} size={rank === 1 ? 60 : 46} />
      </div>
      <div className="podium-name">
        {entry.displayName}
        {isSelf && " (you)"}
      </div>
      <div className="podium-score">{meta.format(score)}</div>
    </div>
  );
}

function BoardCard({ category, entries, currentUid, valueOf, revealed }) {
  const meta = { ...CATEGORY[category], valueOf };
  const photoUrls = useSignedPhotoUrls(useMemo(() => ({ [category]: entries }), [category, entries]));
  const top3 = (entries ?? []).slice(0, 3);
  const rest = (entries ?? []).slice(3, 10);

  return (
    <div className="card-elevated">
      <div className="card-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <Icon name={meta.icon} size={16} />
        {meta.label}
      </div>
      <p className="card-subtitle">This week, resets every Monday</p>

      {(!entries || entries.length === 0) && (
        <EmptyState icon={<Icon name={meta.icon} size={24} />} title="Nobody on the board yet this week" />
      )}

      {entries && entries.length > 0 && (
        <>
          <div className="leaderboard-podium">
            <PodiumSlot rank={2} entry={top3[1]} meta={meta} isSelf={top3[1]?.uid === currentUid} photoUrls={photoUrls} animate={revealed} />
            <PodiumSlot rank={1} entry={top3[0]} meta={meta} isSelf={top3[0]?.uid === currentUid} photoUrls={photoUrls} animate={revealed} />
            <PodiumSlot rank={3} entry={top3[2]} meta={meta} isSelf={top3[2]?.uid === currentUid} photoUrls={photoUrls} animate={revealed} />
          </div>

          {rest.length > 0 && (
            <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "6px" }}>
              {rest.map((entry, i) => {
                const rank = i + 4;
                const isSelf = entry.uid === currentUid;
                return (
                  <li
                    key={entry.uid}
                    className={`leaderboard-row${isSelf ? " self" : ""}`}
                    style={{ animationDelay: `${0.3 + i * 0.05}s` }}
                  >
                    <span className={`leaderboard-rank ${rankClass(rank)}`}>{rank}</span>
                    <Avatar name={entry.displayName} photoUrl={photoUrls[entry.photoUrl]} size={26} />
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontWeight: isSelf ? 700 : 500,
                        fontSize: "13.5px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {entry.displayName}
                      {isSelf && " (you)"}
                    </span>
                    <span style={{ fontWeight: 700, fontSize: "13.5px", flexShrink: 0 }}>{meta.format(valueOf(entry))}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function CelebrationBanner({ winners }) {
  if (!winners || winners.length === 0) return null;
  return (
    <div className="hero-banner gold celebration-banner" style={{ marginBottom: "24px" }}>
      <h1>🎉 Last Week's Champions</h1>
      <p>Fresh board, fresh chance — anyone can take the top spot this week.</p>
      <div style={{ display: "flex", gap: "24px", flexWrap: "wrap", marginTop: "20px" }}>
        {winners.map((w, i) => {
          const meta = CATEGORY[w.category];
          if (!meta) return null;
          return (
            <div
              key={w.category}
              style={{ display: "flex", alignItems: "center", gap: "10px", opacity: 0, animation: "lb-rise .5s ease both", animationDelay: `${0.15 + i * 0.12}s` }}
            >
              <span
                style={{
                  width: 38, height: 38, borderRadius: "10px", flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "rgba(255,255,255,0.18)", color: "#fff",
                }}
              >
                <Icon name={meta.icon} size={17} />
              </span>
              <div>
                <div style={{ fontWeight: 700, color: "#fff", fontSize: "14.5px" }}>🏆 {w.displayName}</div>
                <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.75)" }}>
                  {meta.label} · {meta.format(w.score)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Fires once per member per week the moment they land on the board while
// sitting at #1 in any category — a small unearned bonus of delight, not
// something to repeat on every visit, so it's gated behind sessionStorage.
function useTopSpotConfetti(data, uid) {
  const [show, setShow] = useState(false);
  const firedRef = useRef(false);

  useEffect(() => {
    if (!data || !uid || firedRef.current || prefersReducedMotion()) return;
    const isTop = [data.tasks?.[0], data.prospects?.[0], data.earnings?.[0]].some((e) => e?.uid === uid);
    if (!isTop) return;

    const key = `lb_confetti_${uid}_${data.weekStart}`;
    if (sessionStorage.getItem(key)) return;

    sessionStorage.setItem(key, "1");
    firedRef.current = true;
    setShow(true);
    const t = setTimeout(() => setShow(false), 3200);
    return () => clearTimeout(t);
  }, [data, uid]);

  return show;
}

function Confetti() {
  const pieces = useMemo(() => {
    const colors = ["var(--gold)", "var(--blue)", "var(--blue-bright)", "var(--success)"];
    return Array.from({ length: 44 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.5,
      duration: 2.2 + Math.random() * 1.3,
      color: colors[i % colors.length],
      width: 6 + Math.random() * 4,
      height: 10 + Math.random() * 6,
    }));
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 500, overflow: "hidden" }} aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            width: `${p.width}px`,
            height: `${p.height}px`,
            background: p.color,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

function LogEarningForm({ onLogged }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const parsed = Number(amount);
    if (!parsed || parsed <= 0) {
      toast.error("Enter an amount greater than zero.");
      return;
    }
    setSaving(true);
    try {
      await logEarning(parsed, note.trim());
      toast.success("Earning submitted — an admin will verify it before it counts.");
      setAmount("");
      setNote("");
      setOpen(false);
      onLogged();
    } catch (err) {
      toast.error(err.message ?? "Couldn't submit that earning.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        <Icon name="dollar-sign" size={14} />
        Log an earning
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Log an Earning">
        <form onSubmit={submit}>
          <div className="field">
            <label>Amount ($)</label>
            <input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" autoFocus />
          </div>
          <div className="field">
            <label>Note (optional)</label>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What sale or commission was this?" />
          </div>
          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Submitting…" : "Submit for review"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

const SUBMISSION_ICON = { pending: "clock", verified: "check", rejected: "x" };

function MySubmissions({ uid }) {
  const { data: entries } = useSupabaseQuery(
    () =>
      uid &&
      supabase.from("earnings_logs").select("*").eq("uid", uid).order("created_at", { ascending: false }).limit(5),
    [uid],
  );

  if (!entries || entries.length === 0) return null;

  return (
    <div style={{ marginTop: "16px" }}>
      <div className="row-meta" style={{ marginBottom: "8px" }}>
        Your recent submissions
      </div>
      <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "6px" }}>
        {entries.map((e, i) => (
          <li
            key={e.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "13.5px",
              opacity: 0,
              animation: "lb-rise .35s ease both",
              animationDelay: `${i * 0.05}s`,
            }}
          >
            <span>${e.amount}</span>
            <span className={`badge ${EARNING_STATUS_BADGE[e.status] ?? "badge-neutral"}`} style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
              <Icon name={SUBMISSION_ICON[e.status] ?? "clock"} size={11} />
              {e.status}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Admin-only: log an earning on an arbitrary member's behalf. Unlike
// LogEarningForm (self-report, lands 'pending'), an admin entering this
// directly is already the trusted party, so admin_log_earning inserts
// straight to 'verified' -- no separate review step, see
// supabase/migrations/0048_admin_log_earning.sql.
function AdminLogEarningForm({ onLogged }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState({ selected: null, claimedName: "" });
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!picked.selected) {
      toast.error("Pick a member to log this earning for.");
      return;
    }
    const parsed = Number(amount);
    if (!parsed || parsed <= 0) {
      toast.error("Enter an amount greater than zero.");
      return;
    }
    setSaving(true);
    try {
      await adminLogEarning(picked.selected.id, parsed, note.trim());
      toast.success(`$${parsed} logged for ${picked.selected.display_name}.`);
      setPicked({ selected: null, claimedName: "" });
      setAmount("");
      setNote("");
      setOpen(false);
      onLogged();
    } catch (err) {
      toast.error(err.message ?? "Couldn't log that earning.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button type="button" className="btn btn-secondary" style={{ padding: "8px 16px", fontSize: "13px" }} onClick={() => setOpen(true)}>
        <Icon name="plus" size={13} style={{ verticalAlign: "-2px", marginRight: "4px" }} />
        Log earning
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Log an Earning for a Member">
        <form onSubmit={submit}>
          <p style={{ fontSize: "13.5px", color: "var(--slate)", marginBottom: "16px" }}>
            Entered by an admin, so it's counted right away — no review needed.
          </p>
          <div className="field">
            <label>Member</label>
            <SponsorPicker
              value={picked}
              onChange={(v) => setPicked({ selected: v.selected, claimedName: "" })}
            />
          </div>
          <div className="field">
            <label>Amount ($)</label>
            <input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </div>
          <div className="field">
            <label>Note (optional)</label>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What sale or commission was this?" />
          </div>
          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Logging…" : "Log earning"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

// Admin-only: the pending-review queue, formerly its own page
// (pages/admin/EarningsReview.jsx) -- folded in here since it's really just
// another view onto the same earnings_logs table this page already reads.
function EarningRow({ entry, onResolved }) {
  const toast = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const decide = async (decision) => {
    if (decision === "rejected" && !window.confirm(`Reject this $${entry.amount} earning submission?`)) return;
    setBusy(true);
    try {
      await reviewEarning(entry.id, decision, note.trim());
      toast.success(decision === "verified" ? "Earning verified." : "Earning rejected.");
      onResolved();
    } catch (err) {
      toast.error(err.message ?? "Couldn't review that submission.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card-elevated" style={{ marginBottom: "14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "8px", marginBottom: "10px" }}>
        <div>
          <Link to={`/admin/members/${entry.uid}`} style={{ fontWeight: 600 }}>
            {entry.member?.display_name || entry.member?.email || "Unknown member"}
          </Link>
          <div style={{ fontSize: "12.5px", color: "var(--slate)" }}>{new Date(entry.earned_at).toLocaleString()}</div>
        </div>
        <div style={{ fontSize: "20px", fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif" }}>${entry.amount}</div>
      </div>

      {entry.note && <p style={{ fontSize: "13.5px", color: "var(--slate)", marginBottom: "12px" }}>"{entry.note}"</p>}

      <div className="field" style={{ marginBottom: "10px" }}>
        <label>Note (optional)</label>
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason, if rejecting" />
      </div>

      <div style={{ display: "flex", gap: "8px" }}>
        <button type="button" className="btn btn-primary" onClick={() => decide("verified")} disabled={busy}>
          Verify
        </button>
        <button type="button" className="btn btn-danger" onClick={() => decide("rejected")} disabled={busy}>
          Reject
        </button>
      </div>
    </div>
  );
}

function PendingEarningsReview() {
  const { loading, data: entries, refetch } = useSupabaseQuery(
    () =>
      supabase
        .from("earnings_logs")
        .select("*, member:profiles!earnings_logs_uid_fkey(display_name, email)")
        .eq("status", "pending")
        .order("earned_at", { ascending: true }),
    [],
  );

  return (
    <div className="card-elevated">
      <div className="card-title">Pending earnings to verify</div>
      <p style={{ fontSize: "13.5px", color: "var(--slate)", marginBottom: "14px" }}>
        Members self-report earnings for the weekly leaderboard. Only verified amounts count toward Top Earner —
        review each submission before it's counted.
      </p>

      {loading && <Skeleton variant="card" height="140px" />}
      {!loading && (entries ?? []).length === 0 && (
        <EmptyState icon={<Icon name="dollar-sign" size={26} />} title="No earnings waiting for review" />
      )}
      {(entries ?? []).map((e) => (
        <EarningRow key={e.id} entry={e} onResolved={refetch} />
      ))}
    </div>
  );
}

export default function Leaderboard() {
  const { user, role } = useAuth();

  const { loading, error, data, refetch } = useSupabaseQuery(() => user && supabase.rpc("get_leaderboards", {}), [user?.id]);
  const showConfetti = useTopSpotConfetti(data, user?.id);
  const revealedRef = useRef(false);
  const revealed = !loading && !error && !!data;
  useEffect(() => {
    if (revealed) revealedRef.current = true;
  }, [revealed]);

  return (
    <div>
      {showConfetti && <Confetti />}

      <div className="hero-banner" style={{ marginBottom: "24px" }}>
        <h1>🏆 Weekly Leaderboard</h1>
        <p>100% task completion, most prospects, top earner — a fresh board every Monday. Anyone can win it.</p>
      </div>

      {loading && (
        <div className="grid grid-3" style={{ marginBottom: "24px" }}>
          <Skeleton variant="card" height="280px" />
          <Skeleton variant="card" height="280px" />
          <Skeleton variant="card" height="280px" />
        </div>
      )}
      {error && <ErrorState description="Couldn't load the leaderboard." />}

      {!loading && !error && (
        <>
          <CelebrationBanner winners={data?.lastWeekWinners} />

          <div className="grid grid-3" style={{ marginBottom: "24px" }}>
            <BoardCard category="tasks" entries={data?.tasks} currentUid={user?.id} valueOf={(e) => e.completionPercent} revealed={revealed && !revealedRef.current} />
            <BoardCard category="prospects" entries={data?.prospects} currentUid={user?.id} valueOf={(e) => e.prospectCount} revealed={revealed && !revealedRef.current} />
            <BoardCard category="earnings" entries={data?.earnings} currentUid={user?.id} valueOf={(e) => e.totalAmount} revealed={revealed && !revealedRef.current} />
          </div>

          <div className="card-elevated">
            <div className="card-title">Log this week's earnings</div>
            <p style={{ fontSize: "13.5px", color: "var(--slate)", marginBottom: "14px" }}>
              Submit a sale or commission — it counts toward Top Earner once an admin verifies it.
            </p>
            <LogEarningForm onLogged={refetch} />
            <MySubmissions uid={user?.id} />
          </div>

          {role === "admin" && (
            <div style={{ marginTop: "24px", display: "flex", flexDirection: "column", gap: "24px" }}>
              <AdminLogEarningForm onLogged={refetch} />
              <PendingEarningsReview />
            </div>
          )}
        </>
      )}
    </div>
  );
}
