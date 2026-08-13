import { useState } from "react";
import { supabase } from "../../supabaseClient.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import { logEarning } from "../../lib/rpc.js";
import { useToast } from "../../components/state/Toast.jsx";
import Icon from "../../components/Icon.jsx";
import Skeleton from "../../components/state/Skeleton.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";
import ErrorState from "../../components/state/ErrorState.jsx";

const CATEGORY = {
  tasks: { icon: "check-square", label: "Task Completion", format: (s) => `${s}%` },
  prospects: { icon: "network", label: "Prospects", format: (s) => `${s}` },
  earnings: { icon: "dollar-sign", label: "Top Earner", format: (s) => `$${s}` },
};

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

function BoardCard({ category, entries, currentUid, valueOf }) {
  const meta = CATEGORY[category];
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
        <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "6px" }}>
          {entries.slice(0, 10).map((entry, i) => {
            const rank = i + 1;
            const isSelf = entry.uid === currentUid;
            return (
              <li key={entry.uid} className={`leaderboard-row${isSelf ? " self" : ""}`}>
                <span className={`leaderboard-rank ${rankClass(rank)}`}>{rank}</span>
                <span style={{ flex: 1, minWidth: 0, fontWeight: isSelf ? 700 : 500, fontSize: "13.5px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {entry.displayName}
                  {isSelf && " (you)"}
                </span>
                <span style={{ fontWeight: 700, fontSize: "13.5px", flexShrink: 0 }}>{meta.format(valueOf(entry))}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function CelebrationBanner({ winners }) {
  if (!winners || winners.length === 0) return null;
  return (
    <div className="hero-banner gold" style={{ marginBottom: "24px" }}>
      <h1>🎉 Last Week's Champions</h1>
      <p>Fresh board, fresh chance — anyone can take the top spot this week.</p>
      <div style={{ display: "flex", gap: "24px", flexWrap: "wrap", marginTop: "20px" }}>
        {winners.map((w) => {
          const meta = CATEGORY[w.category];
          if (!meta) return null;
          return (
            <div key={w.category} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
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
                <div style={{ fontWeight: 700, color: "#fff", fontSize: "14.5px" }}>{w.displayName}</div>
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

  if (!open) {
    return (
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        <Icon name="dollar-sign" size={14} />
        Log an earning
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="card-elevated" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>Amount ($)</label>
        <input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" autoFocus />
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>Note (optional)</label>
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What sale or commission was this?" />
      </div>
      <div style={{ display: "flex", gap: "8px" }}>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Submitting…" : "Submit for review"}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

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
        {entries.map((e) => (
          <li key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13.5px" }}>
            <span>${e.amount}</span>
            <span className={`badge ${EARNING_STATUS_BADGE[e.status] ?? "badge-neutral"}`}>{e.status}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Leaderboard() {
  const { user } = useAuth();

  const { loading, error, data, refetch } = useSupabaseQuery(() => user && supabase.rpc("get_leaderboards", {}), [user?.id]);

  return (
    <div>
      <div className="hero-banner" style={{ marginBottom: "24px" }}>
        <h1>🏆 Weekly Leaderboard</h1>
        <p>100% task completion, most prospects, top earner — a fresh board every Monday. Anyone can win it.</p>
      </div>

      {loading && <Skeleton variant="card" height="200px" />}
      {error && <ErrorState description="Couldn't load the leaderboard." />}

      {!loading && !error && (
        <>
          <CelebrationBanner winners={data?.lastWeekWinners} />

          <div className="grid grid-3" style={{ marginBottom: "24px" }}>
            <BoardCard category="tasks" entries={data?.tasks} currentUid={user?.id} valueOf={(e) => e.completionPercent} />
            <BoardCard category="prospects" entries={data?.prospects} currentUid={user?.id} valueOf={(e) => e.prospectCount} />
            <BoardCard category="earnings" entries={data?.earnings} currentUid={user?.id} valueOf={(e) => e.totalAmount} />
          </div>

          <div className="card-elevated">
            <div className="card-title">Log this week's earnings</div>
            <p style={{ fontSize: "13.5px", color: "var(--slate)", marginBottom: "14px" }}>
              Submit a sale or commission — it counts toward Top Earner once an admin verifies it.
            </p>
            <LogEarningForm onLogged={refetch} />
            <MySubmissions uid={user?.id} />
          </div>
        </>
      )}
    </div>
  );
}
