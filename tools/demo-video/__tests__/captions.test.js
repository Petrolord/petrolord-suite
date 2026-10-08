import { wordsFromAlignment, wordsFromText, buildCues, toSrt, chaptersText } from '../lib/captions.mjs';

// alignment for "Open the plot. Fit it." at 0.1 s per character
function align(text) {
  const chars = [...text];
  return { characters: chars, character_start_times_seconds: chars.map((_, i) => i * 0.1), character_end_times_seconds: chars.map((_, i) => i * 0.1 + 0.1) };
}

test('words carry the times of their first and last characters', () => {
  const w = wordsFromAlignment(align('Open the plot.'));
  expect(w.map((x) => x.text)).toEqual(['Open', 'the', 'plot.']);
  expect(w[2].start).toBeCloseTo(0.9);
  expect(w[2].end).toBeCloseTo(1.4);
});

test('cues break at sentence ends and are shifted onto the video timeline', () => {
  const cues = buildCues([{ offset: 10, words: wordsFromAlignment(align('Open the plot. Fit it.')) }]);
  expect(cues.map((c) => c.text)).toEqual(['Open the plot.', 'Fit it.']);
  expect(cues[0].start).toBeCloseTo(10);
  expect(cues[1].start).toBeCloseTo(11.5);
  expect(cues[0].end).toBeLessThan(cues[1].start);
});

test('long text wraps to at most two balanced lines of the line limit', () => {
  const text = 'Petrophysics Studio reads wells straight from the shared registry so there is nothing to import';
  const cues = buildCues([{ offset: 0, words: wordsFromAlignment(align(text)) }], { maxChars: 42, maxDur: 99 });
  for (const c of cues) {
    const lines = c.text.split('\n');
    expect(lines.length).toBeLessThanOrEqual(2);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(42);
  }
  expect(cues.map((c) => c.text.replace('\n', ' ')).join(' ')).toBe(text);
});

test('negative control: a cue never outlasts maxDur', () => {
  const text = 'one two three four five six seven eight nine ten eleven twelve';
  const cues = buildCues([{ offset: 0, words: wordsFromAlignment(align(text)) }], { maxChars: 200, maxDur: 2 });
  expect(cues.length).toBeGreaterThan(1);
  for (const c of cues) expect(c.end - c.start).toBeLessThanOrEqual(2.2);
});

test('SRT timestamps and YouTube chapters', () => {
  expect(toSrt([{ start: 61.25, end: 62.5, text: 'Hi.' }])).toBe('1\n00:01:01,250 --> 00:01:02,500\nHi.\n');
  expect(chaptersText([{ title: 'Intro', start: 3 }, { title: 'Pickett plot', start: 75.9 }])).toBe('0:00 Intro\n1:15 Pickett plot');
});

test('a caption text with digits spans exactly the spoken clip', () => {
  const w = wordsFromText('The water leg runs from 5,118 to 5,184 ft.', 2, 8);
  expect(w[0].start).toBeCloseTo(2);
  expect(w[w.length - 1].end).toBeCloseTo(8, 1);
  expect(w.map((x) => x.text).join(' ')).toBe('The water leg runs from 5,118 to 5,184 ft.');
  for (let i = 1; i < w.length; i++) expect(w[i].start).toBeGreaterThanOrEqual(w[i - 1].end - 1e-9);
});
