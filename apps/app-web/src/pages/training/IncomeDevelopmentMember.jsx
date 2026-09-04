import { useState } from "react";
import { supabase } from "../../supabaseClient.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import { useToast } from "../../components/state/Toast.jsx";
import { setIncomeSkill, toggleIncomeMilestone, addIncomePortfolioItem, removeIncomePortfolioItem, addIncomeEntry, removeIncomeEntry } from "../../lib/rpc.js";
import Icon from "../../components/Icon.jsx";
import Skeleton from "../../components/state/Skeleton.jsx";
import ErrorState from "../../components/state/ErrorState.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";
import Modal from "../../components/Modal.jsx";
import SkillDevelopmentMember from "./SkillDevelopmentMember.jsx";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "skill_catalog", label: "Skill Catalog" },
  { key: "portfolio", label: "Portfolio" },
  { key: "income", label: "Income" },
  { key: "milestones", label: "Milestones" },
];

function formatMoney(n) {
  return `$${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ================= Overview =================
function OverviewTab({ summary }) {
  const done = summary?.milestonesDone ?? 0;
  return (
    <div className="grid grid-3">
      <div className="card">
        <div className="card-subtitle" style={{ marginBottom: "4px" }}>
          Milestones
        </div>
        <div style={{ fontSize: "26px", fontWeight: 700 }}>{done} of 5</div>
        {done >= 5 && <div style={{ color: "var(--success)", fontSize: "13px", marginTop: "4px" }}>Ready for Network Marketing 🎉</div>}
      </div>
      <div className="card">
        <div className="card-subtitle" style={{ marginBottom: "4px" }}>
          Skill
        </div>
        <div style={{ fontSize: "18px", fontWeight: 700 }}>{summary?.skillName || "Not chosen yet"}</div>
      </div>
      <div className="card">
        <div className="card-subtitle" style={{ marginBottom: "4px" }}>
          Portfolio items
        </div>
        <div style={{ fontSize: "26px", fontWeight: 700 }}>{summary?.portfolioCount ?? 0}</div>
      </div>
      <div className="card">
        <div className="card-subtitle" style={{ marginBottom: "4px" }}>
          Total earned
        </div>
        <div style={{ fontSize: "26px", fontWeight: 700 }}>{formatMoney(summary?.totalEarned)}</div>
      </div>
      <div className="card">
        <div className="card-subtitle" style={{ marginBottom: "4px" }}>
          First income
        </div>
        <div style={{ fontSize: "18px", fontWeight: 700 }}>{summary?.firstIncomeAt ? new Date(summary.firstIncomeAt).toLocaleDateString() : "Not yet"}</div>
      </div>
    </div>
  );
}

// ================= Portfolio =================
function AddPortfolioModal({ open, onClose, onAdded }) {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Give this piece a title.");
      return;
    }
    setSaving(true);
    try {
      await addIncomePortfolioItem(title.trim(), description.trim(), linkUrl.trim());
      onAdded();
      onClose();
      setTitle("");
      setDescription("");
      setLinkUrl("");
    } catch (err) {
      toast.error(err.message ?? "Couldn't add that.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Portfolio Item" size="sm">
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="pf-title">Title</label>
          <input id="pf-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pf-link">Link (optional)</label>
          <input id="pf-link" placeholder="https://…" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pf-desc">Description (optional)</label>
          <textarea id="pf-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Add"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PortfolioTab({ user, onChanged }) {
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const {
    loading,
    error,
    data: items,
    refetch,
  } = useSupabaseQuery(() => user && supabase.from("income_development_portfolio_items").select("*").eq("user_id", user.id).order("created_at", { ascending: false }), [user?.id]);

  const remove = async (id) => {
    try {
      await removeIncomePortfolioItem(id);
      refetch();
      onChanged();
    } catch (err) {
      toast.error(err.message ?? "Couldn't remove that.");
    }
  };

  const added = () => {
    refetch();
    onChanged();
  };

  if (loading) return <Skeleton variant="card" height="100px" />;
  if (error) return <ErrorState description="Couldn't load your portfolio." />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "12px" }}>
        <button type="button" className="btn btn-primary" onClick={() => setModalOpen(true)}>
          <Icon name="plus" size={14} /> Add item
        </button>
      </div>
      {(!items || items.length === 0) ? (
        <div className="card">
          <EmptyState icon={<Icon name="briefcase" size={26} />} title="No portfolio items yet" description="Add the work you've built to show what you can do." />
        </div>
      ) : (
        items.map((it) => (
          <div key={it.id} className="card" style={{ marginBottom: "10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
              <div>
                <div className="card-title" style={{ marginBottom: "2px" }}>
                  {it.title}
                </div>
                {it.description && <div style={{ fontSize: "13.5px", color: "var(--slate)" }}>{it.description}</div>}
                {it.link_url && (
                  <a href={it.link_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "13px" }}>
                    View ↗
                  </a>
                )}
              </div>
              <button type="button" className="icon-btn icon-btn-danger" onClick={() => remove(it.id)}>
                <Icon name="trash" size={14} />
              </button>
            </div>
          </div>
        ))
      )}
      <AddPortfolioModal open={modalOpen} onClose={() => setModalOpen(false)} onAdded={added} />
    </div>
  );
}

// ================= Income =================
function AddIncomeModal({ open, onClose, onAdded }) {
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [source, setSource] = useState("");
  const [earnedOn, setEarnedOn] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const num = Number(amount);
    if (!(num > 0)) {
      toast.error("Enter an amount greater than zero.");
      return;
    }
    setSaving(true);
    try {
      await addIncomeEntry(num, source.trim(), earnedOn, note.trim());
      toast.success("Logged.");
      onAdded();
      onClose();
      setAmount("");
      setSource("");
      setNote("");
    } catch (err) {
      toast.error(err.message ?? "Couldn't log that.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Log Income" size="sm">
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="inc-amount">Amount</label>
          <input id="inc-amount" type="number" min="0.01" step="0.01" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="inc-source">Source (optional)</label>
          <input id="inc-source" placeholder="e.g. Client project" value={source} onChange={(e) => setSource(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="inc-date">Date earned</label>
          <input id="inc-date" type="date" value={earnedOn} onChange={(e) => setEarnedOn(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="inc-note">Note (optional)</label>
          <textarea id="inc-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Log"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function IncomeTab({ user, onChanged }) {
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const {
    loading,
    error,
    data: entries,
    refetch,
  } = useSupabaseQuery(() => user && supabase.from("income_development_income_entries").select("*").eq("user_id", user.id).order("earned_on", { ascending: false }), [user?.id]);

  const remove = async (id) => {
    try {
      await removeIncomeEntry(id);
      refetch();
      onChanged();
    } catch (err) {
      toast.error(err.message ?? "Couldn't remove that.");
    }
  };

  const added = () => {
    refetch();
    onChanged();
  };

  if (loading) return <Skeleton variant="card" height="100px" />;
  if (error) return <ErrorState description="Couldn't load your income log." />;

  const total = (entries ?? []).reduce((sum, e) => sum + Number(e.amount), 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <div style={{ fontSize: "15px", fontWeight: 700 }}>Total: {formatMoney(total)}</div>
        <button type="button" className="btn btn-primary" onClick={() => setModalOpen(true)}>
          <Icon name="plus" size={14} /> Log income
        </button>
      </div>
      {(!entries || entries.length === 0) ? (
        <div className="card">
          <EmptyState icon={<Icon name="dollar-sign" size={26} />} title="Nothing logged yet" description="Log your first payment to start tracking real income." />
        </div>
      ) : (
        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Source</th>
                <th>Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td>{new Date(e.earned_on).toLocaleDateString()}</td>
                  <td>{e.source || "—"}</td>
                  <td>{formatMoney(e.amount)}</td>
                  <td>
                    <button type="button" className="icon-btn icon-btn-danger" onClick={() => remove(e.id)}>
                      <Icon name="trash" size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <AddIncomeModal open={modalOpen} onClose={() => setModalOpen(false)} onAdded={added} />
    </div>
  );
}

// ================= Milestones =================
function MilestonesTab({ summary, refetch }) {
  const toast = useToast();
  const [skillDraft, setSkillDraft] = useState(summary?.skillName ?? "");
  const [busy, setBusy] = useState(null);

  const saveSkill = async () => {
    if (!skillDraft.trim()) {
      toast.error("Enter the skill you're learning.");
      return;
    }
    setBusy("skill");
    try {
      await setIncomeSkill(skillDraft.trim());
      refetch();
    } catch (err) {
      toast.error(err.message ?? "Couldn't save that.");
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (key, done) => {
    setBusy(key);
    try {
      await toggleIncomeMilestone(key, done);
      refetch();
    } catch (err) {
      toast.error(err.message ?? "Couldn't update that.");
    } finally {
      setBusy(null);
    }
  };

  const Row = ({ done, children }) => (
    <li className="rank-requirement-row">
      <span className={`today-task-check${done ? " done" : ""}`} aria-hidden="true">
        {done && <Icon name="check" size={11} />}
      </span>
      <div style={{ flex: 1 }}>{children}</div>
    </li>
  );

  return (
    <div className="card">
      <ul className="rank-requirement-list">
        <Row done={!!summary?.skillSelectedAt}>
          <div style={{ fontWeight: 600, marginBottom: "6px" }}>1. Learn a digital skill</div>
          <div style={{ display: "flex", gap: "8px" }}>
            <input placeholder="e.g. Copywriting" value={skillDraft} onChange={(e) => setSkillDraft(e.target.value)} style={{ flex: 1 }} />
            <button type="button" className="btn btn-secondary" onClick={saveSkill} disabled={busy === "skill"}>
              Save
            </button>
          </div>
        </Row>
        <Row done={!!summary?.portfolioBuiltAt}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 600 }}>2. Build a portfolio</span>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => toggle("portfolio_built", !summary?.portfolioBuiltAt)}
              disabled={busy === "portfolio_built"}
            >
              {summary?.portfolioBuiltAt ? "Mark not done" : "Mark done"}
            </button>
          </div>
        </Row>
        <Row done={!!summary?.freelancingStartedAt}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 600 }}>3. Start freelancing</span>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => toggle("freelancing_started", !summary?.freelancingStartedAt)}
              disabled={busy === "freelancing_started"}
            >
              {summary?.freelancingStartedAt ? "Mark not done" : "Mark done"}
            </button>
          </div>
        </Row>
        <Row done={!!summary?.firstIncomeAt}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 600 }}>4. Earn first income</span>
            <span className="badge badge-neutral" title="Set automatically from your Income log">
              Automatic
            </span>
          </div>
        </Row>
        <Row done={!!summary?.consistencyAt}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 600 }}>5. Build consistency</span>
            <button type="button" className="btn btn-secondary" onClick={() => toggle("consistency", !summary?.consistencyAt)} disabled={busy === "consistency"}>
              {summary?.consistencyAt ? "Mark not done" : "Mark done"}
            </button>
          </div>
        </Row>
      </ul>
    </div>
  );
}

export default function IncomeDevelopmentMember() {
  const { user } = useAuth();
  const [tab, setTab] = useState("overview");

  const { loading, error, data: summary, refetch } = useSupabaseQuery(() => supabase.rpc("get_my_income_development", {}), []);

  if (loading) return <Skeleton variant="card" height="180px" />;
  if (error) return <ErrorState description="Couldn't load Income Development." />;

  return (
    <div>
      <div className="page-tabs" style={{ marginBottom: "16px" }}>
        {TABS.map((t) => (
          <button key={t.key} type="button" className={`page-tab${tab === t.key ? " active" : ""}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab summary={summary} />}
      {tab === "skill_catalog" && <SkillDevelopmentMember purpose="income_development" />}
      {tab === "portfolio" && <PortfolioTab user={user} onChanged={refetch} />}
      {tab === "income" && <IncomeTab user={user} onChanged={refetch} />}
      {tab === "milestones" && <MilestonesTab summary={summary} refetch={refetch} />}
    </div>
  );
}
