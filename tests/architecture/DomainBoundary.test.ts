import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

function getFilesRecursively(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getFilesRecursively(fullPath));
    } else if (entry.name.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('Domain Layer Architecture Boundary', () => {
  const domainDir = path.resolve(__dirname, '../../src/domain');
  const forbiddenPatterns = [
    /from\s+['"]express['"]/,
    /from\s+['"]react['"]/,
    /from\s+['"]react-dom['"]/,
    /from\s+['"]better-sqlite3['"]/,
    /from\s+['"]sqlite3['"]/,
    /from\s+['"]vite['"]/,
    /from\s+['"].*\/application\/.*['"]/,
    /from\s+['"].*\/infrastructure\/.*['"]/,
    /from\s+['"].*\/web\/.*['"]/,
  ];

  it('asserts domain layer has zero outward imports (inward-pointing clean architecture)', () => {
    const domainFiles = getFilesRecursively(domainDir);
    expect(domainFiles.length).toBeGreaterThan(0);

    const violations: Array<{ file: string; match: string }> = [];

    for (const file of domainFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      for (const pattern of forbiddenPatterns) {
        const match = content.match(pattern);
        if (match) {
          violations.push({
            file: path.relative(domainDir, file),
            match: match[0],
          });
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
