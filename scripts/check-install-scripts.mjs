import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';

const root = process.cwd();
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const allow = pkg.lavamoat?.allowScripts ?? {};
/** Last segment of a LavaMoat key. `false` still counts as reviewed. */
const known = new Set(
  Object.keys(allow)
    .filter(name => name !== '$root$')
    .map(name => name.split('#')[0].split('>').at(-1)),
);

const nm = join(root, 'node_modules');
const violations = [];

const inspect = (dir, name) => {
  try {
    const p = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    const s = p.scripts || {};
    if ((s.postinstall || s.preinstall || s.install) && !known.has(name)) {
      violations.push({pkg: name, scripts: s});
    }
  } catch {
    /* missing or unreadable package.json */
  }
};

for (const entry of readdirSync(nm, {withFileTypes: true})) {
  if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
  if (entry.name.startsWith('@')) {
    const scope = join(nm, entry.name);
    for (const sub of readdirSync(scope, {withFileTypes: true})) {
      if (!sub.isDirectory()) continue;
      inspect(join(scope, sub.name), `${entry.name}/${sub.name}`);
    }
  } else {
    inspect(join(nm, entry.name), entry.name);
  }
}

if (violations.length > 0) {
  console.error('UNEXPECTED INSTALL SCRIPTS DETECTED:');
  console.error(JSON.stringify(violations, null, 2));
  process.exit(1);
}

console.log('All install scripts are from known-safe packages.');
