const test = require('node:test');
const assert = require('node:assert/strict');
const { determinePresence } = require('../helpers/presenceTracking');
const { evaluateRow } = require('../helpers/autoClockOut');
const { normalizeCompanyEmail } = require('../helpers/companyEmail');

test('presence counts either enabled on-site signal and preserves unknown signals', () => {
  assert.equal(
    determinePresence({
      enforceLocation: true,
      enforceNetwork: true,
      gpsInside: true,
      networkInside: false,
    }),
    'inside'
  );
  assert.equal(
    determinePresence({
      enforceLocation: true,
      enforceNetwork: true,
      gpsInside: false,
      networkInside: false,
    }),
    'outside'
  );
  assert.equal(
    determinePresence({
      enforceLocation: true,
      enforceNetwork: false,
      gpsInside: null,
      networkInside: null,
    }),
    'unknown'
  );
});

test('only a verified departure at or after closing auto-clocks out', () => {
  const now = new Date('2026-03-26T17:03:00');
  const closing = new Date('2026-03-26T17:00:00');
  const baseRow = {
    clock_in_mode: 'onsite',
    presence_state: 'outside',
    presence_last_seen_at: '2026-03-26 17:02:00',
    after_close_tracking: 1,
  };

  const afterClose = evaluateRow(
    { ...baseRow, presence_outside_since: '2026-03-26 17:01:00' },
    now,
    closing
  );
  assert.equal(afterClose.action, 'auto_close');
  assert.equal(afterClose.clockOut, '17:01:00');

  const beforeClose = evaluateRow(
    { ...baseRow, presence_outside_since: '2026-03-26 16:59:00' },
    now,
    closing
  );
  assert.equal(beforeClose.action, 'review');
});

test('stale or unverifiable departure goes to admin review', () => {
  const result = evaluateRow(
    {
      clock_in_mode: 'onsite',
      presence_state: 'outside',
      presence_last_seen_at: '2026-03-26 17:00:00',
      presence_outside_since: '2026-03-26 17:00:00',
      after_close_tracking: 1,
    },
    new Date('2026-03-26T17:10:00'),
    new Date('2026-03-26T17:00:00')
  );
  assert.equal(result.action, 'review');
});

test('company email validation accepts only the company domain', () => {
  assert.equal(
    normalizeCompanyEmail(' Wisdom@angelcommoditiesltd.org '),
    'wisdom@angelcommoditiesltd.org'
  );
  assert.equal(normalizeCompanyEmail('wisdom@example.com'), null);
});
