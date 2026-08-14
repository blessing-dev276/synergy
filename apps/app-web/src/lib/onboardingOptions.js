// Shared between OnboardingFlow.jsx (first pass) and Profile.jsx (editing
// later) so the two never drift out of sync.
export const INTERESTS = [
  { label: "Graphics & Design", icon: "🎨" },
  { label: "GoHighLevel CRM", icon: "🧩" },
  { label: "FlutterFlow", icon: "📱" },
  { label: "Mobile App Development", icon: "💻" },
  { label: "Freelancing", icon: "💼" },
  { label: "Fiverr", icon: "🛒" },
  { label: "Upwork", icon: "🤝" },
  { label: "Network Marketing", icon: "📈" },
  { label: "Leadership", icon: "🧭" },
  { label: "Business Development", icon: "🚀" },
];

export function toggleOption(list, value) {
  return list.includes(value)
    ? list.filter((v) => v !== value)
    : [...list, value];
}
