import { describe, it, expect } from 'vitest';
import {
  isPublicPath,
  isAssetPath,
  safeNext,
  resolveOrigin,
  describeAuthError,
} from './auth-url';

const req = (url: string, headers: Record<string, string> = {}) =>
  new Request(url, { headers });

describe('isPublicPath', () => {
  it('allows the landing page and the auth surfaces', () => {
    expect(isPublicPath('/')).toBe(true);
    expect(isPublicPath('/login')).toBe(true);
    expect(isPublicPath('/auth/callback')).toBe(true);
    expect(isPublicPath('/api/health')).toBe(true);
  });

  it('gates the app', () => {
    expect(isPublicPath('/app')).toBe(false);
    expect(isPublicPath('/plan/abc/today')).toBe(false);
    expect(isPublicPath('/api/plans')).toBe(false);
  });

  it('does not treat a path that merely starts with a public one as public', () => {
    // The bug a bare startsWith('/login') creates.
    expect(isPublicPath('/login-as-admin')).toBe(false);
    expect(isPublicPath('/authorised-users-only')).toBe(false);
  });
});

describe('isAssetPath', () => {
  it('recognises Next internals and static files', () => {
    expect(isAssetPath('/_next/static/chunk.js')).toBe(true);
    expect(isAssetPath('/favicon.ico')).toBe(true);
    expect(isAssetPath('/logo.svg')).toBe(true);
    expect(isAssetPath('/fonts/inter.woff2')).toBe(true);
  });

  it('leaves real routes alone', () => {
    expect(isAssetPath('/app')).toBe(false);
    expect(isAssetPath('/plan/123/map')).toBe(false);
  });
});

describe('safeNext', () => {
  it('keeps a same-origin path', () => {
    expect(safeNext('/plan/abc/today')).toBe('/plan/abc/today');
    expect(safeNext('/app?tab=all')).toBe('/app?tab=all');
  });

  it('falls back when absent or relative', () => {
    expect(safeNext(null)).toBe('/app');
    expect(safeNext('')).toBe('/app');
    expect(safeNext('app')).toBe('/app');
    expect(safeNext('https://evil.example/steal')).toBe('/app');
  });

  it('rejects protocol-relative URLs, which a plain startsWith("/") lets through', () => {
    expect(safeNext('//evil.example/steal')).toBe('/app');
    expect(safeNext('/\\evil.example/steal')).toBe('/app');
    expect(safeNext('///evil.example')).toBe('/app');
  });

  it('rejects scheme-ish and control-character payloads', () => {
    expect(safeNext('/javascript:alert(1)')).toBe('/app');
    expect(safeNext('/app\nSet-Cookie: x=1')).toBe('/app');
  });

  it('honours a custom fallback', () => {
    expect(safeNext('//evil.example', '/login')).toBe('/login');
  });
});

describe('resolveOrigin', () => {
  it('prefers APP_ORIGIN, because a forwarded header is client-supplied', () => {
    const origin = resolveOrigin(
      req('http://localhost:3000/auth/callback', { 'x-forwarded-host': 'evil.example' }),
      { APP_ORIGIN: 'https://apex.example' },
    );
    expect(origin).toBe('https://apex.example');
  });

  it('trusts the proxy headers when APP_ORIGIN is unset', () => {
    const origin = resolveOrigin(
      req('http://127.0.0.1:3000/auth/callback', {
        'x-forwarded-host': 'apex.example',
        'x-forwarded-proto': 'https',
      }),
      {},
    );
    expect(origin).toBe('https://apex.example');
  });

  it('takes the first entry of a forwarded chain', () => {
    const origin = resolveOrigin(
      req('http://127.0.0.1:3000/auth/callback', {
        'x-forwarded-host': 'apex.example, internal-lb',
        'x-forwarded-proto': 'https, http',
      }),
      {},
    );
    expect(origin).toBe('https://apex.example');
  });

  it('assumes https for a non-local host with no proto header', () => {
    const origin = resolveOrigin(
      req('http://10.0.0.4:3000/auth/callback', { 'x-forwarded-host': 'apex.example' }),
      {},
    );
    expect(origin).toBe('https://apex.example');
  });

  it('stays on http for local development', () => {
    const origin = resolveOrigin(req('http://localhost:3000/auth/callback', { host: 'localhost:3000' }), {});
    expect(origin).toBe('http://localhost:3000');
  });

  it('stays on http for raw IP hosts when no proto header is provided', () => {
    const origin = resolveOrigin(req('http://18.61.67.223:3000/auth/callback', { host: '18.61.67.223:3000' }), {});
    expect(origin).toBe('http://18.61.67.223:3000');
  });

  it('ignores a malformed APP_ORIGIN rather than crashing the callback', () => {
    const origin = resolveOrigin(req('http://localhost:3000/auth/callback', { host: 'localhost:3000' }), {
      APP_ORIGIN: 'not a url',
    });
    expect(origin).toBe('http://localhost:3000');
  });

  it('strips quotes an .env file leaves behind', () => {
    const origin = resolveOrigin(req('http://localhost:3000/x'), { APP_ORIGIN: '"https://apex.example"' });
    expect(origin).toBe('https://apex.example');
  });
});

describe('describeAuthError', () => {
  it('translates the codes a learner can actually act on', () => {
    expect(describeAuthError('access_denied', null)).toMatch(/cancelled/i);
    expect(describeAuthError('otp_expired', null)).toMatch(/expired/i);
  });

  it('prefers the provider description when there is no known code', () => {
    expect(describeAuthError('weird_code', 'Provider+is+down')).toBe('Provider is down');
  });

  it('never returns an empty string', () => {
    expect(describeAuthError(null, null).length).toBeGreaterThan(0);
  });
});
