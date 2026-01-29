const { describe, test, expect, beforeEach } = require('@jest/globals');

process.env.SESSION_COOKIE_SECRET = 'test_secret_32_bytes_long_hex_string_123456';

const { makeSignedCookie, readSignedCookie, clearCookie } = require('../../../lib/cookies');

describe('Cookie Utilities', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
  });

  test('creates signed cookie', () => {
    const cookie = makeSignedCookie('test', 'value123', { maxAge: 3600 });
    
    expect(cookie).toContain('rdd_test=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Max-Age=3600');
  });

  test('reads valid signed cookie', () => {
    const cookie = makeSignedCookie('test', 'value123');
    const cookieValue = cookie.split(';')[0].split('=')[1];
    const req = {
      headers: {
        cookie: `rdd_test=${cookieValue}`
      }
    };
    
    const value = readSignedCookie(req, 'test');
    expect(value).toBe('value123');
  });

  test('rejects tampered cookie', () => {
    const cookie = makeSignedCookie('test', 'value123');
    const cookieValue = cookie.split(';')[0].split('=')[1];
    const tampered = cookieValue.replace('value123', 'hacked');
    const req = {
      headers: {
        cookie: `rdd_test=${tampered}`
      }
    };
    
    const value = readSignedCookie(req, 'test');
    expect(value).toBeNull();
  });

  test('returns null for missing cookie', () => {
    const req = {
      headers: {
        cookie: ''
      }
    };
    
    const value = readSignedCookie(req, 'nonexistent');
    expect(value).toBeNull();
  });

  test('clears cookie', () => {
    const cleared = clearCookie('test');
    expect(cleared).toContain('rdd_test=');
    expect(cleared).toContain('Max-Age=0');
  });

  test('handles special characters in cookie value', () => {
    const specialValue = 'value with spaces & special chars!@#$';
    const cookie = makeSignedCookie('test', specialValue);
    const cookieValue = cookie.split(';')[0].split('=')[1];
    const req = {
      headers: {
        cookie: `rdd_test=${cookieValue}`
      }
    };
    
    const value = readSignedCookie(req, 'test');
    expect(value).toBe(specialValue);
  });

  test('handles multiple cookies', () => {
    const cookie1 = makeSignedCookie('test1', 'value1');
    const cookie2 = makeSignedCookie('test2', 'value2');
    const value1 = cookie1.split(';')[0].split('=')[1];
    const value2 = cookie2.split(';')[0].split('=')[1];
    
    const req = {
      headers: {
        cookie: `rdd_test1=${value1}; rdd_test2=${value2}`
      }
    };
    
    expect(readSignedCookie(req, 'test1')).toBe('value1');
    expect(readSignedCookie(req, 'test2')).toBe('value2');
  });
});
