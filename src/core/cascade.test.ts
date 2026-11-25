import { describe, expect, it } from 'vitest';
import { ancestry, BUILT_IN, effective } from './cascade';
import type { LevelValues } from './types';

const lv = (values: LevelValues['values'], locks: LevelValues['locks'] = []): LevelValues => ({ values, locks });

describe('slide standard levels', () => {
  it('lists the levels from the top down', () => {
    expect(ancestry('world/kenya/nairobi')).toEqual(['world', 'world/kenya', 'world/kenya/nairobi']);
  });
  it('uses the built-in look when nobody has changed anything', () => {
    const e = effective({}, 'world/kenya');
    expect(e.value.fontFace).toBe('Calibri');
    expect(e.source.fontFace).toBe(BUILT_IN);
  });
  it('applies each level on top of the one above and says where each value comes from', () => {
    const e = effective({
      world: lv({ fontFace: 'Georgia', frameBg: 'FFFFFF' }),
      'world/kenya': lv({ fontFace: 'Arial' }),
      'world/kenya/nairobi': lv({ frameBg: '000000' }),
    }, 'world/kenya/nairobi');
    expect(e.value.fontFace).toBe('Arial');
    expect(e.value.frameBg).toBe('000000');
    expect(e.source.fontFace).toBe('world/kenya');
    expect(e.source.frameBg).toBe('world/kenya/nairobi');
    expect(e.source.titleText).toBe(BUILT_IN);
  });
  it('a change at the top reaches levels that did not override it, but not their siblings\' own values', () => {
    const standards = { world: lv({ titleText: 'NOTICE' }), 'world/kenya': lv({ titleText: 'KENYA' }) };
    expect(effective(standards, 'world/uganda').value.titleText).toBe('NOTICE');
    expect(effective(standards, 'world/kenya').value.titleText).toBe('KENYA');
  });
  it('a lock stops lower levels changing that setting, and the locking level itself still can', () => {
    const standards = {
      world: lv({ titleText: 'NOTICE' }, ['titleText']),
      'world/kenya': lv({ titleText: 'KENYA', fontFace: 'Arial' }),
    };
    const e = effective(standards, 'world/kenya');
    expect(e.value.titleText).toBe('NOTICE');
    expect(e.value.fontFace).toBe('Arial');
    expect(e.locked.titleText).toBe('world');
    expect(effective(standards, 'world').value.titleText).toBe('NOTICE');
  });
  it('ignores unknown settings instead of breaking', () => {
    const e = effective({ world: lv({ nonsense: 1 } as never) }, 'world');
    expect((e.value as unknown as Record<string, unknown>).nonsense).toBeUndefined();
  });
});
