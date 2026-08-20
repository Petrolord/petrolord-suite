/**
 * Shared brick-emit backpressure (W2.1 factoring of the ingest ack
 * loop): the producer parks once MAX_UNACKED_BRICKS bricks await
 * acknowledgement, each ack opens the window by exactly one, and
 * cancellation wakes parked producers into a loud throw.
 */

import {
  createBrickChannel, MAX_UNACKED_BRICKS,
} from '@/pages/apps/Seismolord/workers/brickAckChannel';

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('createBrickChannel', () => {
  test('posts pass through with their transfer list', async () => {
    const posts = [];
    const ch = createBrickChannel((msg, transfer) => posts.push([msg, transfer]));
    const buf = new ArrayBuffer(8);
    await ch.sendBrick(1, { type: 'brick', id: 1, i: 0, j: 0, k: 0, buffer: buf }, [buf]);
    expect(posts).toHaveLength(1);
    expect(posts[0][0].type).toBe('brick');
    expect(posts[0][1]).toEqual([buf]);
  });

  test('producer parks at the window and each ack releases one send', async () => {
    const posts = [];
    const ch = createBrickChannel((msg) => posts.push(msg));
    const done = [];
    const producer = (async () => {
      for (let n = 0; n < MAX_UNACKED_BRICKS + 3; n++) {
        await ch.sendBrick(7, { n });
        done.push(n);
      }
    })();
    await tick();
    // the window fills: MAX posts made, the MAX-th send is parked
    expect(posts).toHaveLength(MAX_UNACKED_BRICKS);
    expect(done).toHaveLength(MAX_UNACKED_BRICKS - 1);

    ch.ack(7);
    await tick();
    expect(posts).toHaveLength(MAX_UNACKED_BRICKS + 1);

    for (let n = 0; n < MAX_UNACKED_BRICKS + 3; n++) ch.ack(7);
    await producer;
    expect(posts).toHaveLength(MAX_UNACKED_BRICKS + 3);
  });

  test('cancel wakes a parked producer into the caller message', async () => {
    const ch = createBrickChannel(() => {});
    const producer = (async () => {
      for (let n = 0; n < MAX_UNACKED_BRICKS + 1; n++) {
        await ch.sendBrick(3, { n }, undefined, { cancelMessage: 'Ingestion cancelled.' });
      }
    })();
    await tick();
    expect(ch.isCancelled(3)).toBe(false);
    ch.cancel(3);
    await expect(producer).rejects.toThrow('Ingestion cancelled.');
    expect(ch.isCancelled(3)).toBe(true);
    // and further sends refuse immediately
    await expect(ch.sendBrick(3, {})).rejects.toThrow('Job cancelled.');
  });

  test('jobs are independent', async () => {
    const ch = createBrickChannel(() => {});
    ch.cancel(1);
    await expect(ch.sendBrick(2, {})).resolves.toBeUndefined();
  });
});
