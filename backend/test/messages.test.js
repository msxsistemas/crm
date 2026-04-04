/**
 * Messages unit tests — test message validation and queue logic without a DB.
 * Run on VPS: npm test
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// ── UUID validation (same logic used in kanban-cards fix) ──────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function filterValidUUIDs(ids) {
  return (Array.isArray(ids) ? ids : String(ids).split(',')).filter(id => UUID_RE.test(id));
}

describe('UUID validation (kanban-cards guard)', () => {
  test('filters out placeholder string', () => {
    assert.deepEqual(filterValidUUIDs('placeholder'), []);
  });

  test('filters out empty string', () => {
    assert.deepEqual(filterValidUUIDs(''), []);
  });

  test('accepts valid UUID', () => {
    const valid = '550e8400-e29b-41d4-a716-446655440000';
    assert.deepEqual(filterValidUUIDs(valid), [valid]);
  });

  test('filters mixed list keeping only valid UUIDs', () => {
    const valid = '550e8400-e29b-41d4-a716-446655440000';
    const result = filterValidUUIDs([valid, 'placeholder', 'abc', '']);
    assert.deepEqual(result, [valid]);
  });

  test('accepts comma-separated valid UUIDs', () => {
    const a = '550e8400-e29b-41d4-a716-446655440000';
    const b = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
    assert.deepEqual(filterValidUUIDs(`${a},${b}`), [a, b]);
  });
});

// ── Message content normalization ──────────────────────────────────────────
function normalizeMessageContent(body) {
  return body?.content || body?.body || '';
}

function resolveDirection(body) {
  if (body.from_me === true) return 'outbound';
  if (body.from_me === false) return 'inbound';
  return body.direction || 'outbound';
}

describe('Message content normalization', () => {
  test('uses content field when present', () => {
    assert.equal(normalizeMessageContent({ content: 'hello' }), 'hello');
  });

  test('falls back to body field', () => {
    assert.equal(normalizeMessageContent({ body: 'world' }), 'world');
  });

  test('returns empty string when both absent', () => {
    assert.equal(normalizeMessageContent({}), '');
  });
});

describe('Message direction resolution', () => {
  test('from_me=true → outbound', () => {
    assert.equal(resolveDirection({ from_me: true }), 'outbound');
  });

  test('from_me=false → inbound', () => {
    assert.equal(resolveDirection({ from_me: false }), 'inbound');
  });

  test('explicit direction field used when from_me absent', () => {
    assert.equal(resolveDirection({ direction: 'inbound' }), 'inbound');
  });

  test('defaults to outbound when nothing specified', () => {
    assert.equal(resolveDirection({}), 'outbound');
  });
});

// ── Cursor pagination encoding ─────────────────────────────────────────────
function encodeCursor(row) {
  return Buffer.from(`${row.last_message_at}|${row.id}`).toString('base64url');
}

function decodeCursor(cursor) {
  const [ts, id] = Buffer.from(cursor, 'base64url').toString().split('|');
  return { ts, id };
}

describe('Cursor-based pagination', () => {
  test('encodes and decodes cursor correctly', () => {
    const row = { last_message_at: '2026-04-04T12:00:00.000Z', id: '550e8400-e29b-41d4-a716-446655440000' };
    const cursor = encodeCursor(row);
    const decoded = decodeCursor(cursor);
    assert.equal(decoded.ts, row.last_message_at);
    assert.equal(decoded.id, row.id);
  });

  test('cursor is URL-safe (no +, /, =)', () => {
    const row = { last_message_at: '2026-04-04T12:00:00.000Z', id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' };
    const cursor = encodeCursor(row);
    assert.ok(!/[+/=]/.test(cursor), `cursor should be URL-safe, got: ${cursor}`);
  });
});
