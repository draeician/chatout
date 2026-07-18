#!/usr/bin/env node
import { readFile, writeFile, mkdir, access, copyFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const outputManifestPath = path.join(repoRoot, 'scripts/extension-output-manifest.json');

const importPattern = /(?:import|export)\s+(?:[^'";]*?\s+from\s+)?["']([^"']+)["']/g;

const resolveCandidatePaths = (importPath, baseDir) => {
  const raw = path.resolve(baseDir, importPath);
  return [
    raw,
    `${raw}.js`,
    `${raw}.mjs`,
    `${raw}.ts`,
    path.join(raw, 'index.js'),
    path.join(raw, 'index.ts')
  ];
};

const assertFileExists = async (filePath, message) => {
  try {
    await access(filePath);
  } catch {
    throw new Error(message);
  }
};

const validateImports = async (sourcePath) => {
  const text = await readFile(sourcePath, 'utf8');
  const baseDir = path.dirname(sourcePath);

  for (const match of text.matchAll(importPattern)) {
    const importPath = match[1];
    if (!importPath.startsWith('.')) {
      continue;
    }

    const candidates = resolveCandidatePaths(importPath, baseDir);
    let resolved = false;
    for (const candidate of candidates) {
      try {
        await access(candidate);
        resolved = true;
        break;
      } catch {
        // continue looking
      }
    }

    if (!resolved) {
      throw new Error(`Unresolved import \"${importPath}\" in ${path.relative(repoRoot, sourcePath)}`);
    }
  }
};

const updateManifest = async () => {
  const manifestPath = path.join(repoRoot, 'manifest.json');
  const raw = await readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(raw);

  manifest.background = manifest.background || {};
  manifest.background.service_worker = 'background.js';

  if (Array.isArray(manifest.content_scripts)) {
    manifest.content_scripts = manifest.content_scripts.map((scriptDef) => {
      if (!Array.isArray(scriptDef.js)) {
        return scriptDef;
      }

      const js = scriptDef.js.map((value) => {
        if (value.endsWith('/content.js') || value === 'content.js') {
          return 'content-scripts/content.js';
        }
        if (value.endsWith('/start.js') || value === 'start.js') {
          return 'content-scripts/start.js';
        }
        if (value.endsWith('/config.js') || value === 'config.js') {
          return 'content-scripts/config.js';
        }
        return value;
      });

      return { ...scriptDef, js };
    });
  }

  if (process.env.EXTENSION_VERSION) {
    manifest.version = process.env.EXTENSION_VERSION;
  }

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 3)}\n`, 'utf8');
};

const main = async () => {
  await assertFileExists(outputManifestPath, 'Missing scripts/extension-output-manifest.json');
  const mapRaw = await readFile(outputManifestPath, 'utf8');
  const outputManifest = JSON.parse(mapRaw);

  for (const [outputRelative, sourceRelative] of Object.entries(outputManifest)) {
    const sourcePath = path.join(repoRoot, sourceRelative);
    const outputPath = path.join(repoRoot, outputRelative);

    await assertFileExists(
      sourcePath,
      `Missing source entrypoint for ${outputRelative}: ${sourceRelative}`
    );
    await validateImports(sourcePath);

    await mkdir(path.dirname(outputPath), { recursive: true });
    await copyFile(sourcePath, outputPath);

    await assertFileExists(
      outputPath,
      `Failed to write expected output file: ${outputRelative}`
    );
  }

  await updateManifest();
  console.log(`Built ${Object.keys(outputManifest).length} extension artifacts from src/.`);
};

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
