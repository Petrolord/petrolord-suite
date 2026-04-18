import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import WellPlanningPageShell from './Drilling/well-planning/WellPlanningPageShell';

export default function DrillingApp() {
  return (
    <div className="h-full w-full">
      <Routes>
        {/* Redirect root to well-planning for convenience */}
        <Route path="/" element={<Navigate to="well-planning" replace />} />
        <Route path="well-planning/*" element={<WellPlanningPageShell />} />
      </Routes>
    </div>
  );
}