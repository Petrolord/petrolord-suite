// The question bank seed for the booth quiz: turns tools/nape/quiz-bank.json
// into the SQL that loads event_quiz_questions. build_quiz_seed.mjs writes it
// to supabase/migrations/20261011090100_event_quiz_bank.sql, and the jest
// test (src/lib/__tests__/eventQuizBank.test.js) rebuilds it and checks the
// committed file matches, so the JSON stays the one source.

const lit = (v) => (v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);

export function buildSeedSql(bank) {
  const rows = bank.map((q) => `  (${[
    lit(q.id), q.day_no, lit(q.kind), q.difficulty, lit(q.module), lit(q.topic ?? null), lit(q.prompt),
    `${lit(JSON.stringify(q.options))}::jsonb`, q.answer_index, lit(q.explanation), lit(q.source), lit(q.origin),
  ].join(', ')})`);
  return [
    '-- Question bank for the Petrolord Upstream Challenge (NAPE 2026 booth quiz).',
    '-- GENERATED from tools/nape/quiz-bank.json by tools/nape/build_quiz_seed.mjs;',
    '-- edit the JSON and rebuild, never this file. Needs 20261011090000_event_quiz.sql.',
    '-- Idempotent: every question is upserted by id; questions removed from the',
    '-- JSON are switched off (active = false) because past games may refer to them.',
    '',
    'insert into public.event_quiz_questions',
    '  (id, day_no, kind, difficulty, module, topic, prompt, options, answer_index, explanation, source, origin)',
    'values',
    `${rows.join(',\n')}`,
    'on conflict (id) do update set',
    '  day_no = excluded.day_no, kind = excluded.kind, difficulty = excluded.difficulty, module = excluded.module,',
    '  topic = excluded.topic, prompt = excluded.prompt, options = excluded.options, answer_index = excluded.answer_index,',
    '  explanation = excluded.explanation, source = excluded.source, origin = excluded.origin, active = true;',
    '',
    `update public.event_quiz_questions set active = false where id not in (${bank.map((q) => lit(q.id)).join(', ')});`,
    '',
  ].join('\n');
}
