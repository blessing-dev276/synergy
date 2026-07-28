import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import PageMeta from "../components/PageMeta.jsx";
import { SITE, TRACK_OPTIONS, STATUS_OPTIONS } from "../data/site.js";
import { whatsappLink } from "../lib/whatsapp.js";
import { submitToWeb3Forms } from "../lib/web3forms.js";
import { trackTikTok } from "../lib/tiktok.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function initialTrack(searchParams) {
  const fromQuery = searchParams.get("track");
  return TRACK_OPTIONS.some((t) => t.value === fromQuery) ? fromQuery : "";
}

export default function Join() {
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState(() => ({
    name: "",
    phone: "",
    email: "",
    location: "",
    track: initialTrack(searchParams),
    status: "",
    financeNote: "",
    message: "",
    referral: "",
    consent: false,
    botcheck: false, // honeypot, real users never see this field
  }));
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitNote, setSubmitNote] = useState("");

  const selectedTrackLabel = useMemo(
    () => TRACK_OPTIONS.find((t) => t.value === form.track)?.label,
    [form.track],
  );

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function validate() {
    const next = {};
    if (form.name.trim().length < 2) next.name = "Enter your full name.";
    const digits = form.phone.replace(/\D/g, "");
    if (digits.length < 7)
      next.phone = "Enter a valid phone / WhatsApp number.";
    if (form.email && !EMAIL_RE.test(form.email))
      next.email = "That email doesn't look right.";
    if (!form.track)
      next.track = "Choose a track so we know how to onboard you.";
    if (
      form.track === "network-marketing" &&
      form.financeNote.trim().length < 3
    ) {
      next.financeNote =
        "Freelancing isn't optional unless this is financed another way, tell us how.";
    }
    if (!form.consent)
      next.consent = "Please confirm you understand before applying.";
    return next;
  }

  function buildMessage() {
    const lines = [
      "New SynergyTeam application:",
      `Name: ${form.name}`,
      `Phone: ${form.phone}`,
      form.email && `Email: ${form.email}`,
      form.location && `Location: ${form.location}`,
      `Track: ${selectedTrackLabel}`,
      form.track === "network-marketing" &&
        `Financing network marketing via: ${form.financeNote}`,
      form.status && `Current status: ${form.status}`,
      form.referral && `Heard about us via: ${form.referral}`,
      form.message && `Why they want to join: ${form.message}`,
    ].filter(Boolean);
    return lines.join("\n");
  }

  function handleSubmit(e) {
    e.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const message = buildMessage();

    trackTikTok("Lead", {
      content_name: selectedTrackLabel,
      email: form.email || undefined,
      phone: form.phone,
    });

    // Open WhatsApp synchronously (in direct response to the click) so
    // browsers don't treat it as a blocked popup. Works out of the box with
    // zero backend setup.
    const win = window.open(
      whatsappLink(message),
      "_blank",
      "noopener,noreferrer",
    );

    setSubmitting(true);

    if (SITE.web3formsAccessKey) {
      submitToWeb3Forms(form, selectedTrackLabel)
        .then(({ sent }) => {
          setSubmitNote(
            sent
              ? "We've also emailed your application to the team."
              : "WhatsApp opened, but the email copy didn't send, no problem, we still received your message on WhatsApp.",
          );
        })
        .finally(() => {
          setSubmitting(false);
          setSubmitted(true);
        });
    } else {
      setSubmitting(false);
      setSubmitted(true);
      if (!win) {
        setSubmitNote(
          "Your browser blocked the WhatsApp popup, use the WhatsApp button below to send your details instead.",
        );
      }
    }
  }

  useEffect(() => {
    if (submitted) {
      trackTikTok("CompleteRegistration", {
        content_name: selectedTrackLabel,
        email: form.email || undefined,
        phone: form.phone,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitted]);

  if (submitted) {
    return (
      <>
        <PageMeta title="Application received" />
        <section className="page-hero">
          <div className="wrap">
            <div
              className="form-success"
              style={{ maxWidth: 620, margin: "0 auto" }}
            >
              <h3>
                Thanks, {form.name.split(" ")[0] || "there"}, we've got your
                application.
              </h3>
              <p>
                A WhatsApp chat should have opened with your details prefilled —
                send that message if it hasn't gone yet, and we'll reply within
                48 hours to get you onboarded on the{" "}
                {selectedTrackLabel || "right"} track.
              </p>
              {submitNote && <p>{submitNote}</p>}
              <a
                href={whatsappLink(buildMessage())}
                target="_blank"
                rel="noreferrer"
                className="btn btn-primary"
                onClick={() => trackTikTok("Contact")}
              >
                Open WhatsApp chat
              </a>
            </div>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <PageMeta
        title="Join The Team"
        description="Apply to join SynergyTeam's freelancing or network marketing track. We onboard within 48 hours."
      />

      <section className="page-hero">
        <div className="wrap">
          <div className="breadcrumb">
            <Link to="/">Home</Link> <span>/</span> <span>Join The Team</span>
          </div>
          <div className="eyebrow">Let's get you onboarded</div>
          <h1>Apply to join SynergyTeam.</h1>
          <p className="lede">
            Tell us a bit about yourself and which track you want to start on.
            Both tracks run together by default, Network Marketing alone is only
            for applicants already financing it another way. We reply and
            onboard within 48 hours.
          </p>
        </div>
      </section>

      <section style={{ paddingTop: 24 }}>
        <div className="wrap">
          <div className="form-shell">
            <form className="form-card" onSubmit={handleSubmit} noValidate>
              <div className="form-row">
                <div className={`field ${errors.name ? "has-error" : ""}`}>
                  <label htmlFor="name">Full name</label>
                  <input
                    id="name"
                    type="text"
                    value={form.name}
                    onChange={(e) => update("name", e.target.value)}
                    aria-invalid={!!errors.name}
                    autoComplete="name"
                  />
                  {errors.name && (
                    <div className="field-error">{errors.name}</div>
                  )}
                </div>
                <div className={`field ${errors.phone ? "has-error" : ""}`}>
                  <label htmlFor="phone">Phone / WhatsApp number</label>
                  <input
                    id="phone"
                    type="tel"
                    value={form.phone}
                    onChange={(e) => update("phone", e.target.value)}
                    aria-invalid={!!errors.phone}
                    autoComplete="tel"
                    placeholder="e.g. 080..."
                  />
                  {errors.phone && (
                    <div className="field-error">{errors.phone}</div>
                  )}
                </div>
              </div>

              <div className={`field ${errors.email ? "has-error" : ""}`}>
                <label htmlFor="email">
                  Email <span className="hint">(optional)</span>
                </label>
                <input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                  aria-invalid={!!errors.email}
                  autoComplete="email"
                />
                {errors.email && (
                  <div className="field-error">{errors.email}</div>
                )}
              </div>

              <div className={`field ${errors.track ? "has-error" : ""}`}>
                <label>Which track are you interested in?</label>
                <div
                  className="radio-group"
                  role="radiogroup"
                  aria-invalid={!!errors.track}
                >
                  {TRACK_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      className={`radio-option ${form.track === opt.value ? "selected" : ""}`}
                    >
                      <input
                        type="radio"
                        name="track"
                        value={opt.value}
                        checked={form.track === opt.value}
                        onChange={(e) => update("track", e.target.value)}
                      />
                      <span>
                        <strong>{opt.label}</strong>
                        <span className="desc">{opt.desc}</span>
                      </span>
                    </label>
                  ))}
                </div>
                {errors.track && (
                  <div className="field-error">{errors.track}</div>
                )}
              </div>

              {form.track === "network-marketing" && (
                <div
                  className={`field ${errors.financeNote ? "has-error" : ""}`}
                >
                  <label htmlFor="financeNote">
                    Freelancing is required unless this is financed another way
                    , how will you fund your Network Marketing business?
                  </label>
                  <input
                    id="financeNote"
                    type="text"
                    value={form.financeNote}
                    onChange={(e) => update("financeNote", e.target.value)}
                    aria-invalid={!!errors.financeNote}
                    placeholder="e.g. my current job, an existing business…"
                  />
                  {errors.financeNote && (
                    <div className="field-error">{errors.financeNote}</div>
                  )}
                </div>
              )}

              <div className="form-row">
                <div className="field">
                  <label htmlFor="location">
                    Location <span className="hint">(optional)</span>
                  </label>
                  <input
                    id="location"
                    type="text"
                    value={form.location}
                    onChange={(e) => update("location", e.target.value)}
                    autoComplete="address-level2"
                    placeholder="e.g. Lagos, Nigeria"
                  />
                </div>
                <div className="field">
                  <label htmlFor="status">
                    Current status <span className="hint">(optional)</span>
                  </label>
                  <select
                    id="status"
                    value={form.status}
                    onChange={(e) => update("status", e.target.value)}
                  >
                    <option value="">Select one…</option>
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="field">
                <label htmlFor="referral">
                  How did you hear about us?{" "}
                  <span className="hint">(optional)</span>
                </label>
                <input
                  id="referral"
                  type="text"
                  value={form.referral}
                  onChange={(e) => update("referral", e.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="message">
                  Why do you want to join SynergyTeam?{" "}
                  <span className="hint">(optional)</span>
                </label>
                <textarea
                  id="message"
                  value={form.message}
                  onChange={(e) => update("message", e.target.value)}
                />
              </div>

              {/* Honeypot for spam bots, hidden from real users, never focusable. */}
              <div className="hp-field" aria-hidden="true">
                <label htmlFor="company">Company</label>
                <input
                  id="company"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={form.botcheck ? "spam" : ""}
                  onChange={(e) =>
                    update("botcheck", e.target.value.length > 0)
                  }
                />
              </div>

              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={form.consent}
                  onChange={(e) => update("consent", e.target.checked)}
                  aria-invalid={!!errors.consent}
                />
                <span>
                  I understand this involves genuine training and effort on my
                  part, freelancing income and network marketing income are not
                  passive or guaranteed. Read the{" "}
                  <Link to="/disclaimer">income disclaimer</Link>.
                </span>
              </label>
              {errors.consent && (
                <div
                  className="field-error"
                  style={{ marginTop: -12, marginBottom: 16 }}
                >
                  {errors.consent}
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary btn-block btn-lg"
                disabled={submitting}
              >
                {submitting ? "Sending…" : "Apply to join SynergyTeam →"}
              </button>
            </form>

            <div className="form-side">
              <div className="form-side-card whatsapp">
                <h4>Prefer WhatsApp? Skip the form.</h4>
                <p>
                  Submitting opens a prefilled WhatsApp chat for you
                  automatically. You can also start that chat directly.
                </p>
                <a
                  href={whatsappLink()}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-secondary btn-block"
                  style={{ marginTop: 14 }}
                  onClick={() => trackTikTok("Contact")}
                >
                  Chat on WhatsApp
                </a>
              </div>
              <div className="form-side-card">
                <h4>What happens after you apply</h4>
                <p>
                  1. We review your application.
                  <br />
                  2. You get a reply within 48 hours.
                  <br />
                  3. We onboard you onto your chosen track with a first training
                  session booked.
                </p>
              </div>
              <div className="form-side-card">
                <h4>Your information</h4>
                <p>
                  Used only to contact you about joining SynergyTeam, never
                  sold. See our <Link to="/privacy">privacy note</Link> for
                  details.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
