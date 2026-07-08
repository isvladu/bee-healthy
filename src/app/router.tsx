import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from '@/app/AppLayout';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { DietPage } from '@/features/diet/DietPage';
import { DietPlanView } from '@/features/diet/DietPlanView';
import { ShoppingListView } from '@/features/shopping/ShoppingListView';
import { WorkoutPage } from '@/features/workout/WorkoutPage';
import { CookbookPage } from '@/features/cookbook/CookbookPage';
import { RecipeView } from '@/features/cookbook/RecipeView';
import { SettingsPage } from '@/features/settings/SettingsPage';

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
      { path: 'workout', element: <WorkoutPage /> },
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
