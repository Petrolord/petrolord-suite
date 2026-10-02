// Wellsite Studio upgrade U2-013 (2026-10-01), the part with no schema
// change: the signer's name rides in the sign-off statement and a call's
// author in its top_called event, so a report and a top still say who when
// the organisation list is not there (offline) or no longer lists them.
import { statementWithName, nameFromStatement, statementText, namesOnRecord, displayName } from '../services/names';

const UID = '7b0c2a52-5d1e-4c1b-9a0e-3f2a1b4c5d6e';

test('the statement keeps what the signer wrote and gains who signed; signing again does not stack names', () => {
  const s = statementWithName('I confirm this report reflects the well record for the period.', 'R. Rigsite');
  expect(s).toBe('I confirm this report reflects the well record for the period. Signed as R. Rigsite.');
  expect(nameFromStatement(s)).toBe('R. Rigsite');
  expect(statementText(s)).toBe('I confirm this report reflects the well record for the period.');
  expect(statementWithName(s, 'O. Office')).toBe('I confirm this report reflects the well record for the period. Signed as O. Office.');
  expect(statementWithName('Checked.', '')).toBe('Checked.');
  expect(nameFromStatement('Checked.')).toBeNull();
  expect(nameFromStatement(null)).toBeNull();
});

test('names come off the record: a sign-off statement and the event of a call', () => {
  const names = namesOnRecord({
    signoffs: [{ user_id: UID, statement: 'Checked. Signed as R. Rigsite.' }, { user_id: 'u2', statement: 'No name here.' }],
    records: [{ created_by: 'u3', payload: { top_id: 't1', by_name: 'O. Office' } }, { created_by: 'u4', payload: { label: 'Connection' } }],
  });
  expect([...names.entries()]).toEqual([['u3', 'O. Office'], [UID, 'R. Rigsite']]);
});

test('the organisation list wins when it knows the person; otherwise the record name; otherwise the short id', () => {
  const recordNames = new Map([[UID, 'R. Rigsite (as signed)']]);
  expect(displayName(UID, { people: [{ user_id: UID, name: 'Rita Rigsite' }], recordNames })).toBe('Rita Rigsite');
  // offline, or after the person left the organisation: before this the screen and the PDF printed "User 7b0c2a52"
  expect(displayName(UID, { people: [], recordNames })).toBe('R. Rigsite (as signed)');
  expect(displayName(UID, { people: [], recordNames: new Map() })).toBe('User 7b0c2a52');
  expect(displayName(UID, { people: [], user: { id: UID, name: 'Me' }, recordNames })).toBe('Me');
  expect(displayName(null)).toBe('n/a');
});
