import * as assert from 'assert';
import { debouncePerKey } from './debounce';

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

suite('debouncePerKey', () => {
  test('calls fn once after the delay when called once', async () => {
    let calls = 0;
    const debounced = debouncePerKey(
      (_key: string) => {
        calls++;
      },
      20,
      (key: string) => key
    );
    debounced('a');
    assert.strictEqual(calls, 0);
    await wait(40);
    assert.strictEqual(calls, 1);
  });

  test('collapses multiple rapid calls with the same key into one, using the last call\'s arguments', async () => {
    let calls = 0;
    let lastArg = '';
    const debounced = debouncePerKey(
      (_key: string, value: string) => {
        calls++;
        lastArg = value;
      },
      20,
      (key: string) => key
    );
    debounced('a', 'first');
    debounced('a', 'second');
    debounced('a', 'third');
    await wait(40);
    assert.strictEqual(calls, 1);
    assert.strictEqual(lastArg, 'third');
  });

  test('does not collapse calls with different keys', async () => {
    let calls = 0;
    const debounced = debouncePerKey(
      (_key: string) => {
        calls++;
      },
      20,
      (key: string) => key
    );
    debounced('a');
    debounced('b');
    await wait(40);
    assert.strictEqual(calls, 2);
  });

  test('resets the timer on each call with the same key', async () => {
    let calls = 0;
    const debounced = debouncePerKey(
      (_key: string) => {
        calls++;
      },
      20,
      (key: string) => key
    );
    debounced('a');
    await wait(10);
    debounced('a'); // resets the 20ms window before it fires
    await wait(15);
    assert.strictEqual(calls, 0);
    await wait(10);
    assert.strictEqual(calls, 1);
  });
});
