import { useEffect } from "react";
import { SITE } from "../data/site.js";

/**
 * Lightweight per-page <title> + meta description setter.
 * Avoids pulling in react-helmet for a handful of static pages.
 */
export default function PageMeta({ title, description }) {
  useEffect(() => {
    document.title = title ? `${title} · ${SITE.name}` : SITE.name;

    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute("content", description || SITE.metaDescription);
    }
  }, [title, description]);

  return null;
}
