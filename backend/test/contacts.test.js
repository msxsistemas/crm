/**
 * Contacts unit tests — test validation helpers without a DB.
 * Run: npm test
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// ── Phone normalization ──────────────────────────────────────────────────────
function normalizePhone(phone) {
  if (!phone) return null;
  // Remove all non-digit characters except leading +
  const digits = phone.replace(/[^\d+]/g, '');
  return digits || null;
}

describe('normalizePhone', () => {
  test('removes dashes and spaces', () => {
    assert.equal(normalizePhone('11 9 9999-9999'), '11999999999');
  });

  test('preserves leading +', () => {
    assert.equal(normalizePhone('+55 11 99999-9999'), '+5511999999999');
  });

  test('returns null for empty string', () => {
    assert.equal(normalizePhone(''), null);
  });

  test('returns null for null input', () => {
    assert.equal(normalizePhone(null), null);
  });

  test('preserves already clean phone', () => {
    assert.equal(normalizePhone('5511999999999'), '5511999999999');
  });
});

// ── Contact bulk import validation ──────────────────────────────────────────
function validateBulkContact(c) {
  const errors = [];
  if (!c.name || typeof c.name !== 'string' || !c.name.trim()) {
    errors.push('name is required');
  }
  if (!c.phone || typeof c.phone !== 'string' || !c.phone.trim()) {
    errors.push('phone is required');
  }
  return errors;
}

describe('validateBulkContact', () => {
  test('valid contact returns no errors', () => {
    const errors = validateBulkContact({ name: 'João', phone: '11999999999' });
    assert.deepEqual(errors, []);
  });

  test('missing name returns error', () => {
    const errors = validateBulkContact({ phone: '11999999999' });
    assert.ok(errors.includes('name is required'));
  });

  test('missing phone returns error', () => {
    const errors = validateBulkContact({ name: 'João' });
    assert.ok(errors.includes('phone is required'));
  });

  test('empty name returns error', () => {
    const errors = validateBulkContact({ name: '   ', phone: '11999999999' });
    assert.ok(errors.includes('name is required'));
  });

  test('both missing returns 2 errors', () => {
    const errors = validateBulkContact({});
    assert.equal(errors.length, 2);
  });
});

// ── Contact filter building ──────────────────────────────────────────────────
function buildContactFilter(query) {
  const conditions = [];
  const params = [];
  let p = 1;

  if (query.search) {
    conditions.push(`(name ILIKE $${p} OR phone ILIKE $${p} OR email ILIKE $${p})`);
    params.push(`%${query.search}%`);
    p++;
  }
  if (query.tag_id) {
    conditions.push(`$${p} = ANY(tags)`);
    params.push(query.tag_id);
    p++;
  }
  if (query.status) {
    conditions.push(`status = $${p}`);
    params.push(query.status);
    p++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return { where, params };
}

describe('buildContactFilter', () => {
  test('empty query returns no WHERE clause', () => {
    const { where, params } = buildContactFilter({});
    assert.equal(where, '');
    assert.deepEqual(params, []);
  });

  test('search adds ILIKE condition', () => {
    const { where, params } = buildContactFilter({ search: 'João' });
    assert.ok(where.includes('ILIKE'));
    assert.deepEqual(params, ['%João%']);
  });

  test('multiple filters combine with AND', () => {
    const { where, params } = buildContactFilter({ search: 'test', status: 'active' });
    assert.ok(where.includes('AND'));
    assert.equal(params.length, 2);
  });

  test('tag_id filter adds ANY condition', () => {
    const { where, params } = buildContactFilter({ tag_id: 'uuid-123' });
    assert.ok(where.includes('ANY'));
    assert.deepEqual(params, ['uuid-123']);
  });
});
