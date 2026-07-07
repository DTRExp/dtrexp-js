import { SPEC_DRAFT } from '../src/index.js';

describe('dtre-js', () => {
  it('targets DTRE spec draft 2', () => {
    expect(SPEC_DRAFT).toBe(2);
  });
});
