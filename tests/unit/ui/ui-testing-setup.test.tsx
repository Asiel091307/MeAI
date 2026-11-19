// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test } from 'vitest';
import HomePage from '../../../app/page';

// Smoke test of the approved UI testing setup (spec 003): React components render in a
// happy-dom DOM and are queried by accessible role and visible text, as T35, T35a and T36 need.
beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
});

afterEach(cleanup);

test('a React component renders in happy-dom and is found by role and text', () => {
  render(<HomePage />);

  expect(screen.getByRole('complementary', { name: 'Biblioteca' })).toBeTruthy();
  expect(screen.getByRole('main', { name: 'Conversación' })).toBeTruthy();
  expect(screen.getByRole('complementary', { name: 'Evidencia' })).toBeTruthy();
  expect(screen.getByRole('heading', { level: 1, name: '¿Qué necesitas recordar?' })).toBeTruthy();
});
