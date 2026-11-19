import { describe, expect, it } from 'vitest';
import { err, isErr, isOk, ok } from './result.js';

describe('@velm/shared Result helpers', () => {
  it('constructs and narrows ok and err results', () => {
    const success = ok({ count: 3 });
    expect(isOk(success)).toBe(true);
    expect(isErr(success)).toBe(false);
    if (isOk(success)) {
      expect(success.data.count).toBe(3);
    }

    const failure = err({ code: 'AUTH_FAILED', message: 'Invalid password' } as const);
    expect(isErr(failure)).toBe(true);
    expect(isOk(failure)).toBe(false);
    if (isErr(failure)) {
      expect(failure.error.code).toBe('AUTH_FAILED');
    }
  });
});
