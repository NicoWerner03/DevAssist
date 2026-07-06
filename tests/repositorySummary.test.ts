import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  collectRepositoryContext,
  createRepositorySummaryProvider,
} from '../src/services/repositorySummary';

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
});
