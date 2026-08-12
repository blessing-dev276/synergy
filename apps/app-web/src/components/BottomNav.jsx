import { NavLink } from "react-router-dom";
import Icon from "./Icon.jsx";

export default function BottomNav({ items }) {
  return (
    <nav className="app-bottom-nav">
      <div className="app-bottom-nav-links">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `app-bottom-nav-link${isActive ? " active" : ""}`}
          >
            <Icon name={item.icon} size={19} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
