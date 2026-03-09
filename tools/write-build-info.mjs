import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

function readGit(command, fallback) {
  try {
    return execSync(command, { encoding: 'utf8' }).trim() || fallback;
  } catch {
    return fallback;
  }
}

const buildInfo = {
  commit: readGit('git rev-parse --short HEAD', 'unknown'),
  branch: readGit('git rev-parse --abbrev-ref HEAD', 'unknown'),
  builtAt: new Date().toISOString(),
};

writeFileSync(
  'public/build-info.js',
  `window.RDDBuildInfo = ${JSON.stringify(buildInfo)};\n`,
  'utf8'
);
