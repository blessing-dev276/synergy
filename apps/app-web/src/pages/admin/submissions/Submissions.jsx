import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../../supabaseClient.js";
import { useSupabaseQuery } from "../../../lib/useSupabaseQuery.js";
import { useToast } from "../../../components/state/Toast.jsx";
import {
  gradeAssignment,
  reviewContentEvidence,
  reviewRankTaskSubmission,
  reviewRankAdvancementRequest,
  reviewWithdrawalRequest,
  reviewDailyReport,
} from "../../../lib/rpc.js";
import Icon from "../../../components/Icon.jsx";
import Skeleton from "../../../components/state/Skeleton.jsx";
import EmptyState from "../../../components/state/EmptyState.jsx";

// One home for every kind of member report an admin has to act on --
// previously split across an always-open card at the top of RankBuilder.jsx
// (rank tasks) and a "Review Queue" tab buried under /admin/network (course
// assignments + task evidence), which meant checking two unrelated pages to
// know what's pending. Same accordion "Sections" shell as NetworkOverview.jsx.

// A member's own daily wrap-up (daily_reports, 0094) -- the direct match
// for what this whole page is now called. "Submitted" reports need a
// decision here; reviewed/needs_attention ones don't, same "only show
// what's actually pending" rule every other section on this page follows.
function DailyReportsSection() {
  const toast = useToast();
  const { loading, data: reports, refetch } = useSupabaseQuery(
    () =>
      supabase
        .from("daily_reports")
        .select("*, member:profiles!daily_reports_uid_fkey(display_name, email)")
        .eq("status", "submitted")
        .order("created_at", { ascending: true }),
    [],
  );
  const [busyId, setBusyId] = useState(null);
  const [notes, setNotes] = useState({});

  const decide = async (report, decision) => {
    setBusyId(report.id);
    try {
      await reviewDailyReport(report.id, decision, (notes[report.id] ?? "").trim());
      toast.success(decision === "reviewed" ? "Report reviewed." : "Flagged for attention.");
      refetch();
    } catch (err) {
      toast.error(err.message ?? "Couldn't review that report.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      {loading && <Skeleton variant="card" height="140px" />}
      {!loading && (!reports || reports.length === 0) && (
        <EmptyState icon={<Icon name="clipboard" size={26} />} title="Nothing pending review" />
      )}
      {reports?.map((r) => (
        <div key={r.id} className="card" style={{ marginBottom: "14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "8px", marginBottom: "6px" }}>
            <Link to={`/admin/members/${r.uid}`} style={{ fontWeight: 600 }}>
              {r.member?.display_name || r.member?.email}
            </Link>
            <span style={{ fontSize: "12px", color: "var(--slate)" }}>{new Date(r.created_at).toLocaleString()}</span>
          </div>
          <p style={{ fontSize: "13.5px", marginBottom: "8px" }}>
            Tasks: <strong>{r.tasks_completed}/{r.tasks_total}</strong> · Activities: <strong>{r.activities_completed}/{r.activities_total}</strong>
          </p>
          {r.summary && <p style={{ fontSize: "13.5px", color: "var(--slate)", marginBottom: "8px" }}>{r.summary}</p>}
          <div className="field" style={{ marginBottom: "8px" }}>
            <input
              type="text"
              placeholder="Note (optional, shown to the member)"
              value={notes[r.id] ?? ""}
              onChange={(e) => setNotes((prev) => ({ ...prev, [r.id]: e.target.value }))}
            />
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button type="button" className="btn btn-primary" disabled={busyId === r.id} onClick={() => decide(r, "reviewed")}>
              Mark Reviewed
            </button>
            <button type="button" className="btn btn-danger" disabled={busyId === r.id} onClick={() => decide(r, "needs_attention")}>
              Needs Attention
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// Rank tasks with proxy_type='manual' only ever reach 'pending' here --
// auto-tracked tasks (0065_rank_task_auto_proxies.sql) file straight to
// 'approved' the moment a member's progress qualifies, so they never need a
// human decision and never show up in this queue.
function RankTaskSubmissionsSection() {
  const toast = useToast();
  const { loading, data: submissions, refetch } = useSupabaseQuery(
    () =>
      supabase
        .from("rank_task_submissions")
        .select("*, task:rank_tasks(title, rank:ranks(title)), member:profiles!rank_task_submissions_uid_fkey(display_name, email)")
        .eq("status", "pending")
        .order("submitted_at", { ascending: true }),
    [],
  );
  const [busyId, setBusyId] = useState(null);
  const [notes, setNotes] = useState({});

  const decide = async (submission, decision) => {
    if (
      decision === "rejected" &&
      !window.confirm(`Mark "${submission.task?.title}" not approved for ${submission.member?.display_name || submission.member?.email}?`)
    )
      return;
    setBusyId(submission.id);
    try {
      await reviewRankTaskSubmission(submission.id, decision, (notes[submission.id] ?? "").trim());
      toast.success(decision === "approved" ? "Task approved." : "Marked not approved.");
      refetch();
    } catch (err) {
      toast.error(err.message ?? "Couldn't review that submission.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      {loading && <Skeleton variant="card" height="140px" />}
      {!loading && (!submissions || submissions.length === 0) && (
        <EmptyState icon={<Icon name="compass" size={26} />} title="Nothing pending review" />
      )}
      {submissions?.map((s) => (
        <div key={s.id} className="card" style={{ marginBottom: "14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "8px", marginBottom: "6px" }}>
            <div>
              <Link to={`/admin/members/${s.uid}`} style={{ fontWeight: 600 }}>
                {s.member?.display_name || s.member?.email}
              </Link>
              <span style={{ fontSize: "12.5px", color: "var(--slate)" }}> · {s.task?.rank?.title}</span>
            </div>
            <span style={{ fontSize: "12px", color: "var(--slate)" }}>{new Date(s.submitted_at).toLocaleString()}</span>
          </div>
          <p style={{ fontSize: "13.5px", marginBottom: "8px" }}>
            Marked done: <strong>"{s.task?.title}"</strong>
          </p>
          <div className="field" style={{ marginBottom: "8px" }}>
            <input
              type="text"
              placeholder="Note (optional, shown to the member if not approved)"
              value={notes[s.id] ?? ""}
              onChange={(e) => setNotes((prev) => ({ ...prev, [s.id]: e.target.value }))}
            />
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button type="button" className="btn btn-primary" disabled={busyId === s.id} onClick={() => decide(s, "approved")}>
              Approve
            </button>
            <button type="button" className="btn btn-danger" disabled={busyId === s.id} onClick={() => decide(s, "rejected")}>
              Not approved
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// Auto-filed the moment every learning path attached to a member's rank is
// 100% complete (evaluate_rank_advancement, 0082) -- no member action to
// wait on, just an admin decision. Same shape as RankTaskSubmissionsSection
// above, one query with two embedded ranks (from/to) instead of one task.
function RankAdvancementRequestsSection() {
  const toast = useToast();
  const { loading, data: requests, refetch } = useSupabaseQuery(
    () =>
      supabase
        .from("rank_advancement_requests")
        .select(
          "*, member:profiles!rank_advancement_requests_uid_fkey(display_name, email), fromRank:ranks!rank_advancement_requests_from_rank_id_fkey(title), toRank:ranks!rank_advancement_requests_to_rank_id_fkey(title)",
        )
        .eq("status", "pending")
        .order("requested_at", { ascending: true }),
    [],
  );
  const [busyId, setBusyId] = useState(null);
  const [notes, setNotes] = useState({});

  const decide = async (request, decision) => {
    if (
      decision === "rejected" &&
      !window.confirm(`Decline ${request.member?.display_name || request.member?.email}'s advancement to ${request.toRank?.title}?`)
    )
      return;
    setBusyId(request.id);
    try {
      await reviewRankAdvancementRequest(request.id, decision, (notes[request.id] ?? "").trim());
      toast.success(decision === "approved" ? "Advanced to the next rank." : "Request declined.");
      refetch();
    } catch (err) {
      toast.error(err.message ?? "Couldn't review that request.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      {loading && <Skeleton variant="card" height="140px" />}
      {!loading && (!requests || requests.length === 0) && (
        <EmptyState icon={<Icon name="trophy" size={26} />} title="Nothing pending review" />
      )}
      {requests?.map((r) => (
        <div key={r.id} className="card" style={{ marginBottom: "14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "8px", marginBottom: "6px" }}>
            <Link to={`/admin/members/${r.uid}`} style={{ fontWeight: 600 }}>
              {r.member?.display_name || r.member?.email}
            </Link>
            <span style={{ fontSize: "12px", color: "var(--slate)" }}>{new Date(r.requested_at).toLocaleString()}</span>
          </div>
          <p style={{ fontSize: "13.5px", marginBottom: "8px" }}>
            Finished every learning path for <strong>{r.fromRank?.title}</strong> — ready for <strong>{r.toRank?.title}</strong>
          </p>
          <div className="field" style={{ marginBottom: "8px" }}>
            <input
              type="text"
              placeholder="Note (optional, shown to the member if declined)"
              value={notes[r.id] ?? ""}
              onChange={(e) => setNotes((prev) => ({ ...prev, [r.id]: e.target.value }))}
            />
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button type="button" className="btn btn-primary" disabled={busyId === r.id} onClick={() => decide(r, "approved")}>
              Approve
            </button>
            <button type="button" className="btn btn-danger" disabled={busyId === r.id} onClick={() => decide(r, "rejected")}>
              Decline
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// Grading is admin-only (see supabase/migrations/0020_retire_mentor_
// capability.sql — grade_assignment no longer has a mentor branch), so this
// shows every pending submission across all members, not scoped to a
// mentor's assignees the way the old mentor Review Queue was.
function AssignmentGradingSection() {
  const toast = useToast();
  const [feedback, setFeedback] = useState({});
  const [grade, setGrade] = useState({});
  const [busyId, setBusyId] = useState(null);

  const { loading, data: submissions, refetch } = useSupabaseQuery(
    () =>
      supabase
        .from("assignment_submissions")
        .select("*, member:profiles!assignment_submissions_uid_fkey(display_name)")
        .eq("status", "submitted")
        .order("submitted_at", { ascending: true }),
    [],
  );

  const openAttachment = async (path) => {
    const { data, error } = await supabase.storage.from("assignment-submissions").createSignedUrl(path, 60);
    if (error || !data) {
      toast.error("Couldn't open that attachment.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const decide = async (submission, decision) => {
    setBusyId(submission.id);
    try {
      const g = grade[submission.id];
      await gradeAssignment(submission.id, decision, g === undefined || g === "" ? null : Number(g), (feedback[submission.id] ?? "").trim());
      toast.success(decision === "approved" ? "Approved." : "Sent back for revision.");
      refetch();
    } catch (err) {
      toast.error(err.message ?? "Couldn't submit that review.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      {loading && <Skeleton variant="card" height="140px" />}
      {!loading && (!submissions || submissions.length === 0) && (
        <EmptyState icon={<Icon name="folder" size={26} />} title="Nothing pending review" />
      )}
      {submissions?.map((s) => (
        <div key={s.id} className="card" style={{ marginBottom: "14px" }}>
          <div className="card-title">Report from {s.member?.display_name || s.uid}</div>
          <p style={{ margin: "8px 0" }}>{s.text_response || "(no text response)"}</p>
          {s.file_urls?.map((path) => (
            <button key={path} type="button" className="badge badge-neutral" style={{ marginRight: "6px" }} onClick={() => openAttachment(path)}>
              Attachment
            </button>
          ))}
          <div className="field" style={{ marginTop: "14px" }}>
            <label>Feedback</label>
            <textarea
              rows={2}
              value={feedback[s.id] ?? ""}
              onChange={(e) => setFeedback((prev) => ({ ...prev, [s.id]: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>Grade (optional)</label>
            <input type="number" value={grade[s.id] ?? ""} onChange={(e) => setGrade((prev) => ({ ...prev, [s.id]: e.target.value }))} />
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <button type="button" className="btn btn-primary" disabled={busyId === s.id} onClick={() => decide(s, "approved")}>
              Approve
            </button>
            <button type="button" className="btn btn-danger" disabled={busyId === s.id} onClick={() => decide(s, "needs_revision")}>
              Needs Revision
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// Evidence submitted for a bare content_assignment flagged
// requires_admin_approval (see supabase/migrations/0033_milestones_and_
// evidence_review.sql) — a sibling queue to course-assignment grading
// above, not merged into it: different backing table, same review shape.
function TaskEvidenceSection() {
  const toast = useToast();
  const [feedback, setFeedback] = useState({});
  const [busyId, setBusyId] = useState(null);

  const { loading, data: evidence, refetch } = useSupabaseQuery(
    () =>
      supabase
        .from("content_evidence_submissions")
        .select(
          "*, member:profiles!content_evidence_submissions_uid_fkey(display_name), content_assignment:content_assignments(content_item:content_items(title, course:courses(title), assignment:assignments(title)))",
        )
        .eq("status", "submitted")
        .order("submitted_at", { ascending: true }),
    [],
  );

  const openAttachment = async (path) => {
    const { data, error } = await supabase.storage.from("assignment-submissions").createSignedUrl(path, 60);
    if (error || !data) {
      toast.error("Couldn't open that attachment.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const decide = async (submission, decision) => {
    setBusyId(submission.id);
    try {
      await reviewContentEvidence(submission.id, decision, (feedback[submission.id] ?? "").trim());
      toast.success(decision === "approved" ? "Approved." : "Sent back for revision.");
      refetch();
    } catch (err) {
      toast.error(err.message ?? "Couldn't submit that review.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      {loading && <Skeleton variant="card" height="140px" />}
      {!loading && (!evidence || evidence.length === 0) && (
        <EmptyState icon={<Icon name="check-square" size={26} />} title="Nothing pending review" />
      )}
      {evidence?.map((s) => {
        const title =
          s.content_assignment?.content_item?.title ??
          s.content_assignment?.content_item?.course?.title ??
          s.content_assignment?.content_item?.assignment?.title ??
          "Task";
        return (
          <div key={s.id} className="card" style={{ marginBottom: "14px" }}>
            <div className="card-title">
              {title} — {s.member?.display_name || s.uid}
            </div>
            <p style={{ margin: "8px 0" }}>{s.text_response || "(no text response)"}</p>
            {s.file_urls?.map((path) => (
              <button key={path} type="button" className="badge badge-neutral" style={{ marginRight: "6px" }} onClick={() => openAttachment(path)}>
                Attachment
              </button>
            ))}
            <div className="field" style={{ marginTop: "14px" }}>
              <label>Feedback</label>
              <textarea
                rows={2}
                value={feedback[s.id] ?? ""}
                onChange={(e) => setFeedback((prev) => ({ ...prev, [s.id]: e.target.value }))}
              />
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              <button type="button" className="btn btn-primary" disabled={busyId === s.id} onClick={() => decide(s, "approved")}>
                Approve
              </button>
              <button type="button" className="btn btn-danger" disabled={busyId === s.id} onClick={() => decide(s, "needs_revision")}>
                Needs Revision
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// A member's withdrawal request + the eventual payout record (0084/0085).
// Three-state lifecycle (pending -> paid | rejected) -- there's no separate
// "approved" limbo state, this decision *is* the payout record. Net
// amount/currency/charges/rate are entered here rather than picked up
// automatically, since the actual payout (and any currency conversion) is
// a real-world action the admin is reporting back, not something the
// system can know on its own.
function WithdrawalRequestsSection() {
  const toast = useToast();
  const { loading, data: requests, refetch } = useSupabaseQuery(
    () =>
      supabase
        .from("withdrawal_requests")
        .select("*, member:profiles!withdrawal_requests_uid_fkey(display_name, email)")
        .eq("status", "pending")
        .order("created_at", { ascending: true }),
    [],
  );
  const [busyId, setBusyId] = useState(null);
  const [forms, setForms] = useState({});

  const formFor = (id) => forms[id] ?? { netAmount: "", netCurrency: "USD", chargesAmount: "", exchangeRate: "", note: "" };
  const updateForm = (id, field, value) => {
    setForms((prev) => ({ ...prev, [id]: { ...formFor(id), [field]: value } }));
  };

  const decide = async (request, decision) => {
    const form = formFor(request.id);
    if (decision === "paid" && !(Number(form.netAmount) > 0)) {
      toast.error("Enter the amount actually paid out.");
      return;
    }
    if (decision === "paid" && form.netCurrency === "NGN" && !(Number(form.exchangeRate) > 0)) {
      toast.error("Enter the exchange rate used for this payout.");
      return;
    }
    if (decision === "rejected" && !window.confirm(`Decline this withdrawal request from ${request.member?.display_name || request.member?.email}?`)) {
      return;
    }
    setBusyId(request.id);
    try {
      await reviewWithdrawalRequest(
        request.id,
        decision,
        decision === "paid" ? Number(form.netAmount) : null,
        decision === "paid" ? form.netCurrency : null,
        decision === "paid" ? Number(form.chargesAmount || 0) : null,
        decision === "paid" && form.netCurrency === "NGN" ? Number(form.exchangeRate) : null,
        (form.note ?? "").trim(),
      );
      toast.success(decision === "paid" ? "Marked as paid." : "Request declined.");
      refetch();
    } catch (err) {
      toast.error(err.message ?? "Couldn't review that request.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      {loading && <Skeleton variant="card" height="140px" />}
      {!loading && (!requests || requests.length === 0) && <EmptyState icon={<Icon name="dollar-sign" size={26} />} title="Nothing pending review" />}
      {requests?.map((r) => {
        const form = formFor(r.id);
        return (
          <div key={r.id} className="card" style={{ marginBottom: "14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "8px", marginBottom: "6px" }}>
              <Link to={`/admin/members/${r.uid}`} style={{ fontWeight: 600 }}>
                {r.member?.display_name || r.member?.email}
              </Link>
              <span style={{ fontSize: "12px", color: "var(--slate)" }}>{new Date(r.created_at).toLocaleString()}</span>
            </div>
            <p style={{ fontSize: "13.5px", marginBottom: "8px" }}>
              Requested <strong>{r.requested_currency === "NGN" ? "₦" : "$"}{Number(r.requested_amount).toLocaleString()}</strong>
              {r.note && <span style={{ color: "var(--slate)" }}> — {r.note}</span>}
            </p>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <div className="field" style={{ marginBottom: "8px", width: "130px" }}>
                <label>Amount paid</label>
                <input type="number" min="0.01" step="0.01" value={form.netAmount} onChange={(e) => updateForm(r.id, "netAmount", e.target.value)} />
              </div>
              <div className="field" style={{ marginBottom: "8px", width: "100px" }}>
                <label>Currency</label>
                <select value={form.netCurrency} onChange={(e) => updateForm(r.id, "netCurrency", e.target.value)}>
                  <option value="USD">USD</option>
                  <option value="NGN">NGN</option>
                </select>
              </div>
              <div className="field" style={{ marginBottom: "8px", width: "120px" }}>
                <label>Charges (optional)</label>
                <input type="number" min="0" step="0.01" value={form.chargesAmount} onChange={(e) => updateForm(r.id, "chargesAmount", e.target.value)} />
              </div>
              {form.netCurrency === "NGN" && (
                <div className="field" style={{ marginBottom: "8px", width: "140px" }}>
                  <label>Rate used (₦ per $1)</label>
                  <input type="number" min="0.01" step="0.01" value={form.exchangeRate} onChange={(e) => updateForm(r.id, "exchangeRate", e.target.value)} />
                </div>
              )}
            </div>
            <div className="field" style={{ marginBottom: "8px" }}>
              <input
                type="text"
                placeholder="Note (optional, shown to the member if declined)"
                value={form.note}
                onChange={(e) => updateForm(r.id, "note", e.target.value)}
              />
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button type="button" className="btn btn-primary" disabled={busyId === r.id} onClick={() => decide(r, "paid")}>
                Mark Paid
              </button>
              <button type="button" className="btn btn-danger" disabled={busyId === r.id} onClick={() => decide(r, "rejected")}>
                Decline
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const SECTIONS = [
  { id: "daily-reports", label: "Daily Reports", icon: "clipboard", Component: DailyReportsSection },
  { id: "rank-advancement", label: "Rank Advancement", icon: "trophy", Component: RankAdvancementRequestsSection },
  { id: "rank-tasks", label: "Rank Tasks", icon: "compass", Component: RankTaskSubmissionsSection },
  { id: "withdrawals", label: "Withdrawal Requests", icon: "dollar-sign", Component: WithdrawalRequestsSection },
  { id: "assignments", label: "Course Assignments", icon: "folder", Component: AssignmentGradingSection },
  { id: "evidence", label: "Task Evidence", icon: "check-square", Component: TaskEvidenceSection },
];

function SectionBlock({ section, isOpen, onToggle }) {
  const { label, icon, Component } = section;
  return (
    <div className="card-elevated" style={{ marginBottom: "12px" }}>
      <button type="button" className="accordion-header" onClick={onToggle} style={{ width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: 0 }}>
          <span className="icon-badge" style={{ width: "34px", height: "34px", flexShrink: 0 }}>
            <Icon name={icon} size={15} />
          </span>
          <div className="card-title" style={{ marginBottom: 0 }}>
            {label}
          </div>
        </div>
        <span className="accordion-chevron">
          <Icon name={isOpen ? "chevron-down" : "chevron-right"} size={16} />
        </span>
      </button>

      {isOpen && (
        <div className="accordion-body">
          <Component />
        </div>
      )}
    </div>
  );
}

export default function Submissions() {
  const [openSection, setOpenSection] = useState("rank-advancement");

  return (
    <div>
      <div className="hero-banner">
        <h1>Reports</h1>
        <p>Every kind of member report waiting on a decision — daily reports, rank advancement, rank tasks, course assignments, and task evidence — in one place.</p>
      </div>

      <p style={{ color: "var(--slate)", margin: "20px 0 12px" }}>
        Click a section to open it — opening another one closes this.
      </p>

      {SECTIONS.map((section) => (
        <SectionBlock
          key={section.id}
          section={section}
          isOpen={openSection === section.id}
          onToggle={() => setOpenSection((prev) => (prev === section.id ? null : section.id))}
        />
      ))}
    </div>
  );
}
