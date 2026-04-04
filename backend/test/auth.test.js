/**
 * Auth unit tests — test JWT logic and middleware without a running server.
 * Run on VPS: npm test
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET = 'test-secret-key-for-unit-testing';
process.env.JWT_EXPIRES_IN = '1h';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-for-unit-testing';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';

const { generateTokens, verifyToken, verifyRefreshToken } = await import('../src/auth.js');

const mockUser = { id: 'user-123', email: 'test@example.com', role: 'agent' };

describe('generateTokens', () => {
  test('returns token and refreshToken', () => {
    const { token, refreshToken } = generateTokens(mockUser);
    assert.ok(typeof token === 'string' && token.length > 0, 'token should be a non-empty string');
    assert.ok(typeof refreshToken === 'string' && refreshToken.length > 0, 'refreshToken should be a non-empty string');
  });

  test('token contains user payload', () => {
    const { token } = generateTokens(mockUser);
    const payload = verifyToken(token);
    assert.equal(payload.id, mockUser.id);
    assert.equal(payload.email, mockUser.email);
    assert.equal(payload.role, mockUser.role);
  });

  test('refresh token contains user id only', () => {
    const { refreshToken } = generateTokens(mockUser);
    const payload = verifyRefreshToken(refreshToken);
    assert.equal(payload.id, mockUser.id);
    assert.ok(!payload.email, 'refresh token should not contain email');
  });
});

describe('verifyToken', () => {
  test('throws on tampered token', () => {
    assert.throws(
      () => verifyToken('eyJhbGciOiJIUzI1NiJ9.tampered.invalid'),
      { name: 'JsonWebTokenError' }
    );
  });

  test('throws on expired token', async () => {
    const { default: jwt } = await import('jsonwebtoken');
    const expired = jwt.sign({ id: 'x' }, process.env.JWT_SECRET, { expiresIn: '1ms' });
    await new Promise(r => setTimeout(r, 50));
    assert.throws(() => verifyToken(expired), { name: 'TokenExpiredError' });
  });

  test('accepts valid token', () => {
    const { token } = generateTokens(mockUser);
    assert.doesNotThrow(() => verifyToken(token));
  });
});

describe('verifyRefreshToken', () => {
  test('throws on invalid signature', async () => {
    const { default: jwt } = await import('jsonwebtoken');
    const bad = jwt.sign({ id: 'x' }, 'wrong-secret');
    assert.throws(() => verifyRefreshToken(bad));
  });

  test('accepts valid refresh token', () => {
    const { refreshToken } = generateTokens(mockUser);
    assert.doesNotThrow(() => verifyRefreshToken(refreshToken));
  });
});
