import {
  normalisePhone, validateLead, toRow, whatsappUrl, queueLead, flushQueue, saveLead, leadsCsv, QUEUE_KEY, WHATSAPP_NUMBER,
} from '../eventLeads';

const memStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
};

describe('phone numbers', () => {
  test('Nigerian numbers in every common form become 234 digits', () => {
    for (const s of ['0803 123 4567', '08031234567', '+234 803 123 4567', '234-803-123-4567', '+2348031234567']) expect(normalisePhone(s)).toBe('2348031234567');
    expect(normalisePhone('0901 556 6981')).toBe('2349015566981');
  });
  test('foreign numbers need their plus; junk is refused', () => {
    expect(normalisePhone('+44 20 7946 0958')).toBe('442079460958');
    for (const s of ['', '12345', '0123 456 7890', '+234 603 123 4567', '2348031234', 'abc', '44 20 7946 0958']) expect(normalisePhone(s)).toBeNull();
  });
});

describe('the form', () => {
  const ok = { name: 'Ada Obi', phone: '0803 123 4567', consent: true, interests: ['suite'] };
  test('a complete lead passes', () => expect(validateLead(ok)).toEqual({}));
  test('negative controls: no consent, no name, a bad phone or email are each refused', () => {
    expect(validateLead({ ...ok, consent: false })).toHaveProperty('consent');
    expect(validateLead({ ...ok, name: '  ' })).toHaveProperty('name');
    expect(validateLead({ ...ok, phone: '12345' })).toHaveProperty('phone');
    expect(validateLead({ ...ok, email: 'ada@' })).toHaveProperty('email');
    expect(validateLead({ ...ok, note: 'x'.repeat(1001) })).toHaveProperty('note');
  });
  test('the stored row is trimmed, normalised and keeps only known interests', () => {
    const r = toRow({ ...ok, name: '  Ada Obi ', interests: ['suite', 'hack'], email: '' }, { source: 'tablet', userAgent: 'UA' });
    expect(r).toMatchObject({ name: 'Ada Obi', phone: '2348031234567', email: null, interests: ['suite'], source: 'tablet', consent: true, event: 'NAPE 2026' });
    expect(toRow(ok, { source: 'evil' }).source).toBe('qr');
  });
});

describe('WhatsApp', () => {
  test('the link goes to the business number with an encoded greeting naming the visitor and the interests', () => {
    const u = whatsappUrl({ name: 'Ada & Co', interests: ['suite', 'hse'] });
    expect(u.startsWith(`https://wa.me/${WHATSAPP_NUMBER}?text=`)).toBe(true);
    const text = decodeURIComponent(u.split('text=')[1]);
    expect(text).toBe('Hello Petrolord, this is Ada & Co. I visited your booth at NAPE 2026. I would like to talk about Petrolord Suite and Petrolord HSE.');
    expect(u).not.toMatch(/ |&Co/); // spaces and the ampersand are encoded
    expect(WHATSAPP_NUMBER).toBe('2349015566981');
  });
  test('no name and no interests still give a polite greeting', () => {
    expect(decodeURIComponent(whatsappUrl({}).split('text=')[1])).toBe('Hello Petrolord, I visited your booth at NAPE 2026.');
  });
});

describe('the offline queue', () => {
  test('a failed save is queued and sent on the next flush; a row that still fails stays', async () => {
    const st = memStorage();
    const r1 = await saveLead(st, async () => { throw new Error('offline'); }, { name: 'A' });
    expect(r1).toMatchObject({ saved: false, queued: true });
    await saveLead(st, async () => ({ error: { message: 'relation "event_leads" does not exist' } }), { name: 'B' });
    expect(JSON.parse(st.getItem(QUEUE_KEY))).toHaveLength(2);
    const sent = [];
    const res = await flushQueue(st, async (row) => (row.name === 'B' ? { error: { message: 'still down' } } : (sent.push(row.name), { error: null })));
    expect(res).toEqual({ sent: 1, left: 1 });
    expect(sent).toEqual(['A']);
    expect(JSON.parse(st.getItem(QUEUE_KEY)).map((x) => x.row.name)).toEqual(['B']);
    await flushQueue(st, async () => ({ error: null }));
    expect(st.getItem(QUEUE_KEY)).toBeNull();
  });
  test('a successful save queues nothing (negative control), and blocked storage never throws', async () => {
    const st = memStorage();
    expect(await saveLead(st, async () => ({ error: null }), { name: 'A' })).toEqual({ saved: true });
    expect(st.getItem(QUEUE_KEY)).toBeNull();
    const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => {} };
    expect(() => queueLead(blocked, { name: 'A' })).not.toThrow();
    await expect(flushQueue(blocked, async () => ({ error: null }))).resolves.toEqual({ sent: 0, left: 0 });
  });
});

test('CSV for staff quotes commas and joins interests', () => {
  const csv = leadsCsv([{ created_at: 't', name: 'Obi, Ada', interests: ['suite', 'hse'], note: 'say "hi"' }]);
  expect(csv.split('\n')[1]).toBe('t,,"Obi, Ada",,,,,suite; hse,"say ""hi""",,');
});
