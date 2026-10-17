// The Geoscience module showcase (owner GO 2026-10-17): ~10 minutes for
// YouTube (narration, music, captions, chapters) and the NAPE booth loop
// (no voice, the music low, large subtitles). Scenes are separate
// storyboards (geo-s01 ... geo-s10), recorded one by one with
//   node make.mjs <scene> --stage record --no-upload
// and joined here with
//   node module.mjs geo-module
// Music: any licensed file; swap `music.file` (see music/LICENSE.md).
const card = (title, sub) => ({ eyebrow: 'Petrolord Suite · Geoscience', title, sub, footL: 'Geoscience module' });

export default {
  kind: 'module',
  id: 'geo-module',
  title: 'Geoscience in the Petrolord Suite',
  firstChapter: 'Opening',
  xfade: 0.6,
  music: {
    file: '/root/demo-videos/music/horizons-seed7.wav', // original, made by music/compose.py (seed 7)
    underVoiceDb: -20, gapDb: -13, openDb: -8, napeLufs: -30,
  },
  sequence: [
    { scene: 'geo-s01', chapter: 'Opening' },
    { card: 'intro', seconds: 4.5,
      fields: card('From the first log *to the last cell*', 'Wells, petrophysics, correlation, seismic, QI, maps, the 3D model and volumes, on one shared project') },
    { scene: 'geo-s02', chapter: 'The wells' },
    { scene: 'geo-s03', chapter: 'Petrophysics' },
    { scene: 'geo-s04', chapter: 'Well correlation' },
    { scene: 'geo-s05', chapter: 'Seismic interpretation' },
    { scene: 'geo-s06', chapter: 'Quantitative interpretation' },
    { scene: 'geo-s07', chapter: 'Maps and closures' },
    { scene: 'geo-s08', chapter: 'The 3D earth model' },
    { scene: 'geo-s09', chapter: 'Volumes' },
    { scene: 'geo-s09b', chapter: 'And more' },
    { scene: 'geo-s09c' },
    { scene: 'geo-s09d' },
    { scene: 'geo-s10', chapter: 'One project' },
    { card: 'outro', seconds: 6, fields: card('Geoscience *with Petrolord*', 'See it on your own data at petrolord.com') },
  ],
};
