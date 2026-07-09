import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  collectStrings,
  getEffectiveModel,
  runCommand,
  stripAnsi,
} from '../src/services/ai/opencodeRuntime';

describe('OpenCode runtime helpers', () => {
  it('normalizes shared OpenCode values', () => {
    assert.equal(stripAnsi('\u001b[32mready\u001b[0m'), 'ready');
    assert.deepEqual(collectStrings({ message: ['one', { text: 'two' }] }), ['one', 'two']);
    assert.equal(getEffectiveModel(undefined), 'xai/grok-3-latest');
    assert.equal(getEffectiveModel('grok-3-latest'), 'xai/grok-3-latest');
    assert.equal(getEffectiveModel('openai/gpt-5'), 'openai/gpt-5');
  });

  it('captures command output and exit code', async () => {
    const result = await runCommand(process.execPath, ['-e', 'console.log("ok")'], {
      timeoutMs: 5000,
    });

    assert.equal(result.stdout.trim(), 'ok');
    assert.equal(result.stderr, '');
    assert.equal(result.code, 0);
  });
});
