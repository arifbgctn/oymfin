import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import { clearAllTables } from '../db/db';
import { DEFAULT_CURRENCY, setActiveCurrency } from '../domain/currency';

beforeEach(async () => {
  await clearAllTables();
  localStorage.clear();
  setActiveCurrency(DEFAULT_CURRENCY);
});

afterEach(() => {
  cleanup();
});
