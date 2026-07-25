import { SITE } from "../data/site.js";

/**
 * Build a wa.me deep link with an optional prefilled message.
 * Falls back to SITE.whatsappDefaultMessage when no message is given.
 */
export function whatsappLink(message) {
  const text = encodeURIComponent(message || SITE.whatsappDefaultMessage);
  return `https://wa.me/${SITE.whatsappNumber}?text=${text}`;
}
