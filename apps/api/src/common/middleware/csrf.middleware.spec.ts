import { isValidCsrfToken, issueCsrfToken, requiresCsrfCheck } from './csrf.middleware';

const SECRET = 'test-csrf-secret-0000000000000000000000';
const session = { opsdesk_access: 'jwt' };

describe('CSRF double-submit token', () => {
  it('accepts a token it issued and rejects tampering or another secret', () => {
    const token = issueCsrfToken(SECRET);
    expect(isValidCsrfToken(token, SECRET)).toBe(true);
    expect(isValidCsrfToken(`${token}x`, SECRET)).toBe(false);
    expect(isValidCsrfToken(`attacker.${token.split('.')[1]}`, SECRET)).toBe(false);
    expect(isValidCsrfToken(token, 'another-secret-11111111111111111111111')).toBe(false);
    expect(isValidCsrfToken(undefined, SECRET)).toBe(false);
    expect(isValidCsrfToken('a.b.c', SECRET)).toBe(false);
  });
});

describe('requiresCsrfCheck', () => {
  const browser = { 'sec-fetch-site': 'same-origin' };

  it('checks state-changing browser requests that carry a session', () => {
    expect(requiresCsrfCheck({ method: 'POST', headers: browser, cookies: session })).toBe(true);
    expect(
      requiresCsrfCheck({ method: 'DELETE', headers: { origin: 'https://evil.example' }, cookies: session }),
    ).toBe(true);
  });

  it('skips safe methods, requests without a session, and non-browser clients', () => {
    expect(requiresCsrfCheck({ method: 'GET', headers: browser, cookies: session })).toBe(false);
    expect(requiresCsrfCheck({ method: 'POST', headers: browser, cookies: {} })).toBe(false);
    expect(requiresCsrfCheck({ method: 'POST', headers: {}, cookies: session })).toBe(false);
  });
});
