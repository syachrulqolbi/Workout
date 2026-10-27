import { existsSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolvePath(import.meta.dirname, '..');

export async function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith('@/')) return nextResolve(specifier, context);
  const base = resolvePath(root, specifier.slice(2));
  const candidate = ['', '.ts', '.tsx', '.mjs', '.js'].map((extension) => `${base}${extension}`).find(existsSync);
  if (!candidate) return nextResolve(specifier, context);
  return { url: pathToFileURL(candidate).href, shortCircuit: true };
}
