export default function Skeleton({ variant = "text", width, height, style, className = "" }) {
  const dims = {
    text: { width: width ?? "100%", height: height ?? "14px" },
    card: { width: width ?? "100%", height: height ?? "120px" },
    avatar: { width: width ?? "40px", height: height ?? "40px" },
    "table-row": { width: width ?? "100%", height: height ?? "44px" },
  }[variant];

  const radius = variant === "avatar" ? "50%" : undefined;

  return (
    <div
      className={`skeleton ${className}`}
      style={{ ...dims, borderRadius: radius, ...style }}
      aria-hidden="true"
    />
  );
}
