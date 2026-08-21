import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from '@/app/AppLayout';
import { Responsive } from '@/app/Responsive';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { HomeDesktop } from '@/features/dashboard/desktop/HomeDesktop';
import { DietPage } from '@/features/diet/DietPage';
import { DietPlanView } from '@/features/diet/DietPlanView';
import { DietDesktop } from '@/features/diet/desktop/DietDesktop';
import { ShoppingListView } from '@/features/shopping/ShoppingListView';
import { ShoppingDesktop } from '@/features/shopping/desktop/ShoppingDesktop';
import { WorkoutPage } from '@/features/workout/WorkoutPage';
import { WorkoutPlanView } from '@/features/workout/WorkoutPlanView';
import { WorkoutDesktop } from '@/features/workout/desktop/WorkoutDesktop';
import { InsightsDesktop } from '@/features/insights/desktop/InsightsDesktop';
import { CookbookPage } from '@/features/cookbook/CookbookPage';
import { CookbookDesktop } from '@/features/cookbook/desktop/CookbookDesktop';
import { RecipeView } from '@/features/cookbook/RecipeView';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { VerifyEmailPage } from '@/features/auth/VerifyEmailPage';
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage';

// Lazy — keeps recharts out of the initial bundle. Only the mobile insights
// view uses it; the desktop charts are hand-rolled SVG, so switching to the
// Nectar shell never pulls this chunk.
const WorkoutInsightsView = lazy(() =>
  import('@/features/insights/WorkoutInsightsView').then((m) => ({
    default: m.WorkoutInsightsView,
  })),
);

const mobileInsights = (
  <Suspense fallback={<div className="p-4 text-honey-900/60">Loading…</div>}>
    <WorkoutInsightsView />
  </Suspense>
);

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      {
        index: true,
        element: <Responsive desktop={<HomeDesktop />} mobile={<DashboardPage />} />,
      },
      {
        path: 'diet',
        children: [
          {
            index: true,
            element: <Responsive desktop={<DietDesktop />} mobile={<DietPage />} />,
          },
          {
            path: ':planId',
            element: <Responsive desktop={<DietDesktop />} mobile={<DietPlanView />} />,
          },
          {
            path: ':planId/shopping',
            element: (
              <Responsive desktop={<ShoppingDesktop />} mobile={<ShoppingListView />} />
            ),
          },
        ],
      },
      {
        path: 'workout',
        children: [
          {
            index: true,
            element: (
              <Responsive desktop={<WorkoutDesktop />} mobile={<WorkoutPage />} />
            ),
          },
          {
            path: ':planId',
            element: (
              <Responsive desktop={<WorkoutDesktop />} mobile={<WorkoutPlanView />} />
            ),
          },
          {
            path: ':planId/insights',
            element: (
              <Responsive desktop={<InsightsDesktop />} mobile={mobileInsights} />
            ),
          },
        ],
      },
      {
        path: 'cookbook',
        children: [
          {
            index: true,
            element: (
              <Responsive desktop={<CookbookDesktop />} mobile={<CookbookPage />} />
            ),
          },
          { path: ':recipeId', element: <RecipeView /> },
        ],
      },
      // Top-level homes for the Nectar tabs that have no mobile equivalent yet:
      // they resolve the active plan themselves. Below `lg` the mobile shell has
      // no such tabs, so send those visitors to the list they'd start from.
      {
        path: 'shopping',
        element: (
          <Responsive
            desktop={<ShoppingDesktop />}
            mobile={<Navigate to="/diet" replace />}
          />
        ),
      },
      {
        path: 'insights',
        element: (
          <Responsive
            desktop={<InsightsDesktop />}
            mobile={<Navigate to="/workout" replace />}
          />
        ),
      },
      { path: 'settings', element: <SettingsPage /> },
      // Landing pages for the links in verification / reset emails
      // (`api/_lib/mail.ts` builds these URLs).
      { path: 'verify', element: <VerifyEmailPage /> },
      { path: 'reset', element: <ResetPasswordPage /> },
    ],
  },
]);
