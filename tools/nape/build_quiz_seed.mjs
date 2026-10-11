// Rebuild the quiz bank migration from tools/nape/quiz-bank.json:
//   node tools/nape/build_quiz_seed.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildSeedSql } from './quizSeed.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const bank = JSON.parse(fs.readFileSync(path.join(here, 'quiz-bank.json'), 'utf8'));
const out = path.join(here, '../../supabase/migrations/20261011090100_event_quiz_bank.sql');
fs.writeFileSync(out, buildSeedSql(bank));
console.log(`${bank.length} questions -> ${path.relative(process.cwd(), out)}`);
