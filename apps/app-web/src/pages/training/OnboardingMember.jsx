import { useEffect, useState } from "react";
import { supabase } from "../../supabaseClient.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import { useToast } from "../../components/state/Toast.jsx";
import { completeOnboardingStep } from "../../lib/rpc.js";
import Icon from "../../components/Icon.jsx";
import Skeleton from "../../components/state/Skeleton.jsx";
import ErrorState from "../../components/state/ErrorState.jsx";

// Order: Business Explanation -> Network Varsity -> Office Policy ->
// Registration (§5). Each step's `unlockedWhen` reads the previous step's
// timestamp off onboarding_progress -- self-reported, strictly gated.
const STEPS = [
  { key: "business_explanation", label: "Business Explanation", blurb: "Start here — understand what the business actually is.", cta: "I've completed this step" },
  { key: "network_varsity", label: "Network Varsity", blurb: "The foundational network-marketing training every member starts with.", cta: "I've completed this step" },
  { key: "office_policy", label: "Office Policy", blurb: "The rules and expectations of working inside this office.", cta: "I acknowledge this policy" },
  { key: "registration", label: "Registration", blurb: "Complete your official registration to formalize your place in the business.", cta: "I've completed registration" },
];

const TYPE_ICON = { pdf: "clipboard", video: "video", link: "link" };
const TYPE_LABEL = { pdf: "PDF", video: "Video", link: "Link" };

function useSignedOnboardingUrl(path) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let cancelled = false;
    if (!path) {
      setUrl(null);
      return;
    }
    supabase.storage
      .from("onboarding")
      .createSignedUrl(path, 3600)
      .then(({ data }) => {
        if (!cancelled) setUrl(data?.signedUrl ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);
  return url;
}

function OnboardingItemRow({ item }) {
  const signedUrl = useSignedOnboardingUrl(item.type !== "link" ? item.file_path : null);
  const href = item.type === "link" ? item.link_url : signedUrl;
  return (
    <div className="onboarding-item-row">
      <Icon name={TYPE_ICON[item.type]} size={16} style={{ color: "var(--blue-bright)", flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</div>
        <div style={{ fontSize: "12px", color: "var(--slate)" }}>{TYPE_LABEL[item.type]}</div>
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
    </div>
  );
}

function StepCard({ step, index, items, unlocked, done, completedAt, registrationLink, onComplete, busy }) {
  const isRegistration = step.key === "registration";

  return (
    <div className={`card onboarding-step-card${unlocked ? "" : " is-locked"}`} style={{ marginBottom: "14px" }}>
      <div className="onboarding-step-header">
        <span className={`onboarding-step-num${done ? " done" : ""}`}>{done ? <Icon name="check" size={13} /> : index + 1}</span>
        <div style={{ flex: 1 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>
            {step.label}
          </div>
          <div style={{ fontSize: "13px", color: "var(--slate)" }}>{step.blurb}</div>
        </div>
        {!unlocked && <Icon name="lock" size={16} style={{ color: "var(--slate)" }} />}
      </div>

      {unlocked && (
        <div className="onboarding-step-body">
          {isRegistration ? (
            registrationLink ? (
              <a
                className="btn btn-secondary"
                href={registrationLink}
                target="_blank"
                rel="noopener noreferrer"
                style={{ marginBottom: "10px", display: "inline-block" }}
              >
                Go to registration →
              </a>
            ) : (
              <div style={{ fontSize: "13px", color: "var(--slate)", marginBottom: "10px" }}>
                No registration link has been set yet — check back soon.
              </div>
            )
          ) : items.length === 0 ? (
            <div style={{ fontSize: "13px", color: "var(--slate)", marginBottom: "10px" }}>No content added for this step yet.</div>
          ) : (
            <div style={{ marginBottom: "10px" }}>
              {items.map((it) => (
                <OnboardingItemRow key={it.id} item={it} />
              ))}
            </div>
          )}

          {done ? (
            <div style={{ fontSize: "12.5px", color: "var(--success)", display: "flex", alignItems: "center", gap: "6px" }}>
              <Icon name="check" size={13} /> Completed {new Date(completedAt).toLocaleDateString()}
            </div>
          ) : (
            <button type="button" className="btn btn-primary" onClick={onComplete} disabled={busy}>
              {busy ? "Saving…" : step.cta}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function OnboardingMember() {
  const { user } = useAuth();
  const toast = useToast();
  const [busyStep, setBusyStep] = useState(null);

  const {
    loading: itemsLoading,
    error: itemsError,
    data: items,
  } = useSupabaseQuery(() => supabase.from("onboarding_step_items").select("*").order("order_index"), []);

  const {
    loading: progressLoading,
    data: progress,
    refetch: refetchProgress,
  } = useSupabaseQuery(() => user && supabase.from("onboarding_progress").select("*").eq("user_id", user.id).maybeSingle(), [user?.id]);

  const { data: settings } = useSupabaseQuery(() => supabase.from("onboarding_settings").select("registration_link").maybeSingle(), []);

  const loading = itemsLoading || progressLoading;

  const unlocked = {
    business_explanation: true,
    network_varsity: !!progress?.business_explanation_viewed_at,
    office_policy: !!progress?.network_varsity_completed_at,
    registration: !!progress?.policy_acknowledged_at,
  };
  const doneAt = {
    business_explanation: progress?.business_explanation_viewed_at ?? null,
    network_varsity: progress?.network_varsity_completed_at ?? null,
    office_policy: progress?.policy_acknowledged_at ?? null,
    registration: progress?.registered_at ?? null,
  };

  const handleComplete = async (step) => {
    setBusyStep(step);
    try {
      await completeOnboardingStep(step);
      await refetchProgress();
    } catch (err) {
      toast.error(err.message ?? "Couldn't save that.");
    } finally {
      setBusyStep(null);
    }
  };

  if (loading) {
    return (
      <div>
        <Skeleton variant="card" height="100px" />
        <Skeleton variant="card" height="100px" style={{ marginTop: "14px" }} />
        <Skeleton variant="card" height="100px" style={{ marginTop: "14px" }} />
      </div>
    );
  }
  if (itemsError) return <ErrorState description="Couldn't load onboarding content." />;

  return (
    <div>
      <p style={{ color: "var(--slate)", marginBottom: "18px" }}>
        A one-time walkthrough of the business, the foundational training and the office's ground rules — complete each step to unlock the next.
        Completion is self-reported: there's no check that you watched or read everything, just your word that you did.
      </p>

      {STEPS.map((step, i) => (
        <StepCard
          key={step.key}
          step={step}
          index={i}
          items={(items ?? []).filter((it) => it.step === step.key)}
          unlocked={unlocked[step.key]}
          done={!!doneAt[step.key]}
          completedAt={doneAt[step.key]}
          registrationLink={settings?.registration_link}
          onComplete={() => handleComplete(step.key)}
          busy={busyStep === step.key}
        />
      ))}
    </div>
  );
}
