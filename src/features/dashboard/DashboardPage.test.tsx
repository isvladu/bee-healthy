import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { DashboardPage } from './DashboardPage';

describe('DashboardPage', () => {
  it('renders the welcome heading and quick links', () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Welcome to Bee Healthy')).toBeInTheDocument();
    expect(screen.getByText('Plan a diet')).toBeInTheDocument();
  });
});
