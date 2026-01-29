const { describe, test, expect } = require('@jest/globals');
const { generateCodeVerifier, generateCodeChallenge, randomState, urlSafeBase64 } = require('../../../lib/pkce');

describe('PKCE Utilities', () => {
  test('generates valid code verifier', () => {
    const verifier = generateCodeVerifier();
    expect(verifier).toBeDefined();
    expect(verifier.length).toBeGreaterThan(40);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/); // URL-safe base64
  });

  test('generates code challenge from verifier', () => {
    const verifier = generateCodeVerifier();
    const challenge = generateCodeChallenge(verifier);
    
    expect(challenge).toBeDefined();
    expect(challenge.length).toBeGreaterThan(40);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    
    // Challenge should be different from verifier
    expect(challenge).not.toBe(verifier);
  });

  test('generates deterministic challenge for same verifier', () => {
    const verifier = 'test_verifier_12345';
    const challenge1 = generateCodeChallenge(verifier);
    const challenge2 = generateCodeChallenge(verifier);
    
    expect(challenge1).toBe(challenge2);
  });

  test('generates unique state values', () => {
    const state1 = randomState();
    const state2 = randomState();
    
    expect(state1).toBeDefined();
    expect(state2).toBeDefined();
    expect(state1).not.toBe(state2);
  });

  test('urlSafeBase64 removes padding and special chars', () => {
    const input = Buffer.from('test input');
    const output = urlSafeBase64(input);
    
    expect(output).not.toContain('+');
    expect(output).not.toContain('/');
    expect(output).not.toContain('=');
  });

  test('generates multiple unique verifiers', () => {
    const verifiers = Array.from({ length: 10 }, () => generateCodeVerifier());
    const uniqueVerifiers = new Set(verifiers);
    
    expect(uniqueVerifiers.size).toBe(10);
  });
});
