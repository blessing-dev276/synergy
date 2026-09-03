import EmptyState from "../../components/state/EmptyState.jsx";
import Icon from "../../components/Icon.jsx";

// Skill Development / Income Development / Network Marketing get their
// full editors + member views in the next build phase (see the HQ360
// restructure notes) -- schema for all three already exists and is live.
export default function ComingSoonStage({ icon = "clock", title, description }) {
  return (
    <div className="card">
      <EmptyState icon={<Icon name={icon} size={26} />} title={`${title} is coming soon`} description={description} />
    </div>
  );
}
