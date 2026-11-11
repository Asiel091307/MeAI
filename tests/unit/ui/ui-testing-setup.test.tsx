// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import HomePage from '../../../app/page';

// Smoke test of the approved UI testing setup (spec 003): React components render in a
// happy-dom DOM and are queried by accessible role and visible text, as T35, T35a and T36 need.
afterEach(cleanup);

test('a React component renders in happy-dom and is found by role and text', () => {
  render(<HomePage />);

  expect(screen.getByRole('heading', { level: 1, name: 'MeAI' })).toBeTruthy();
  expect(screen.getByText('Consulta tus documentos PDF.')).toBeTruthy();
});
