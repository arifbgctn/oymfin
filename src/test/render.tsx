import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { App } from '../App';
import { seedIfNeeded } from '../db/bootstrap';
import { AppProvider } from '../state/AppContext';

export async function renderWithApp(ui: ReactElement, month = '2026-09') {
  await seedIfNeeded();
  const user = userEvent.setup();
  const utils = render(<AppProvider initialMonth={month}>{ui}</AppProvider>);
  return { user, ...utils };
}

/** Tüm uygulamayı verilen rotada açar ve yüklenmesini bekler. */
export async function renderApp(hash = '#/') {
  window.location.hash = hash;
  const user = userEvent.setup();
  const utils = render(<App />);
  await screen.findByRole('navigation', { name: 'Alt menü' });
  return { user, ...utils };
}
