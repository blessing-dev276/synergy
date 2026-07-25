import { SITE } from "../data/site.js";

const WEB3FORMS_ENDPOINT = "https://api.web3forms.com/submit";

/**
 * Submit the Join form to Web3Forms (https://web3forms.com) so applications
 * also land by email, in addition to the WhatsApp chat that always opens.
 *
 * Resolves { sent: false, reason: "not-configured" } without making a
 * network call when SITE.web3formsAccessKey is empty — the WhatsApp path
 * always works regardless of this.
 */
export async function submitToWeb3Forms(form, trackLabel) {
  if (!SITE.web3formsAccessKey)
    return { sent: false, reason: "not-configured" };

  const payload = {
    access_key: SITE.web3formsAccessKey,
    subject: `New SynergyTeam application — ${trackLabel || "unspecified track"}`,
    from_name: "SynergyTeam website",
    name: form.name,
    phone: form.phone,
    track: trackLabel,
    financing:
      form.track === "network-marketing" ? form.financeNote : undefined,
    status: form.status || undefined,
    referral: form.referral || undefined,
    message: form.message || undefined,
    // Honeypot: real visitors never see or fill this field. Web3Forms
    // silently discards submissions where it's non-empty.
    botcheck: form.botcheck ? "spam" : "",
  };

  // Including `email` sets the Reply-To header on the notification email,
  // so replying goes straight to the applicant. Omit it entirely when blank
  // rather than sending an empty string.
  if (form.email) payload.email = form.email;

  Object.keys(payload).forEach(
    (key) => payload[key] === undefined && delete payload[key],
  );

  try {
    const res = await fetch(WEB3FORMS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => null);
    const sent = res.ok && data?.success !== false;
    return { sent, data };
  } catch (error) {
    return { sent: false, error };
  }
}
