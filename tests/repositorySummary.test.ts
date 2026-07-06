import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  collectRepositoryContext,
  createRepositorySummaryProvider,
} from '../src/services/repositorySummary';

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

function createFakeGitLabClient() {
  return {
    async getProject() {
      return { name: 'Demo App', description: 'Issue helper', default_branch: 'main' };
    },
    async getRepositoryLanguages() {
      return { TypeScript: 82, CSS: 18 };
    },
    async getRepositoryTree() {
      return [
        { type: 'blob', path: 'package.json' },
        { type: 'blob', path: 'README.md' },
        { type: 'tree', path: 'src' },
        { type: 'blob', path: 'src/app.ts' },
      ];
    },
    async getRepositoryFile(_projectId: string | number, filePath: string) {
      if (filePath === 'package.json') {
        return '{"scripts":{"dev":"tsx watch src/server.ts","test":"tsx --test tests/**/*.test.ts"}}';
      }
      if (filePath === 'README.md') {
        return '# Demo App';
      }
      return null;
    },
  };
}

async function writeFakeRepoSummaryOpencode(binDir: string, outputMode: 'markdown' | 'json' = 'markdown'): Promise<void> {
  const commandName = process.platform === 'win32' ? 'opencode.cmd' : 'opencode';
  const commandPath = path.join(binDir, commandName);
  const scriptPath = path.join(binDir, 'fake-opencode.mjs');
  const summary = [
    '## Technology Stack',
    '- TypeScript service',
    '',
    '## Project Structure',
    '- src contains the service code',
  ].join('\n');
  const output = outputMode === 'json'
    ? JSON.stringify({ type: 'message', text: summary })
    : summary;

  await fs.writeFile(
    scriptPath,
    [
      'const args = process.argv.slice(2);',
      "const fileIndex = args.indexOf('--file');",
      "const promptIndex = args.findIndex((arg) => arg === 'Produce' || arg.startsWith('Produce the repository summary'));",
      'if (fileIndex !== -1 && promptIndex > fileIndex) {',
      "  console.error(`Error: File not found: ${args[promptIndex]}`);",
      '  process.exit(1);',
      '}',
      `console.log(${JSON.stringify(output)});`,
      '',
    ].join('\n'),
    'utf8'
  );

  if (process.platform === 'win32') {
    await fs.writeFile(
      commandPath,
      `@"${process.execPath}" "%~dp0fake-opencode.mjs" %*\r\n`,
      'utf8'
    );
  } else {
    await fs.writeFile(
      commandPath,
      ['#!/bin/sh', `exec "${process.execPath}" "$(dirname "$0")/fake-opencode.mjs" "$@"`, ''].join('\n'),
      'utf8'
    );
    await fs.chmod(commandPath, 0o755);
  }
}

describe('Repository summary service', () => {
  it('collects repository metadata, file tree, languages, and key files', async () => {
    const context = await collectRepositoryContext(123, createFakeGitLabClient());

    assert.match(context, /Project name: Demo App/);
    assert.match(context, /Project description: Issue helper/);
    assert.match(context, /Default branch: main/);
    assert.match(context, /Languages: TypeScript 82%, CSS 18%/);
    assert.match(context, /src\//);
    assert.match(context, /=== package\.json ===/);
    assert.match(context, /tsx watch src\/server\.ts/);
  });

  it('generates and caches a summary per project', async () => {
    let summarizeCalls = 0;
    const provider = createRepositorySummaryProvider({
      gitlab: createFakeGitLabClient(),
      summarizeRepositoryContext: async (context) => {
        summarizeCalls++;
        assert.match(context, /Project name: Demo App/);
        return '## Technology Stack\n- TypeScript service';
      },
      persistSummary: async () => undefined,
    });

    const first = await provider.ensureRepositorySummary(123);
    const second = await provider.ensureRepositorySummary(123);

    assert.equal(first, '## Technology Stack\n- TypeScript service');
    assert.equal(second, '## Technology Stack\n- TypeScript service');
    assert.equal(summarizeCalls, 1);
  });

  it('passes the repository summary prompt before the attached context file', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dev-assist-repo-summary-'));
    const binDir = path.join(tempDir, 'bin');
    const appDataDir = path.join(tempDir, 'appdata');
    await fs.mkdir(binDir, { recursive: true });
    await fs.mkdir(appDataDir, { recursive: true });
    await writeFakeRepoSummaryOpencode(binDir);

    process.env.AI_PROVIDER = 'opencode';
    process.env.AI_MODEL = 'xai/test-model';
    process.env.AI_TIMEOUT_MS = '5000';
    process.env.APPDATA = appDataDir;
    process.env.PATH = `${binDir}${path.delimiter}${originalEnv.PATH || ''}`;

    const provider = createRepositorySummaryProvider({
      gitlab: createFakeGitLabClient(),
      persistSummary: async () => undefined,
    });

    const summary = await provider.ensureRepositorySummary(123);

    assert.equal(summary, '## Technology Stack\n- TypeScript service\n\n## Project Structure\n- src contains the service code');
  });

  it('extracts Markdown summary text from JSON-formatted opencode output', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dev-assist-repo-summary-'));
    const binDir = path.join(tempDir, 'bin');
    const appDataDir = path.join(tempDir, 'appdata');
    await fs.mkdir(binDir, { recursive: true });
    await fs.mkdir(appDataDir, { recursive: true });
    await writeFakeRepoSummaryOpencode(binDir, 'json');

    process.env.AI_PROVIDER = 'opencode';
    process.env.AI_MODEL = 'xai/test-model';
    process.env.AI_TIMEOUT_MS = '5000';
    process.env.APPDATA = appDataDir;
    process.env.PATH = `${binDir}${path.delimiter}${originalEnv.PATH || ''}`;

    const provider = createRepositorySummaryProvider({
      gitlab: createFakeGitLabClient(),
      persistSummary: async () => undefined,
    });

    const summary = await provider.ensureRepositorySummary(123);

    assert.equal(summary, '## Technology Stack\n- TypeScript service\n\n## Project Structure\n- src contains the service code');
  });
});
