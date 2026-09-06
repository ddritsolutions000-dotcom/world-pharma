import fs from 'fs';
import path from 'path';

const root = path.join('apps', 'web-admin', 'src');
const skip = new Set(['admin-http.ts']);

function walk(dir, files = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, files);
    else if (/\.(tsx?|ts)$/.test(ent.name)) files.push(p);
  }
  return files;
}

function ensureImport(src) {
  if (!src.includes('adminAuthHeaders(')) return src;
  if (src.includes('adminAuthHeaders')) {
    const m = src.match(/import \{([^}]+)\} from '\.\/admin-http'/);
    if (m && !m[1].includes('adminAuthHeaders')) {
      return src.replace(
        /import \{([^}]+)\} from '\.\/admin-http'/,
        (_, imp) => `import { ${imp.trim()}, adminAuthHeaders } from './admin-http'`,
      );
    }
    return src;
  }
  return `import { adminAuthHeaders } from './admin-http';\n${src}`;
}

function addCredentials(src) {
  return src.replace(/fetch\(\`\$\{[^}]+\}\`\$\{[^}]+\}\`, \{([^}]*)\}\)/g, (full, inner) => {
    if (inner.includes('credentials')) return full;
    return full.replace('{', "{ credentials: 'include', ");
  });
}

let changed = 0;
for (const file of walk(root)) {
  if (skip.has(path.basename(file))) continue;
  let src = fs.readFileSync(file, 'utf8');
  if (!src.includes('Bearer ${token}')) continue;
  const orig = src;

  src = src.replace(/headers:\s*\{\s*Authorization:\s*`Bearer \$\{token\}`\s*\}/g, 'headers: adminAuthHeaders(token)');
  src = src.replace(
    /headers:\s*\{\s*Authorization:\s*`Bearer \$\{token\}`,\s*'Content-Type':\s*'application\/json'\s*\}/g,
    "headers: adminAuthHeaders(token, { 'Content-Type': 'application/json' })",
  );
  src = src.replace(
    /headers:\s*\{\s*'Content-Type':\s*'application\/json',\s*Authorization:\s*`Bearer \$\{token\}`\s*\}/g,
    "headers: adminAuthHeaders(token, { 'Content-Type': 'application/json' })",
  );
  src = src.replace(
    /headers:\s*\{\s*Accept:\s*'application\/json',\s*Authorization:\s*`Bearer \$\{token\}`\s*\}/g,
    'headers: adminAuthHeaders(token)',
  );
  src = src.replace(
    /headers:\s*\{\s*Authorization:\s*`Bearer \$\{token\}`,\s*Accept:\s*'application\/json'\s*\}/g,
    'headers: adminAuthHeaders(token)',
  );
  src = src.replace(/const headers = \{\s*Authorization:\s*`Bearer \$\{token\}`\s*\};/g, 'const headers = adminAuthHeaders(token);');
  src = src.replace(/\s*Authorization:\s*`Bearer \$\{token\}`,/g, '');
  src = src.replace(/headers\.set\('Authorization', `Bearer \$\{token\}`\);\n?/g, '');

  if (src !== orig) {
    src = ensureImport(src);
    src = addCredentials(src);
    fs.writeFileSync(file, src);
    changed++;
    console.log('updated', file);
  }
}
console.log('total', changed);
