/**
 * Tasks unit tests — test priority/status validation and pagination without a DB.
 * Run: npm test
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// ── Task priority validation ─────────────────────────────────────────────────
const VALID_PRIORITIES = new Set(['low', 'medium', 'high', 'urgent']);
const VALID_STATUSES = new Set(['pending', 'in_progress', 'completed', 'cancelled']);

function validateTask(body) {
  const errors = [];
  if (!body.title || !body.title.trim()) {
    errors.push('title is required');
  }
  if (body.priority && !VALID_PRIORITIES.has(body.priority)) {
    errors.push(`invalid priority: ${body.priority}`);
  }
  if (body.status && !VALID_STATUSES.has(body.status)) {
    errors.push(`invalid status: ${body.status}`);
  }
  if (body.due_date && isNaN(Date.parse(body.due_date))) {
    errors.push('invalid due_date');
  }
  return errors;
}

describe('validateTask', () => {
  test('valid task returns no errors', () => {
    const errors = validateTask({ title: 'Fix bug', priority: 'high', status: 'pending' });
    assert.deepEqual(errors, []);
  });

  test('missing title returns error', () => {
    const errors = validateTask({ priority: 'medium' });
    assert.ok(errors.includes('title is required'));
  });

  test('empty title returns error', () => {
    const errors = validateTask({ title: '   ' });
    assert.ok(errors.includes('title is required'));
  });

  test('invalid priority returns error', () => {
    const errors = validateTask({ title: 'Task', priority: 'critical' });
    assert.ok(errors.some(e => e.includes('invalid priority')));
  });

  test('invalid status returns error', () => {
    const errors = validateTask({ title: 'Task', status: 'deleted' });
    assert.ok(errors.some(e => e.includes('invalid status')));
  });

  test('invalid due_date returns error', () => {
    const errors = validateTask({ title: 'Task', due_date: 'not-a-date' });
    assert.ok(errors.some(e => e.includes('invalid due_date')));
  });

  test('valid ISO date passes', () => {
    const errors = validateTask({ title: 'Task', due_date: '2026-12-31T10:00:00Z' });
    assert.deepEqual(errors, []);
  });
});

// ── Task defaults ─────────────────────────────────────────────────────────────
function applyTaskDefaults(body) {
  return {
    ...body,
    priority: body.priority || 'medium',
    status: body.status || 'pending',
    repeat_interval: body.repeat_interval || 'none',
  };
}

describe('applyTaskDefaults', () => {
  test('missing priority defaults to medium', () => {
    const result = applyTaskDefaults({ title: 'Task' });
    assert.equal(result.priority, 'medium');
  });

  test('missing status defaults to pending', () => {
    const result = applyTaskDefaults({ title: 'Task' });
    assert.equal(result.status, 'pending');
  });

  test('missing repeat_interval defaults to none', () => {
    const result = applyTaskDefaults({ title: 'Task' });
    assert.equal(result.repeat_interval, 'none');
  });

  test('existing values preserved', () => {
    const result = applyTaskDefaults({ title: 'Task', priority: 'urgent', status: 'in_progress' });
    assert.equal(result.priority, 'urgent');
    assert.equal(result.status, 'in_progress');
  });
});

// ── Task pagination ──────────────────────────────────────────────────────────
function parseTaskPagination(query) {
  const limit = Math.min(parseInt(query.limit) || 100, 500);
  const offset = Math.max(parseInt(query.offset) || 0, 0);
  return { limit, offset };
}

describe('parseTaskPagination', () => {
  test('defaults to limit 100 offset 0', () => {
    const { limit, offset } = parseTaskPagination({});
    assert.equal(limit, 100);
    assert.equal(offset, 0);
  });

  test('caps limit at 500', () => {
    const { limit } = parseTaskPagination({ limit: '9999' });
    assert.equal(limit, 500);
  });

  test('negative offset becomes 0', () => {
    const { offset } = parseTaskPagination({ offset: '-5' });
    assert.equal(offset, 0);
  });

  test('custom valid values respected', () => {
    const { limit, offset } = parseTaskPagination({ limit: '25', offset: '50' });
    assert.equal(limit, 25);
    assert.equal(offset, 50);
  });
});

// ── Task reminder validation ──────────────────────────────────────────────────
const VALID_REPEAT_INTERVALS = new Set(['none', 'daily', 'weekly', 'monthly']);

function validateReminderMinutes(minutes) {
  if (minutes === null || minutes === undefined) return true;
  const n = parseInt(minutes);
  return !isNaN(n) && n > 0;
}

describe('validateReminderMinutes', () => {
  test('null is valid (no reminder)', () => {
    assert.ok(validateReminderMinutes(null));
  });

  test('positive integer is valid', () => {
    assert.ok(validateReminderMinutes(30));
  });

  test('zero is invalid', () => {
    assert.ok(!validateReminderMinutes(0));
  });

  test('negative is invalid', () => {
    assert.ok(!validateReminderMinutes(-5));
  });

  test('non-numeric string is invalid', () => {
    assert.ok(!validateReminderMinutes('abc'));
  });
});

describe('VALID_REPEAT_INTERVALS', () => {
  test('none is valid', () => {
    assert.ok(VALID_REPEAT_INTERVALS.has('none'));
  });

  test('daily is valid', () => {
    assert.ok(VALID_REPEAT_INTERVALS.has('daily'));
  });

  test('hourly is not valid', () => {
    assert.ok(!VALID_REPEAT_INTERVALS.has('hourly'));
  });
});
