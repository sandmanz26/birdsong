import { describe, expect, it } from 'vitest';
import { classifyLicense } from '../scripts/license';

describe('catalogue licence policy', () => {
  it('allows commercial-friendly licences under the commercial policy', () => {
    expect(classifyLicense('//creativecommons.org/licenses/by/4.0/', 'commercial')).toMatchObject({ short: 'CC BY 4.0', allowed: true });
    expect(classifyLicense('//creativecommons.org/licenses/by-sa/3.0/', 'commercial')).toMatchObject({ short: 'CC BY-SA 3.0', allowed: true });
    expect(classifyLicense('https://creativecommons.org/publicdomain/zero/1.0/', 'commercial')).toMatchObject({ short: 'CC0', allowed: true });
    expect(classifyLicense('CC BY-SA 4.0', 'commercial').allowed).toBe(true);
    expect(classifyLicense('Public domain', 'commercial').allowed).toBe(true);
  });

  it('rejects non-commercial licences unless running the beta policy', () => {
    expect(classifyLicense('//creativecommons.org/licenses/by-nc-sa/4.0/', 'commercial').allowed).toBe(false);
    expect(classifyLicense('//creativecommons.org/licenses/by-nc-sa/4.0/', 'beta').allowed).toBe(true);
    expect(classifyLicense('//creativecommons.org/licenses/by-nc/4.0/', 'beta')).toMatchObject({ short: 'CC BY-NC 4.0', allowed: true });
  });

  it('never allows no-derivatives licences (we trim and normalise)', () => {
    for (const p of ['commercial', 'beta'] as const) {
      expect(classifyLicense('//creativecommons.org/licenses/by-nc-nd/4.0/', p).allowed).toBe(false);
      expect(classifyLicense('//creativecommons.org/licenses/by-nd/4.0/', p).allowed).toBe(false);
    }
  });

  it('rejects unknown licences', () => {
    expect(classifyLicense('GFDL', 'beta').allowed).toBe(false);
    expect(classifyLicense('', 'beta').allowed).toBe(false);
  });
});
