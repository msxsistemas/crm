/**
 * Conversations unit tests — test filtering/pagination helpers without a DB.
 * Run: npm test
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// ── Pagination helper ────────────────────────────────────────────────────────
function parsePagination(query) {
  const limit = Math.min(Math.max(parseInt(query.limit) || 50, 1), 200);
  const cursor = query.cursor || null;
  return { limit, cursor };
}

describe('parsePagination', () => {
  test('defaults to limit 50', () => {
    const { limit } = parsePagination({});
    assert.equal(limit, 50);
  });

  test('respects custom limit', () => {
    const { limit } = parsePagination({ limit: '25' });
    assert.equal(limit, 25);
  });

  test('caps limit at 200', () => {
    const { limit } = parsePagination({ limit: '9999' });
    assert.equal(limit, 200);
  });

  test('invalid limit 0 defaults to 50', () => {
    // parseInt('0') is 0 (falsy), so || 50 applies
    const { limit } = parsePagination({ limit: '0' });
    assert.equal(limit, 50);
  });

  test('cursor is null when not provided', () => {
    const { cursor } = parsePagination({});
    assert.equal(cursor, null);
  });

  test('cursor returned when provided', () => {
    const { cursor } = parsePagination({ cursor: 'abc123' });
    assert.equal(cursor, 'abc123');
  });
});

// ── Conversation status transitions ─────────────────────────────────────────
const VALID_STATUSES = new Set(['open', 'attending', 'closed', 'in_progress']);

function isValidStatusTransition(from, to) {
  if (!VALID_STATUSES.has(to)) return false;
  // Cannot re-open a closed conversation to attending directly
  if (from === 'closed' && to === 'attending') return false;
  return true;
}

describe('isValidStatusTransition', () => {
  test('open → attending is valid', () => {
    assert.ok(isValidStatusTransition('open', 'attending'));
  });

  test('attending → closed is valid', () => {
    assert.ok(isValidStatusTransition('attending', 'closed'));
  });

  test('closed → open is valid (reopen)', () => {
    assert.ok(isValidStatusTransition('closed', 'open'));
  });

  test('closed → attending is invalid', () => {
    assert.ok(!isValidStatusTransition('closed', 'attending'));
  });

  test('invalid target status rejected', () => {
    assert.ok(!isValidStatusTransition('open', 'deleted'));
  });
});

// ── Allowed update fields ────────────────────────────────────────────────────
const ALLOWED_FIELDS = new Set([
  'status', 'assigned_to', 'category_id', 'starred', 'sentiment',
  'label_ids', 'awaiting_csat', 'is_merged', 'merged_into',
  'unread_count', 'connection_name', 'last_message_at',
]);

function filterAllowedFields(body) {
  return Object.fromEntries(
    Object.entries(body).filter(([k]) => ALLOWED_FIELDS.has(k))
  );
}

describe('filterAllowedFields', () => {
  test('keeps only allowed fields', () => {
    const result = filterAllowedFields({ status: 'open', password: 'hack', assigned_to: 'uid' });
    assert.ok('status' in result);
    assert.ok('assigned_to' in result);
    assert.ok(!('password' in result));
  });

  test('empty body returns empty object', () => {
    const result = filterAllowedFields({});
    assert.deepEqual(result, {});
  });

  test('all invalid fields returns empty object', () => {
    const result = filterAllowedFields({ foo: 1, bar: 2 });
    assert.deepEqual(result, {});
  });
});

// ── Conversation stats aggregation ──────────────────────────────────────────
function aggregateStats(rows) {
  const result = { open: 0, in_progress: 0, closed: 0 };
  for (const r of rows) {
    if (r.status in result) {
      result[r.status] = parseInt(r.count);
    }
  }
  return result;
}

describe('aggregateStats', () => {
  test('aggregates correctly', () => {
    const rows = [
      { status: 'open', count: '5' },
      { status: 'closed', count: '3' },
    ];
    const result = aggregateStats(rows);
    assert.equal(result.open, 5);
    assert.equal(result.closed, 3);
    assert.equal(result.in_progress, 0);
  });

  test('ignores unknown statuses', () => {
    const rows = [{ status: 'unknown', count: '99' }];
    const result = aggregateStats(rows);
    assert.deepEqual(result, { open: 0, in_progress: 0, closed: 0 });
  });

  test('empty rows returns all zeros', () => {
    const result = aggregateStats([]);
    assert.deepEqual(result, { open: 0, in_progress: 0, closed: 0 });
  });
});
