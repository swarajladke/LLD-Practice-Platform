import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const domainDir = path.resolve(currentDir, '../../src/domain');

  const forbiddenImportPatterns = [
    // Static imports/exports
    /(?:from|export\s+(?:.*)\s+from)\s+['"]express['"]/,
    /(?:from|export\s+(?:.*)\s+from)\s+['"]react['"]/,
    /(?:from|export\s+(?:.*)\s+from)\s+['"]react-dom['"]/,
    /(?:from|export\s+(?:.*)\s+from)\s+['"]better-sqlite3['"]/,
    /(?:from|export\s+(?:.*)\s+from)\s+['"]sqlite3['"]/,
    /(?:from|export\s+(?:.*)\s+from)\s+['"]vite['"]/,
    /(?:from|export\s+(?:.*)\s+from)\s+['"]fs['"]/,
    /(?:from|export\s+(?:.*)\s+from)\s+['"]node:fs['"]/,
    /(?:from|export\s+(?:.*)\s+from)\s+['"].*\/application\/.*['"]/,
    /(?:from|export\s+(?:.*)\s+from)\s+['"].*\/infrastructure\/.*['"]/,
    /(?:from|export\s+(?:.*)\s+from)\s+['"].*\/web\/.*['"]/,
    // CommonJS require
    /require\(\s*['"](?:express|react|better-sqlite3|sqlite3|vite|fs|node:fs|.*\/application\/.*|.*\/infrastructure\/.*|.*\/web\/.*)['"]\s*\)/,
    // Dynamic import
    /import\(\s*['"](?:express|react|better-sqlite3|sqlite3|vite|fs|node:fs|.*\/application\/.*|.*\/infrastructure\/.*|.*\/web\/.*)['"]\s*\)/,
  ];

  it('asserts domain layer has zero outward imports (inward-pointing clean architecture)', () => {
    const domainFiles = getFilesRecursively(domainDir);
    expect(domainFiles.length).toBeGreaterThan(0);

    const violations: Array<{ file: string; match: string }> = [];

    for (const file of domainFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      for (const pattern of forbiddenImportPatterns) {
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
