import { useEffect, useState } from "react";
import { supabase } from "../../supabaseClient.js";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import { useToast } from "../../components/state/Toast.jsx";
import { togglePersonalDevelopmentItem } from "../../lib/rpc.js";
import Icon from "../../components/Icon.jsx";
import Skeleton from "../../components/state/Skeleton.jsx";
import ErrorState from "../../components/state/ErrorState.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";

const TYPE_ICON = { pdf: "clipboard", podcast: "podcast", video: "video" };
const TYPE_LABEL = { pdf: "PDF", podcast: "Podcast", video: "Video" };

// pdf file_url is a storage path in the private `resources` bucket (0115);
// podcast/video file_url is already an external link (§4.1).
function useOpenHref(fileType, fileUrl) {
  const [signedUrl, setSignedUrl] = useState(null);
  useEffect(() => {
    let cancelled = false;
    if (fileType !== "pdf" || !fileUrl) {
      setSignedUrl(null);
      return;
    }
    supabase.storage
      .from("resources")
      .createSignedUrl(fileUrl, 3600)
      .then(({ data }) => {
        if (!cancelled) setSignedUrl(data?.signedUrl ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [fileType, fileUrl]);
  return fileType === "pdf" ? signedUrl : fileUrl;
}

function ChecklistRow({ item, busy, onToggle }) {
  const href = useOpenHref(item.fileType, item.fileUrl);
  return (
    <li className="rank-requirement-row">
      <button
        type="button"
        className={`today-task-check${item.done ? " done" : ""}`}
        onClick={onToggle}
        disabled={busy}
        title={item.done ? "Undo" : "Mark done today"}
        aria-label={item.done ? `Undo "${item.title}"` : `Mark "${item.title}" done today`}
      >
        {item.done && <Icon name="check" size={11} />}
      </button>
      <Icon name={TYPE_ICON[item.fileType]} size={15} style={{ color: "var(--blue-bright)", flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ textDecoration: item.done ? "line-through" : "none", color: item.done ? "var(--slate)" : "inherit" }}>{item.title}</div>
        <div style={{ fontSize: "11.5px", color: "var(--slate)" }}>{TYPE_LABEL[item.fileType]}</div>
      </div>
      {href ? (
        <a className="btn btn-secondary" href={href} target="_blank" rel="noopener noreferrer">
          Open
        </a>
      ) : (
        <span className="btn btn-secondary" style={{ opacity: 0.5, pointerEvents: "none" }}>
          Loading…
        </span>
      )}
    </li>
  );
}

export default function PersonalDevelopmentMember() {
  const toast = useToast();
  const [busyId, setBusyId] = useState(null);

  // Read directly via supabase.rpc(...) inside useSupabaseQuery -- not the
  // rpc.js wrapper (call() unwraps straight to .data, the wrong shape here;
  // see the RankJourney.jsx history of that exact bug).
  const { loading, error, data, refetch } = useSupabaseQuery(() => supabase.rpc("get_my_personal_development", {}), []);

  const items = data?.items ?? [];
  const streak = data?.streak ?? 0;
  const doneCount = items.filter((i) => i.done).length;

  const toggle = async (item) => {
    setBusyId(item.resourceId);
    try {
      await togglePersonalDevelopmentItem(item.resourceId, !item.done);
      await refetch();
    } catch (err) {
      toast.error(err.message ?? "Couldn't update that.");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <Skeleton variant="card" height="220px" />;
  if (error) return <ErrorState description="Couldn't load today's list." />;

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", marginBottom: "6px" }}>
        <div>
          <div className="card-title" style={{ marginBottom: "2px" }}>
            Your office's daily growth list
          </div>
          <div className="card-subtitle" style={{ marginBottom: 0 }}>
            Get through everything below today. It resets tomorrow.
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
          <span className="badge badge-info">
            {doneCount} of {items.length} done today
          </span>
          {streak > 0 && (
            <span className="pd-streak-badge">
              <Icon name="award" size={13} /> {streak} day{streak === 1 ? "" : "s"} streak
            </span>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState icon={<Icon name="activity" size={26} />} title="Nothing on the list yet" description="Your office hasn't added any daily resources yet — check back soon." />
      ) : (
        <ul className="rank-requirement-list" style={{ marginTop: "16px" }}>
          {items.map((item) => (
            <ChecklistRow key={item.resourceId} item={item} busy={busyId === item.resourceId} onToggle={() => toggle(item)} />
          ))}
        </ul>
      )}
    </div>
  );
}
