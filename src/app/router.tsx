import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from '@/app/AppLayout';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { DietPage } from '@/features/diet/DietPage';
import { DietPlanView } from '@/features/diet/DietPlanView';
import { ShoppingListView } from '@/features/shopping/ShoppingListView';
import { WorkoutPage } from '@/features/workout/WorkoutPage';
import { WorkoutPlanView } from '@/features/workout/WorkoutPlanView';
import { CookbookPage } from '@/features/cookbook/CookbookPage';
import { RecipeView } from '@/features/cookbook/RecipeView';
import { SettingsPage } from '@/features/settings/SettingsPage';

// Lazy — keeps recharts out of the initial bundle.
const WorkoutInsightsView = lazy(() =>
  import('@/features/insights/WorkoutInsightsView').then((m) => ({
    default: m.WorkoutInsightsView,
  })),
);

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      {
        path: 'diet',
        children: [
          { index: true, element: <DietPage /> },
          { path: ':planId', element: <DietPlanView /> },
          { path: ':planId/shopping', element: <ShoppingListView /> },
        ],
      },
      {
        path: 'workout',
        children: [
          { index: true, element: <WorkoutPage /> },
          { path: ':planId', element: <WorkoutPlanView /> },
          {
            path: ':planId/insights',
            element: (
              <Suspense fallback={<div className="p-4 text-honey-900/60">Loading…</div>}>
                <WorkoutInsightsView />
              </Suspense>
            ),
          },
        ],
      },
      {
        path: 'cookbook',
        children: [
          { index: true, element: <CookbookPage /> },
          { path: ':recipeId', element: <RecipeView /> },
        ],
      },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
]);
