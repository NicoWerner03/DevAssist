import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createAiService } from '../src/services/ai/service';

const originalEnv = {
  AI_PROVIDER: process.env.AI_PROVIDER,
  AI_MODEL: process.env.AI_MODEL,
  AI_TIMEOUT_MS: process.env.AI_TIMEOUT_MS,
  APPDATA: process.env.APPDATA,
  PATH: process.env.PATH,
};

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

function analysisJson(): string {
  return JSON.stringify({
    title: 'Analyze via export fallback',
    description: ['Parse the exported OpenCode session when the JSON stream has no final text.'],
    acceptanceCriteria: [],
    technicalContext: [],
    proposedSolution: [],
    openQuestions: [],
  });
}

async function writeFakeOpencode(binDir: string): Promise<void> {
  const commandName = process.platform === 'win32' ? 'opencode.cmd' : 'opencode';
  const commandPath = path.join(binDir, commandName);
  const exportedAnalysis = analysisJson();

  if (process.platform === 'win32') {
    await fs.writeFile(
      commandPath,
      [
        '@echo off',
        'if "%~1"=="run" (',
        '  echo {"type":"step_start","sessionID":"ses_test"}',
        '  exit /b 0',
        ')',
        'if "%~1"=="export" (',
        `  echo ${exportedAnalysis}`,
        '  exit /b 0',
        ')',
        'exit /b 1',
        '',
      ].join('\r\n'),
      'utf8'
    );
  } else {
    await fs.writeFile(
      commandPath,
      [
        '#!/bin/sh',
        'if [ "$1" = "run" ]; then',
        '  printf \'%s\\n\' \'{"type":"step_start","sessionID":"ses_test"}\'',
        '  exit 0',
        'fi',
        'if [ "$1" = "export" ]; then',
        `  printf '%s\\n' '${exportedAnalysis}'`,
        '  exit 0',
        'fi',
        'exit 1',
        '',
      ].join('\n'),
      'utf8'
    );
    await fs.chmod(commandPath, 0o755);
  }
}

describe('OpenCode AI service', () => {
  it('parses analysis from exported session output when the JSON stream has no final text', async () => {
    const warnings: Error[] = [];
    const captureWarning = (warning: Error) => warnings.push(warning);
    process.on('warning', captureWarning);

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dev-assist-opencode-'));
    const binDir = path.join(tempDir, 'bin');
    const appDataDir = path.join(tempDir, 'appdata');
    await fs.mkdir(binDir, { recursive: true });
    await fs.mkdir(appDataDir, { recursive: true });
    await writeFakeOpencode(binDir);

    process.env.AI_PROVIDER = 'opencode';
    process.env.AI_MODEL = 'xai/test-model';
    process.env.AI_TIMEOUT_MS = '5000';
    process.env.APPDATA = appDataDir;
    process.env.PATH = `${binDir}${path.delimiter}${originalEnv.PATH || ''}`;

    try {
      const analysis = await createAiService().analyzeTicket({
        issue: {
          title: 'Need export fallback',
          description: '@dev-assist Please analyze this.',
        },
      });

      await new Promise<void>((resolve) => setImmediate(resolve));
      assert.deepEqual(analysis.description, [
        'Parse the exported OpenCode session when the JSON stream has no final text.',
      ]);
      assert.equal(analysis.title, 'Analyze via export fallback');
      assert.equal(
        warnings.some((warning: NodeJS.ErrnoException) => warning.code === 'DEP0190'),
        false,
        'OpenCode execution must not use shell: true with an argument array',
      );
    } finally {
      process.off('warning', captureWarning);
    }
  });
});
