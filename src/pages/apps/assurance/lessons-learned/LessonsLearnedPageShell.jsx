import React, { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';

const Dashboard = lazy(() => import('./Dashboard'));
const Register = lazy(() => import('./Register'));
const NewLesson = lazy(() => import('./NewLesson'));
const LessonDetail = lazy(() => import('./LessonDetail'));
const Search = lazy(() => import('./Search'));
const Reports = lazy(() => import('./Reports'));

/**
 * AS9 — the app's routes.
 *
 * The detail route is `:lessonId` and the page reads `lessonId`. The
 * shell this replaces declared `:id` over a page that read `id` and
 * then ignored it:
 *
 *   const lesson = MOCK_LESSONS.find(l => l.id === id) || MOCK_LESSONS[0];
 */
export default function LessonsLearnedPageShell() {
  return (
    <div className="lessons-learned-shell h-full w-full">
      <Suspense fallback={<div className="flex items-center justify-center h-full">Loading Lessons Learned...</div>}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="register" element={<Register />} />
          <Route path="new" element={<NewLesson />} />
          <Route path="search" element={<Search />} />
          <Route path="reports" element={<Reports />} />
          <Route path=":lessonId" element={<LessonDetail />} />
          <Route path="*" element={<Dashboard />} />
        </Routes>
      </Suspense>
    </div>
  );
}
