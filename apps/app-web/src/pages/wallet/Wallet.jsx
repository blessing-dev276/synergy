import { useState } from "react";
import { supabase } from "../../supabaseClient.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import { requestWithdrawal } from "../../lib/rpc.js";
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

function formatDateTime(value) {
  return value
    ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "—";
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
const TXN_ICON = { income: "dollar-sign", withdrawal: "arrow-up" };
const TXN_LABEL = { income: "Income", withdrawal: "Withdrawal" };

// Compact in the list; every field lives in the detail popup instead of
// being crammed into the row (TransactionDetailModal below) -- click
// anywhere on the row to open it.
function TransactionRow({ txn, onOpen }) {
  const statusBadge = txn.kind === "withdrawal" ? WITHDRAWAL_STATUS_BADGE[txn.status] ?? "badge-neutral" : "badge-neutral";
  const statusLabel = txn.kind === "withdrawal" ? txn.status : "verified";

  return (
    <button type="button" className="activity-row" style={{ width: "100%", textAlign: "left", cursor: "pointer", font: "inherit" }} onClick={() => onOpen(txn)}>
      <span className="activity-row-icon">
        <Icon name={TXN_ICON[txn.kind]} size={15} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="activity-row-text">
          <strong>{TXN_LABEL[txn.kind]}</strong> · {formatMoney(txn.amount, txn.currency)}
          {txn.note && <span style={{ color: "var(--slate)" }}> — {txn.note}</span>}
        </div>
        <div className="activity-row-time">{formatDateTime(txn.occurredAt)}</div>
      </div>
      <span className={`badge ${statusBadge}`}>{statusLabel}</span>
      <Icon name="chevron-right" size={16} style={{ color: "var(--slate)" }} />
    </button>
  );
}

function DetailLine({ label, value }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", padding: "7px 0", borderBottom: "1px solid var(--line)", fontSize: "13.5px" }}>
      <span style={{ color: "var(--slate)" }}>{label}</span>
      <span style={{ fontWeight: 600, textAlign: "right" }}>{value}</span>
    </div>
  );
}

function TransactionDetailModal({ txn, onClose }) {
  if (!txn) return null;
  const statusBadge = txn.kind === "withdrawal" ? WITHDRAWAL_STATUS_BADGE[txn.status] ?? "badge-neutral" : "badge-neutral";
  const statusLabel = txn.kind === "withdrawal" ? txn.status : "verified";

  return (
    <Modal open onClose={onClose} title={TXN_LABEL[txn.kind]} size="sm">
      <div style={{ marginBottom: "12px" }}>
        <span className={`badge ${statusBadge}`}>{statusLabel}</span>
      </div>
      <DetailLine label="Amount" value={formatMoney(txn.amount, txn.currency)} />
      {txn.kind === "withdrawal" && (
        <>
          <DetailLine label="Requested" value={formatMoney(txn.requestedAmount, txn.requestedCurrency)} />
          {txn.status === "paid" && (
            <>
              <DetailLine label="Paid out" value={formatMoney(Number(txn.netAmount) - Number(txn.chargesAmount || 0), txn.netCurrency)} />
              <DetailLine label="Charges" value={Number(txn.chargesAmount) > 0 ? formatMoney(txn.chargesAmount, txn.netCurrency) : null} />
              <DetailLine label="Exchange rate used" value={txn.exchangeRate ? `₦${Number(txn.exchangeRate).toLocaleString()} per $1` : null} />
              <DetailLine label="USD equivalent" value={txn.usdEquivalent != null ? formatMoney(txn.usdEquivalent, "USD") : null} />
            </>
          )}
          <DetailLine label="Requested on" value={formatDateTime(txn.occurredAt)} />
          <DetailLine label={txn.status === "pending" ? undefined : "Reviewed on"} value={txn.status === "pending" ? undefined : formatDateTime(txn.reviewedAt)} />
          <DetailLine label="Admin note" value={txn.reviewNote} />
        </>
      )}
      {txn.kind === "income" && <DetailLine label="Logged on" value={formatDateTime(txn.occurredAt)} />}
      <DetailLine label="Note" value={txn.note} />
    </Modal>
  );
}

// Requests are USD-only now -- the currency picker is gone, so there's no
// cross-currency comparison to do here: the tier cap (when its own
// currency is USD, the case this now always produces for new tiers) is
// enforced client-side too, not just server-side, via request_withdrawal's
// own check. A tier capped in NGN still can't be validated client-side
// without the reference rate, so that edge case is left to the server
// error, same as before.
function RequestWithdrawalModal({ open, onClose, tier, onDone }) {
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const capUsd = tier?.capCurrency === "USD" ? Number(tier.capAmount) : null;
  const overCap = capUsd != null && Number(amount) > capUsd;

  const submit = async (e) => {
    e.preventDefault();
    if (!(Number(amount) > 0)) {
      toast.error("Enter an amount greater than zero.");
      return;
    }
    if (overCap) {
      toast.error(`Your current tier allows at most ${formatMoney(capUsd, "USD")} per request.`);
      return;
    }
    setSaving(true);
    try {
      await requestWithdrawal(Number(amount), "USD", note.trim());
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
          <label>Amount (USD)</label>
          <input
            type="number"
            min="0.01"
            max={capUsd ?? undefined}
            step="0.01"
            required
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
          {overCap && <p style={{ fontSize: "12px", color: "var(--danger)", marginTop: "4px" }}>That's above your current tier's cap.</p>}
        </div>
        <div className="field">
          <label>Note (optional)</label>
          <textarea rows={2} placeholder="Anything the admin should know" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving || overCap}>
            {saving ? "Submitting…" : "Submit request"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function Wallet() {
  const { user } = useAuth();
  const [requestOpen, setRequestOpen] = useState(false);
  const [openTxn, setOpenTxn] = useState(null);

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
        <p>Track your income and withdrawals — and request a withdrawal when you're ready.</p>
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

      <div className="card-title" style={{ marginBottom: "12px" }}>
        Transaction history
      </div>
      {loadingTxns && <Skeleton variant="card" height="160px" />}
      {!loadingTxns && (!transactions || transactions.length === 0) && (
        <EmptyState icon={<Icon name="dollar-sign" size={26} />} title="No transactions yet" description="Your income and withdrawals will show up here." />
      )}
      {!loadingTxns && transactions && transactions.length > 0 && (
        <div className="card-elevated" style={{ padding: 0 }}>
          {transactions.map((txn) => (
            <TransactionRow key={`${txn.kind}-${txn.id}`} txn={txn} onOpen={setOpenTxn} />
          ))}
        </div>
      )}

      <TransactionDetailModal txn={openTxn} onClose={() => setOpenTxn(null)} />

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
