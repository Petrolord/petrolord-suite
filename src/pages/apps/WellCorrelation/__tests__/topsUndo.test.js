/**
 * AppUpgrade WC-U2-007: the undo engine on its own (the drag case, which a
 * jsdom canvas cannot perform, and the id remap after a recreated row).
 */
import { undoEntry, applyUndo, remapStack } from '../services/topsUndo';
import { makeInMemoryBackend } from '../services/inMemoryBackend';

test('a drag is undone to the old depth; a later drag elsewhere is refused', async () => {
  const b = makeInMemoryBackend();
  const top = (await b.listTops('corr-w1')).find((t) => t.name === 'Top Dome');
  await b.updateTop(top.id, { mdM: 1512 });
  const e = undoEntry.move(top, 1500, 1512, 'move Top Dome');
  expect((await applyUndo(e, b)).wellIds).toEqual(['corr-w1']);
  expect((await b.listTops('corr-w1')).find((t) => t.id === top.id).md_m).toBe(1500);
  await b.updateTop(top.id, { mdM: 1490 });
  const r = await applyUndo(undoEntry.move(top, 1500, 1512, 'x'), b);
  expect(r.wellIds).toEqual([]);
  expect(r.skipped[0]).toMatch(/moved again since/);
});

test('undoing a delete recreates the row and later entries follow its new id', async () => {
  const b = makeInMemoryBackend();
  const top = (await b.listTops('corr-w1')).find((t) => t.name === 'Top Dome');
  const move = undoEntry.move(top, 1500, 1500, 'm');
  await b.deleteTop(top);
  const { remap } = await applyUndo(undoEntry.remove([top], 'd'), b);
  const fresh = (await b.listTops('corr-w1')).find((t) => t.name === 'Top Dome');
  expect(remap[top.id]).toBe(fresh.id);
  expect(remapStack([move], remap)[0].topId).toBe(fresh.id);
});
