import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('player genesis errors', () => {
  it('renders a failed creation message in the genesis screen', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'src', 'components', 'player', 'PlayerGameShell.tsx'), 'utf8');
    expect(source).toContain('error={error}');
    expect(source).toContain('role="alert"');
  });
});
