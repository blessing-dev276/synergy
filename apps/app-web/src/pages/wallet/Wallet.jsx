import { useState } from "react";
import { supabase } from "../../supabaseClient.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import { requestWithdrawal, logSavingsEntry } from "../../lib/rpc.js";
import { useToast } from "../../components/state/Toast.jsx";
import Icon from "../../components/Icon.jsx";
import Modal from "../../components/Modal.jsx";
import Skeleton from "../../components/state/Skeleton.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";

function formatMoney(amount, currency) {
  const n = Number(amount ?? 0);
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency === "NGN" ? `${sign}₦${abs}` : `${sign}$${abs}`;
}

// Same "icon-badge + label + big value" shape AdminDashboard.jsx/
// NetworkDashboard.jsx already use for their own local StatTile/StatCard --
// no shared component exists for this across the app, each page defines
// its own, so this follows that same convention rather than introducing one.
function StatTile({ label, value, sub, icon, tone, loading }) {
  return (
    <div className="card-elevated">
      <div className="stat-tile">
        <span className={`icon-badge ${tone ? `tone-${tone}` : ""}`}>
          <Icon name={icon} size={18} />
        </span>
        <div>
          <div className="stat-tile-label">{label}</div>
          {loading ? <Skeleton variant="text" width="70px" height="26px" /> : <div className="stat-tile-value">{value}</div>}
          {!loading && sub && <div style={{ fontSize: "12px", color: "var(--slate)", marginTop: "2px" }}>{sub}</div>}
        </div>
      </div>
    </div>
  );
}

const WITHDRAWAL_STATUS_BADGE = { pending: "badge-warning", paid: "badge-success", rejected: "badge-danger" };
const TXN_ICON = { income: "dollar-sign", withdrawal: "arrow-up", savings: "lock" };
const TXN_LABEL = { income: "Income", withdrawal: "Withdrawal", savings: "Savings" };

function TransactionRow({ txn }) {
  const statusBadge = txn.kind === "withdrawal" ? WITHDRAWAL_STATUS_BADGE[txn.status] ?? "badge-neutral" : "badge-neutral";
  const statusLabel = txn.kind === "withdrawal" ? txn.status : txn.kind === "income" ? "verified" : "logged";

  return (
    <div className="activity-row">
      <span className="activity-row-icon">
        <Icon name={TXN_ICON[txn.kind]} size={15} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="activity-row-text">
          <strong>{TXN_LABEL[txn.kind]}</strong> · {formatMoney(txn.amount, txn.currency)}
          {txn.note && <span style={{ color: "var(--slate)" }}> — {txn.note}</span>}
        </div>
        <div className="activity-row-time">{new Date(txn.occurredAt).toLocaleDateString()}</div>
      </div>
      <span className={`badge ${statusBadge}`}>{statusLabel}</span>
    </div>
  );
}

function RequestWithdrawalModal({ open, onClose, tier, onDone }) {
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!(Number(amount) > 0)) {
      toast.error("Enter an amount greater than zero.");
      return;
    }
    setSaving(true);
    try {
      await requestWithdrawal(Number(amount), currency, note.trim());
      toast.success("Withdrawal request submitted — an admin will review it.");
      setAmount("");
      setNote("");
      onDone();
    } catch (err) {
      toast.error(err.message ?? "Couldn't submit that request.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Request Withdrawal" size="sm">
      <form onSubmit={submit}>
        {tier && (
          <p style={{ fontSize: "12.5px", color: "var(--slate)", marginTop: "-4px", marginBottom: "14px" }}>
            Your current rank allows up to <strong style={{ color: "var(--navy)" }}>{formatMoney(tier.capAmount, tier.capCurrency)}</strong> per
            request.
          </p>
        )}
        <div className="field">
          <label>Amount</label>
          <input type="number" min="0.01" step="0.01" required autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        </div>
        <div className="field">
          <label>Currency</label>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option value="USD">USD ($)</option>
            <option value="NGN">NGN (₦)</option>
          </select>
        </div>
        <div className="field">
          <label>Note (optional)</label>
          <textarea rows={2} placeholder="Anything the admin should know" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Submitting…" : "Submit request"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function SavingsForm({ onDone }) {
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState("deposit");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!(Number(amount) > 0)) {
      toast.error("Enter an amount greater than zero.");
      return;
    }
    setSaving(true);
    try {
      await logSavingsEntry(direction === "deposit" ? Number(amount) : -Number(amount), note.trim());
      toast.success(direction === "deposit" ? "Added to savings." : "Taken out of savings.");
      setAmount("");
      setNote("");
      onDone();
    } catch (err) {
      toast.error(err.message ?? "Couldn't save that.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "flex-end" }}>
      <div className="field" style={{ marginBottom: 0, flex: "1 1 140px" }}>
        <label>Amount (₦)</label>
        <input type="number" min="0.01" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>&nbsp;</label>
        <select value={direction} onChange={(e) => setDirection(e.target.value)}>
          <option value="deposit">Add to savings</option>
          <option value="withdraw">Take out of savings</option>
        </select>
      </div>
      <div className="field" style={{ marginBottom: 0, flex: "1 1 160px" }}>
        <label>Note (optional)</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What's this for?" />
      </div>
      <button type="submit" className="btn btn-secondary" disabled={saving} style={{ marginBottom: "16px" }}>
        {saving ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

export default function Wallet() {
  const { user } = useAuth();
  const [requestOpen, setRequestOpen] = useState(false);

  const { loading: loadingSummary, data: summary, refetch: refetchSummary } = useSupabaseQuery(
    () => user && supabase.rpc("get_wallet_summary", { p_uid: user.id }),
    [user?.id],
  );
  const { loading: loadingTxns, data: transactions, refetch: refetchTransactions } = useSupabaseQuery(
    () => user && supabase.rpc("get_wallet_transactions", { p_uid: user.id }),
    [user?.id],
  );

  const refetchAll = () => {
    refetchSummary();
    refetchTransactions();
  };

  const withdrawnByCurrency = summary?.withdrawnByCurrency ?? {};
  const withdrawnSub = Object.entries(withdrawnByCurrency)
    .map(([currency, amount]) => formatMoney(amount, currency))
    .join(" + ");

  return (
    <div>
      <div className="hero-banner">
        <h1>My Wallet</h1>
        <p>Track your income, withdrawals, and savings — and request a withdrawal when you're ready.</p>
      </div>

      <div className="grid grid-3" style={{ marginBottom: "24px" }}>
        <StatTile label="Income (USD)" value={formatMoney(summary?.incomeTotalUsd, "USD")} icon="dollar-sign" loading={loadingSummary} />
        <StatTile
          label="Withdrawn (USD-equiv.)"
          value={formatMoney(summary?.withdrawnTotalUsd, "USD")}
          sub={withdrawnSub || undefined}
          icon="arrow-up"
          tone="warning"
          loading={loadingSummary}
        />
        <StatTile label="Remaining (USD)" value={formatMoney(summary?.remainingUsd, "USD")} icon="check" tone="success" loading={loadingSummary} />
        <StatTile label="Saved (NGN)" value={formatMoney(summary?.savedTotalNgn, "NGN")} icon="lock" loading={loadingSummary} />
      </div>

      <div className="card-elevated" style={{ marginBottom: "24px" }}>
        <div className="card-title">Request a withdrawal</div>
        {!loadingSummary && summary?.tier && (
          <p className="card-subtitle">
            Your current rank allows up to <strong style={{ color: "var(--navy)" }}>{formatMoney(summary.tier.capAmount, summary.tier.capCurrency)}</strong>{" "}
            per request, based on how much you've withdrawn so far.
          </p>
        )}
        {!loadingSummary && !summary?.tier && <p className="card-subtitle">No withdrawal limit is set for your rank right now.</p>}

        {!loadingSummary && summary?.pendingRequest ? (
          <div className="attention-row" style={{ marginTop: "4px" }}>
            <span className="icon-badge tone-warning">
              <Icon name="clock" size={17} />
            </span>
            <div style={{ flex: 1, fontWeight: 600, fontSize: "14px" }}>
              Pending request: {formatMoney(summary.pendingRequest.amount, summary.pendingRequest.currency)} — waiting on admin review.
            </div>
          </div>
        ) : (
          <button type="button" className="btn btn-primary" disabled={loadingSummary} onClick={() => setRequestOpen(true)}>
            <Icon name="arrow-up" size={14} style={{ verticalAlign: "-2px", marginRight: "5px" }} />
            Request Withdrawal
          </button>
        )}
      </div>

      <div className="card-elevated" style={{ marginBottom: "24px" }}>
        <div className="card-title">Savings</div>
        <p className="card-subtitle">Set money aside for your own tracking — this doesn't move money anywhere, it's just a running total for you.</p>
        <SavingsForm onDone={refetchAll} />
      </div>

      <div className="card-title" style={{ marginBottom: "12px" }}>
        Transaction history
      </div>
      {loadingTxns && <Skeleton variant="card" height="160px" />}
      {!loadingTxns && (!transactions || transactions.length === 0) && (
        <EmptyState icon={<Icon name="dollar-sign" size={26} />} title="No transactions yet" description="Your income, withdrawals, and savings will show up here." />
      )}
      {!loadingTxns && transactions && transactions.length > 0 && (
        <div className="card-elevated" style={{ padding: 0 }}>
          {transactions.map((txn) => (
            <TransactionRow key={`${txn.kind}-${txn.id}`} txn={txn} />
          ))}
        </div>
      )}

      <RequestWithdrawalModal
        open={requestOpen}
        onClose={() => setRequestOpen(false)}
        tier={summary?.tier}
        onDone={() => {
          setRequestOpen(false);
          refetchAll();
        }}
      />
    </div>
  );
}
