// One poll cycle, kept apart from main.js (whose entrypoint check uses
// import.meta) so the jest suite can drive it directly.
export async function pollOnce({ queue, cfg, running, launch, kinds }) {
  await queue.sweepStale();
  let claimed = 0;
  while (running.size < cfg.maxConcurrent) {
    const job = await queue.claim(kinds);
    if (!job) break;
    claimed += 1;
    launch(job);
  }
  return claimed;
}
