import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';

/**
 * AS13 — the app menu below 1024 px.
 *
 * The side menu in each Assurance shell is `hidden lg:flex`, and until
 * AS13 nothing stood in for it, so on a tablet or a phone there was no
 * way to move between an app's pages. This is the same list of links
 * as a strip that scrolls sideways, shown only where the side menu is
 * not.
 */
export const isNavItemActive = (item, pathname) => (item.exact
  ? pathname === item.path || pathname === `${item.path}/`
  : pathname.startsWith(item.path));

export const CompactNav = ({ items = [] }) => {
  const location = useLocation();
  return (
    <nav aria-label="App menu"
      className="lg:hidden flex-none border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]/50 overflow-x-auto">
      <div className="flex gap-1 px-4 py-2 min-w-max">
        {items.map((item) => {
          const active = isNavItemActive(item, location.pathname);
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.exact}
              className={`flex items-center px-3 py-1.5 text-sm rounded-md whitespace-nowrap transition-colors ${
                active
                  ? 'bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] font-medium'
                  : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))]'
              }`}
            >
              <item.icon className="w-4 h-4 mr-2" />
              {item.name}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};

export default CompactNav;
