// Small self-contained line-icon set (no external icon library) so the app
// doesn't depend on emoji glyphs rendering consistently across platforms.
const PATHS = {
  home: <><path d="M4 11l8-7 8 7" /><path d="M6 10v9h12v-9" /><path d="M10 19v-5h4v5" /></>,
  book: <><path d="M4 5c2-1 5-1 8 1 3-2 6-2 8-1v13c-2-1-5-1-8 1-3-2-6-2-8-1V5z" /><path d="M12 6v13" /></>,
  clipboard: <><rect x="6" y="4" width="12" height="17" rx="2" /><rect x="9" y="2.5" width="6" height="3" rx="1" /><path d="M9 11h6M9 15h6" /></>,
  "check-square": <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 12l3 3 5-6" /></>,
  bell: <><path d="M6 10a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" /><path d="M10 20a2 2 0 0 0 4 0" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 4-6 8-6s8 2 8 6" /></>,
  users: <><circle cx="9" cy="8" r="3.3" /><path d="M2.5 19c0-3.3 3-5 6.5-5s6.5 1.7 6.5 5" /><path d="M16 8.2a3 3 0 0 1 0 5.9" /><path d="M15.5 14c2.8.3 5 1.8 5 5" /></>,
  "bar-chart": <path d="M5 20V10M12 20V4M19 20v-7" />,
  compass: <><circle cx="12" cy="12" r="9" /><path d="M15 9l-2 6-6 2 2-6 6-2z" /></>,
  layers: <><path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 13l9 5 9-5" /></>,
  "log-out": <><path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" /><path d="M15 16l5-4-5-4" /><path d="M20 12H9" /></>,
  "chevron-left": <path d="M15 5l-7 7 7 7" />,
  "chevron-right": <path d="M9 5l7 7-7 7" />,
  "chevron-down": <path d="M5 9l7 7 7-7" />,
  plus: <path d="M12 5v14M5 12h14" />,
  pencil: <path d="M4 20l1-4L16 5l3 3L8 19l-4 1z" />,
  trash: <><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13h10l1-13" /></>,
  "arrow-up": <><path d="M12 19V5" /><path d="M6 11l6-6 6 6" /></>,
  "arrow-down": <><path d="M12 5v14" /><path d="M6 13l6 6 6-6" /></>,
  target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="0.8" fill="currentColor" stroke="none" /></>,
  briefcase: <><rect x="3" y="8" width="18" height="12" rx="2" /><path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>,
  laptop: <><rect x="4" y="5" width="16" height="10" rx="1.5" /><path d="M2 19h20" /></>,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="M5 13l4 4L19 7" />,
  ban: <><circle cx="12" cy="12" r="9" /><path d="M5.5 5.5l13 13" /></>,
  "user-x": <><circle cx="9" cy="8" r="3.3" /><path d="M2.5 19c0-3.3 3-5 6.5-5s6.5 1.7 6.5 5" /><path d="M16 8l5 5M21 8l-5 5" /></>,
  "rotate-ccw": <><path d="M4 4v6h6" /><path d="M4.6 15a8 8 0 1 0 2-8.4L4 10" /></>,
  activity: <path d="M3 12h4l2-7 4 14 2-7h6" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>,
  award: <><circle cx="12" cy="9" r="5.5" /><path d="M8.5 13.5L7 21l5-2.5L17 21l-1.5-7.5" /></>,
  network: <><circle cx="12" cy="5" r="2.5" /><circle cx="5" cy="19" r="2.5" /><circle cx="19" cy="19" r="2.5" /><path d="M12 7.5v5M12 12.5L5 17M12 12.5l7 4.5" /></>,
  trophy: <><path d="M7 4h10v4a5 5 0 0 1-10 0V4z" /><path d="M7 5H4a3 3 0 0 0 3 5" /><path d="M17 5h3a3 3 0 0 1-3 5" /><path d="M12 13v4" /><path d="M8 20h8" /></>,
  "dollar-sign": <><path d="M12 3v18" /><path d="M16.5 7.2c0-1.8-2-3.2-4.5-3.2s-4.5 1.4-4.5 3.2 2 2.6 4.5 3.2 4.5 1.4 4.5 3.2-2 3.2-4.5 3.2-4.5-1.4-4.5-3.2" /></>,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></>,
  "eye-off": <><path d="M3 3l18 18" /><path d="M10.6 5.2A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a15.6 15.6 0 0 1-3.4 4.3M6.7 6.7C4 8.5 2 12 2 12s3.5 7 10 7a10.4 10.4 0 0 0 4.2-.9" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>,
  brain: <><path d="M9 4.5a3 3 0 0 0-3 3 2.6 2.6 0 0 0-1.3 4.8 2.6 2.6 0 0 0 1.1 4.9A2.8 2.8 0 0 0 9 19V4.5z" /><path d="M15 4.5a3 3 0 0 1 3 3 2.6 2.6 0 0 1 1.3 4.8 2.6 2.6 0 0 1-1.1 4.9A2.8 2.8 0 0 1 15 19V4.5z" /></>,
};

export default function Icon({ name, size = 18, strokeWidth = 1.8, className = "", style }) {
  const glyph = PATHS[name];
  if (!glyph) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`icon ${className}`}
      style={{ flexShrink: 0, ...style }}
      aria-hidden="true"
    >
      {glyph}
    </svg>
  );
}
