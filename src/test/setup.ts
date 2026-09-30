import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import { clearAllTables } from '../db/db';

beforeEach(async () => {
  await clearAllTables();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});
