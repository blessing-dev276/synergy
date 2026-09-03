import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../supabaseClient.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import { logEarning, adminLogEarning, reviewEarning, adminUpdatePointRule } from "../../lib/rpc.js";
import { useToast } from "../../components/state/Toast.jsx";
import Icon from "../../components/Icon.jsx";
import Modal from "../../components/Modal.jsx";
import Skeleton from "../../components/state/Skeleton.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";
import ErrorState from "../../components/state/ErrorState.jsx";
import SponsorPicker from "../../components/SponsorPicker.jsx";

// ================= Leaderboard, rebuilt around real points =================
// Backend: supabase/migrations/0099_leaderboard_points_system.sql. Every
// point on this page came from a real, already-recorded action (a task
// completed, a lesson finished, a Daily Report submitted, a prospect
// added, a follow-up logged) -- never typed in by the frontend. Categories
// (Overall/Learning/Work/Network/Consistency) mirror what get_leaderboard
// can actually compute; there's no "Change" column because there's no
// historical ranking snapshot to diff against yet (removed rather than
// faked, per product decision -- a real trend indicator is a reasonable
// follow-up once weekly snapshots exist).
//
// The old three-board weekly leaderboard (get_leaderboards, 0026/0060) is
// untouched -- Dashboard.jsx's "This Week's Leaders" preview still reads it
// directly, so nothing here drops or redefines it. Earnings logging/review
// (LogEarningForm and friends, below) is also untouched -- it's a real,
// independent feature -- just no longer feeds any ranking, matching the
// product decision to reward consistent activity, not income.

const PERIODS = [
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "all", label: "All Time" },
];

const CATEGORIES = [
  { key: "overall", label: "Overall", icon: "trophy" },
  { key: "learning", label: "Learning", icon: "book" },
  { key: "work", label: "Work", icon: "check-square" },
  { key: "network", label: "Network", icon: "network" },
  { key: "consistency", label: "Consistency", icon: "activity" },
];

// Where "you have no points here yet" should send a member, per category --
// the most direct place to go start earning in that lane.
const CATEGORY_CTA = {
  overall: { to: "/tasks", label: "Go to Today's Tasks" },
  learning: { to: "/learning", label: "Go to the Learning Hub" },
  work: { to: "/tasks", label: "Go to Today's Tasks" },
  network: { to: "/network", label: "Go to My Network" },
  consistency: { to: "/tasks", label: "Start today's streak" },
};

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

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

// Batch-signs every distinct photo_url across the current entries in one
// round trip (profile-photos is a private bucket, see 0023).
function useSignedPhotoUrls(entries) {
  const [photoUrls, setPhotoUrls] = useState({});

  useEffect(() => {
    const paths = [...new Set((entries ?? []).map((e) => e.photoUrl).filter(Boolean))];
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
  }, [entries]);

  return photoUrls;
}

// Animates a value counting up from 0 on first reveal -- the raw target is
// used for the final frame so the number always settles on the exact
// figure, only the climb there is eased. Skipped for reduced-motion.
function useCountUp(target, active) {
  const [value, setValue] = useState(0);
  const to = Number(target) || 0;

  useEffect(() => {
    if (!active || prefersReducedMotion()) {
      setValue(to);
      return;
    }
    let raf;
    const duration = 700;
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

// ================= Your Position =================
function YourPositionCard({ me, category, loading }) {
  const points = useCountUp(me?.points, !loading && me != null);

  if (loading) return <Skeleton variant="card" height="132px" />;

  if (!me) {
    const cta = CATEGORY_CTA[category];
    return (
      <div className="card-elevated" style={{ marginBottom: "24px" }}>
        <div className="card-title">Your Position</div>
        <p style={{ fontSize: "13.5px", color: "var(--slate)", margin: "6px 0 14px" }}>
          {category === "consistency"
            ? "You don't have an active streak yet — complete something today to start one."
            : "You haven't earned any points in this category yet — get on the board with real work."}
        </p>
        {cta && (
          <Link to={cta.to} className="btn btn-primary">
            {cta.label}
          </Link>
        )}
      </div>
    );
  }

  const isConsistency = category === "consistency";
  const primaryValue = isConsistency ? me.streak : Math.round(points);
  const primaryLabel = isConsistency ? "day streak" : "points";

  return (
    <div className="card-elevated" style={{ marginBottom: "24px", display: "flex", alignItems: "center", gap: "20px", flexWrap: "wrap" }}>
      <div
        style={{
          width: 64, height: 64, borderRadius: "16px", flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: me.rank === 1 ? "var(--gradient-gold)" : "var(--gradient-navy)",
          color: "#fff", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: "22px",
        }}
      >
        #{me.rank}
      </div>
      <div style={{ flex: 1, minWidth: "200px" }}>
        <div className="card-title" style={{ marginBottom: "2px" }}>
          Your Position
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: "10px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "20px", fontWeight: 700, color: "var(--navy)" }}>{me.displayName}</span>
          {me.levelTitle && <span className="badge badge-neutral">{me.levelTitle}</span>}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: "16px", marginTop: "6px", flexWrap: "wrap" }}>
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "22px", fontWeight: 700, color: "var(--navy)" }}>
            {primaryValue} <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--slate)" }}>{primaryLabel}</span>
          </span>
          {!isConsistency && me.streak > 0 && (
            <span className="streak-badge">
              <span aria-hidden="true">🔥</span> {me.streak} day{me.streak === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <p style={{ fontSize: "13px", color: "var(--slate)", marginTop: "8px", marginBottom: 0 }}>
          {me.rank === 1
            ? "🏆 You're currently #1!"
            : me.pointsToNextRank != null
              ? `You're ${me.pointsToNextRank} point${me.pointsToNextRank === 1 ? "" : "s"} away from #${me.rank - 1}.`
              : isConsistency && me.rank > 1
                ? `#${me.rank - 1} has a longer streak — keep today going.`
                : null}
        </p>
      </div>
    </div>
  );
}

// ================= Top 3 =================
const MEDAL = { 1: "🥇", 2: "🥈", 3: "🥉" };

function PodiumSlot({ rank, entry, isSelf, photoUrls, category, animate }) {
  const value = useCountUp(entry ? (category === "consistency" ? entry.streak : entry.points) : 0, animate);
  if (!entry) return <div className={`podium-slot rank-${rank}`} style={{ visibility: "hidden" }} />;

  return (
    <div className={`podium-slot rank-${rank}${isSelf ? " self" : ""}`} style={{ animationDelay: `${(3 - rank) * 0.1}s` }}>
      <div className="podium-medal">{MEDAL[rank]}</div>
      <div className="podium-avatar-wrap">
        <Avatar name={entry.displayName} photoUrl={photoUrls[entry.photoUrl]} size={rank === 1 ? 60 : 46} />
      </div>
      <div className="podium-name">{entry.displayName}</div>
      {isSelf && (
        <div style={{ fontSize: "10.5px", fontWeight: 700, color: "var(--blue)" }}>(you)</div>
      )}
      {entry.levelTitle && (
        <div style={{ fontSize: "11px", color: "var(--slate)", marginTop: "1px" }}>{entry.levelTitle}</div>
      )}
      <div className="podium-score">
        {Math.round(value)} {category === "consistency" ? (Math.round(value) === 1 ? "day" : "days") : "pts"}
      </div>
      {category !== "consistency" && entry.streak > 0 && (
        <div style={{ fontSize: "11px", color: "var(--slate)", marginTop: "2px" }}>
          🔥 {entry.streak} day{entry.streak === 1 ? "" : "s"}
        </div>
      )}
    </div>
  );
}

// ================= Main ranked list =================
function LeaderboardRow({ entry, isSelf, photoUrls, category, index }) {
  return (
    <li className={`leaderboard-row${isSelf ? " self" : ""}`} style={{ animationDelay: `${0.25 + index * 0.03}s` }}>
      <span className={`leaderboard-rank ${rankClass(entry.rank)}`}>{entry.rank}</span>
      <Avatar name={entry.displayName} photoUrl={photoUrls[entry.photoUrl]} size={30} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: isSelf ? 700 : 600, fontSize: "13.5px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {entry.displayName}
          {isSelf && " (you)"}
        </div>
        {entry.levelTitle && <div style={{ fontSize: "11.5px", color: "var(--slate)" }}>{entry.levelTitle}</div>}
      </div>
      {category === "consistency" ? (
        <span style={{ fontWeight: 700, fontSize: "13.5px", flexShrink: 0 }}>
          🔥 {entry.streak} day{entry.streak === 1 ? "" : "s"}
        </span>
      ) : (
        <>
          {entry.streak > 0 && (
            <span style={{ fontSize: "12px", color: "var(--slate)", flexShrink: 0 }}>🔥 {entry.streak}</span>
          )}
          <span style={{ fontWeight: 700, fontSize: "13.5px", flexShrink: 0, minWidth: "56px", textAlign: "right" }}>
            {entry.points} pts
          </span>
        </>
      )}
    </li>
  );
}

// ================= This Week's Highlights =================
const HIGHLIGHT_META = {
  consistency: { icon: "activity", label: "Consistency Champion", emoji: "🔥", format: (v) => `${v} day${v === 1 ? "" : "s"}` },
  learning: { icon: "book", label: "Learning Champion", emoji: "🎓", format: (v) => `${v} pts` },
  work: { icon: "check-square", label: "Work Champion", emoji: "💼", format: (v) => `${v} pts` },
  network: { icon: "network", label: "Network Builder", emoji: "🌐", format: (v) => `${v} pts` },
};

function HighlightsSection({ highlights }) {
  const entries = Object.entries(HIGHLIGHT_META).filter(([key]) => highlights?.[key]);
  if (entries.length === 0) return null;

  return (
    <div className="card-elevated" style={{ marginBottom: "24px" }}>
      <div className="card-title">This Week's Highlights</div>
      <div className="grid grid-3" style={{ marginTop: "14px", gap: "14px" }}>
        {entries.map(([key, meta]) => {
          const winner = highlights[key];
          return (
            <div key={key} className="card" style={{ padding: "14px", textAlign: "center" }}>
              <div style={{ fontSize: "20px" }}>{meta.emoji}</div>
              <div style={{ fontSize: "11px", color: "var(--slate)", fontWeight: 600, margin: "4px 0 8px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {meta.label}
              </div>
              <div style={{ fontWeight: 700, fontSize: "14px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {winner.displayName}
              </div>
              <div style={{ fontSize: "12.5px", color: "var(--slate)", marginTop: "2px" }}>{meta.format(winner.value)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ================= How Points Work =================
function PointRuleRow({ rule, isAdmin, onSaved }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [points, setPoints] = useState(rule.points);
  const [dailyCap, setDailyCap] = useState(rule.daily_cap ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await adminUpdatePointRule(rule.key, Number(points), dailyCap === "" ? null : Number(dailyCap));
      toast.success("Point rule updated.");
      setEditing(false);
      onSaved();
    } catch (err) {
      toast.error(err.message ?? "Couldn't update that rule.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "9px 0", borderBottom: "1px solid var(--line)" }}>
      <span style={{ fontSize: "13.5px" }}>{rule.label}</span>
      {editing ? (
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
          <input type="number" min="0" value={points} onChange={(e) => setPoints(e.target.value)} style={{ width: "64px", padding: "5px 8px" }} />
          <span style={{ fontSize: "12px", color: "var(--slate)" }}>pts, cap/day</span>
          <input type="number" min="1" value={dailyCap} onChange={(e) => setDailyCap(e.target.value)} placeholder="none" style={{ width: "64px", padding: "5px 8px" }} />
          <button type="button" className="btn btn-primary" style={{ padding: "5px 10px", fontSize: "12px" }} onClick={save} disabled={saving}>
            {saving ? "…" : "Save"}
          </button>
          <button type="button" className="btn btn-secondary" style={{ padding: "5px 10px", fontSize: "12px" }} onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
          <span className="badge badge-info">
            +{rule.points} pt{rule.points === 1 ? "" : "s"}
          </span>
          {rule.daily_cap && <span style={{ fontSize: "11.5px", color: "var(--slate)" }}>up to {rule.daily_cap}/day</span>}
          {isAdmin && (
            <button type="button" className="btn btn-secondary" style={{ padding: "5px 10px", fontSize: "12px" }} onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function HowPointsWorkSection({ isAdmin }) {
  const { loading, data: rules, refetch } = useSupabaseQuery(
    () => supabase.from("leaderboard_point_rules").select("*").order("points", { ascending: false }),
    [],
  );

  return (
    <div className="card-elevated" style={{ marginBottom: "24px" }}>
      <div className="card-title">How Points Work</div>
      <p style={{ fontSize: "13.5px", color: "var(--slate)", margin: "6px 0 4px" }}>
        Points come from real activity only — completing tasks, learning, reporting your work, and building your
        network. Income isn't part of the score.
      </p>
      {loading && <Skeleton variant="text" height="18px" />}
      {!loading &&
        (rules ?? []).map((r) => <PointRuleRow key={r.key} rule={r} isAdmin={isAdmin} onSaved={refetch} />)}
    </div>
  );
}

// ================= Earnings log (unchanged behavior, no longer ranked) =================
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
      toast.success("Earning submitted — an admin will verify it.");
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

const EARNING_STATUS_BADGE = { pending: "badge-warning", verified: "badge-success", rejected: "badge-danger" };
const EARNING_STATUS_ICON = { pending: "clock", verified: "check", rejected: "x" };

function MyEarnings({ uid }) {
  const { data: entries } = useSupabaseQuery(
    () => uid && supabase.from("earnings_logs").select("*").eq("uid", uid).order("created_at", { ascending: false }).limit(5),
    [uid],
  );

  if (!entries || entries.length === 0) return null;

  return (
    <div style={{ marginTop: "16px" }}>
      <div className="row-meta" style={{ marginBottom: "8px" }}>
        Your recent entries
      </div>
      <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "6px" }}>
        {entries.map((e) => (
          <li key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13.5px" }}>
            <span>${e.amount}</span>
            <span className={`badge ${EARNING_STATUS_BADGE[e.status] ?? "badge-neutral"}`} style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
              <Icon name={EARNING_STATUS_ICON[e.status] ?? "clock"} size={11} />
              {e.status}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

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
            <SponsorPicker value={picked} onChange={(v) => setPicked({ selected: v.selected, claimedName: "" })} />
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

function EarningRow({ entry, onResolved }) {
  const toast = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const decide = async (decision) => {
    if (decision === "rejected" && !window.confirm(`Reject this $${entry.amount} earning report?`)) return;
    setBusy(true);
    try {
      await reviewEarning(entry.id, decision, note.trim());
      toast.success(decision === "verified" ? "Earning verified." : "Earning rejected.");
      onResolved();
    } catch (err) {
      toast.error(err.message ?? "Couldn't review that report.");
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
        Members self-report earnings here for their own records — review each one, but note it no longer affects
        ranking.
      </p>
      {loading && <Skeleton variant="card" height="140px" />}
      {!loading && (entries ?? []).length === 0 && <EmptyState icon={<Icon name="dollar-sign" size={26} />} title="No earnings waiting for review" />}
      {(entries ?? []).map((e) => (
        <EarningRow key={e.id} entry={e} onResolved={refetch} />
      ))}
    </div>
  );
}

// ================= Page =================
export default function Leaderboard() {
  const { user, role } = useAuth();
  const [period, setPeriod] = useState("week");
  const [category, setCategory] = useState("overall");

  const { loading, error, data, refetch } = useSupabaseQuery(
    () => user && supabase.rpc("get_leaderboard", { p_period: period, p_category: category }),
    [user?.id, period, category],
  );
  const { data: highlights } = useSupabaseQuery(() => user && supabase.rpc("get_weekly_highlights", {}), [user?.id]);

  // Memoized: data?.entries ?? [] would otherwise be a brand-new array
  // reference on every render while data is still null (loading), which
  // fed a fresh array into useSignedPhotoUrls' effect below every single
  // render and looped forever (setState -> re-render -> new [] -> effect
  // fires again). One stable reference per real data change fixes it.
  const entries = useMemo(() => data?.entries ?? [], [data]);
  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3);
  const photoUrls = useSignedPhotoUrls(entries);
  const revealed = !loading && !error && !!data;

  const isEmpty = !loading && !error && (data?.totalRanked ?? 0) === 0;

  return (
    <div>
      <div className="hero-banner" style={{ marginBottom: "24px" }}>
        <h1>Leaderboard</h1>
        <p>See who's putting in the work and challenge yourself to move up.</p>
      </div>

      <div className="task-filter-row">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            type="button"
            className={`btn btn-sm ${period === p.key ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setPeriod(p.key)}
            disabled={category === "consistency"}
          >
            {p.label}
          </button>
        ))}
        {category === "consistency" && (
          <span style={{ fontSize: "12.5px", color: "var(--slate)", alignSelf: "center" }}>
            Streaks are always current — the period filter doesn't apply here.
          </span>
        )}
      </div>
      <div className="task-filter-row">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            className={`btn btn-sm ${category === c.key ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setCategory(c.key)}
          >
            <Icon name={c.icon} size={12} style={{ verticalAlign: "-2px", marginRight: "5px" }} />
            {c.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="grid grid-3" style={{ marginBottom: "24px" }}>
          <Skeleton variant="card" height="280px" />
        </div>
      )}
      {error && <ErrorState description="Couldn't load the leaderboard." />}

      {!loading && !error && (
        <>
          <YourPositionCard me={data?.me} category={category} loading={false} />

          {isEmpty ? (
            <div className="card-elevated" style={{ marginBottom: "24px", textAlign: "center", padding: "40px 24px" }}>
              <div style={{ fontSize: "28px", marginBottom: "10px" }}>🚀</div>
              <div className="card-title" style={{ justifyContent: "center" }}>
                The leaderboard is getting started
              </div>
              <p style={{ fontSize: "13.5px", color: "var(--slate)", maxWidth: "420px", margin: "6px auto 0" }}>
                Keep showing up and completing your work. Rankings will appear here as members build activity.
              </p>
            </div>
          ) : (
            <>
              <HighlightsSection highlights={highlights} />

              <div className="card-elevated" style={{ marginBottom: "24px" }}>
                <div className="leaderboard-podium">
                  <PodiumSlot rank={2} entry={top3[1]} isSelf={top3[1]?.uid === user?.id} photoUrls={photoUrls} category={category} animate={revealed} />
                  <PodiumSlot rank={1} entry={top3[0]} isSelf={top3[0]?.uid === user?.id} photoUrls={photoUrls} category={category} animate={revealed} />
                  <PodiumSlot rank={3} entry={top3[2]} isSelf={top3[2]?.uid === user?.id} photoUrls={photoUrls} category={category} animate={revealed} />
                </div>

                {rest.length > 0 && (
                  <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "4px", margin: 0, padding: 0 }}>
                    {rest.map((entry, i) => (
                      <LeaderboardRow key={entry.uid} entry={entry} isSelf={entry.uid === user?.id} photoUrls={photoUrls} category={category} index={i} />
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}

          <HowPointsWorkSection isAdmin={role === "admin"} />

          <div className="card-elevated" style={{ marginBottom: role === "admin" ? "24px" : 0 }}>
            <div className="card-title">Earnings Log</div>
            <p style={{ fontSize: "13.5px", color: "var(--slate)", marginBottom: "14px" }}>
              Keep track of what you've earned. This is informational only — the leaderboard above rewards
              consistent activity, not income.
            </p>
            <LogEarningForm onLogged={refetch} />
            <MyEarnings uid={user?.id} />
          </div>

          {role === "admin" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              <AdminLogEarningForm onLogged={refetch} />
              <PendingEarningsReview />
            </div>
          )}
        </>
      )}
    </div>
  );
}
