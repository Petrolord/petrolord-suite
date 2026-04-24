import React from 'react';
import { Outlet } from 'react-router-dom';

const DashboardLayout = ({ children }) => {
  return (
    <div className="min-h-screen bg-slate-950">
      {/* Main layout container */}
      <div className="flex h-screen">
        {/* Main content area */}
        <main className="flex-1 overflow-hidden">
          {children || <Outlet />}
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;