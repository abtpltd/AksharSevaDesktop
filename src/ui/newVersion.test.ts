import { describe, expect, it } from 'vitest';
import { isNewVersion, mainScript } from './newVersion';

const page = (js: string) => `<html><head><script type="module" crossorigin src="${js}"></script><link rel="stylesheet" href="/assets/index-AAA.css"></head></html>`;

describe('new version of the back office', () => {
  it('reads the main script out of the page', () => {
    expect(mainScript(page('/assets/index-Cywl3rls.js'))).toBe('/assets/index-Cywl3rls.js');
    expect(mainScript('<script type="module" src="/src/main.tsx"></script>')).toBeNull();
    expect(mainScript('')).toBeNull();
  });
  it('offers a reload only when the server page names a different script', () => {
    expect(isNewVersion('/assets/index-A.js', page('/assets/index-B.js'))).toBe(true);
    expect(isNewVersion('/assets/index-A.js', page('/assets/index-A.js'))).toBe(false);
    expect(isNewVersion(null, page('/assets/index-B.js'))).toBe(false);
    expect(isNewVersion('/assets/index-A.js', '<html>Service unavailable</html>')).toBe(false);
  });
});
