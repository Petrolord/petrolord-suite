/**
 * The context menu must not lock the page (2026-10-12). A modal context menu
 * sets pointer-events: none on the body while it is open; when one of its
 * items opens a Dialog the lock is never released, so after the dialog closes
 * nothing on the page takes a click (Seismolord explorer: Settings…, Make
 * surface…). The shared ContextMenu is non-modal by default.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import * as ContextMenuPrimitive from '@radix-ui/react-context-menu';
import {
  ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem,
} from '@/components/ui/context-menu';

function Scene({ Root }) {
  return (
    <Root>
      <ContextMenuTrigger><div>Ekene Sand</div></ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem>Settings…</ContextMenuItem>
      </ContextMenuContent>
    </Root>
  );
}

// jsdom has no DOMRect; the menu positions itself from one at the pointer
beforeAll(() => {
  if (typeof global.DOMRect === 'undefined') {
    global.DOMRect = class DOMRect {
      constructor(x = 0, y = 0, width = 0, height = 0) { Object.assign(this, { x, y, width, height, left: x, top: y, right: x + width, bottom: y + height }); }
      static fromRect(r = {}) { return new DOMRect(r.x, r.y, r.width, r.height); }
      toJSON() { return this; }
    };
  }
});
afterEach(() => { document.body.style.pointerEvents = ''; });

test('an open context menu leaves the page clickable', async () => {
  render(<Scene Root={ContextMenu} />);
  fireEvent.contextMenu(screen.getByText('Ekene Sand'));
  await screen.findByText('Settings…');
  expect(document.body.style.pointerEvents).not.toBe('none');
});

test('negative control: a modal context menu locks the page while open', async () => {
  render(<Scene Root={(p) => <ContextMenuPrimitive.Root modal {...p} />} />);
  fireEvent.contextMenu(screen.getByText('Ekene Sand'));
  await screen.findByText('Settings…');
  expect(document.body.style.pointerEvents).toBe('none');
});

test('modal can still be asked for explicitly', async () => {
  render(<Scene Root={(p) => <ContextMenu modal {...p} />} />);
  fireEvent.contextMenu(screen.getByText('Ekene Sand'));
  await screen.findByText('Settings…');
  expect(document.body.style.pointerEvents).toBe('none');
});
