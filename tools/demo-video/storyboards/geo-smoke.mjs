const fields = { eyebrow: 'Pipeline check', title: 'Module *smoke*', sub: 'two scenes', footL: 'Petrolord Suite' };
export default {
  kind: 'module', id: 'geo-smoke',
  music: { file: '/root/demo-videos/music/horizons-seed7.wav' },
  sequence: [
    { scene: 'geo-smoke-a', chapter: 'First scene' },
    { card: 'intro', fields, chapter: 'Title', seconds: 3 },
    { scene: 'geo-smoke-b', chapter: 'Second scene' },
    { card: 'outro', fields: { ...fields, title: 'petrolord.com' }, seconds: 3 },
  ],
};
