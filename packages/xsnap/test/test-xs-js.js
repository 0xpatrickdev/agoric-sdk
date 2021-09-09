// JavaScript correctness tests

// @ts-check
// eslint-disable-next-line import/no-extraneous-dependencies
import test from 'ava';
import * as proc from 'child_process';
import * as os from 'os';
import { xsnap } from '../src/xsnap.js';
import { options } from './message-tools.js';

const io = { spawn: proc.spawn, os: os.type() }; // WARNING: ambient

test('reject odd regex range', async t => {
  const opts = options(io);
  const vat = xsnap(opts);
  await vat
    .evaluate(
      `const FILENAME_FILTER = /^((?:.*[( ])?)[:/\\w-_]*\\/(packages\\/.+)$/;`,
    )
    .then(_ => {
      t.fail('should throw');
    })
    .catch(_ => {
      t.pass();
    });
  await vat.terminate();
});

test('accept std regex range', async t => {
  const opts = options(io);
  const vat = xsnap(opts);
  await vat.evaluate(
    `const FILENAME_FILTER = /^((?:.*[( ])?)[:/\\w_-]*\\/(packages\\/.+)$/;`,
  );
  t.pass();
  await vat.terminate();
});

test('simple TextEncoder / TextDecoder are available', async t => {
  const opts = options(io);
  const vat = xsnap(opts);
  t.teardown(() => vat.terminate());
  await vat.evaluate(`
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const send = it => issueCommand(encoder.encode(JSON.stringify(it)).buffer);
    send("Hello! 😊")
    send(decoder.decode(new Uint8Array([65, 0, 65]).buffer));
  `);
  t.deepEqual(opts.messages, ['"Hello! 😊"', '"A\\u0000A"']);
});

test('bigint map key', async t => {
  const opts = options(io);
  const vat = xsnap(opts);
  t.teardown(() => vat.terminate());
  await vat.evaluate(`
    const encoder = new TextEncoder();
    const send = it => issueCommand(encoder.encode(JSON.stringify(it)).buffer);
    const store = new Map([[1n, "abc"]]);
    send(store.get(1n))
  `);
  t.deepEqual(opts.messages, ['"abc"']);
});

test('bigint toString', async t => {
  const opts = options(io);
  const vat = xsnap(opts);
  t.teardown(() => vat.terminate());
  await vat.evaluate(`
    const encoder = new TextEncoder();
    const send = it => issueCommand(encoder.encode(JSON.stringify(it)).buffer);
    const txt = \`number: 1 2 3 bigint: \${0n} \${1n} \${BigInt(2)} \${BigInt(3)} .\`;
    send(txt)
  `);
  t.deepEqual(opts.messages, ['"number: 1 2 3 bigint: 0 1 2 3 ."']);
});

test('keyword in destructuring', async t => {
  const opts = options(io);
  const vat = xsnap(opts);
  t.teardown(() => vat.terminate());
  await vat.evaluate(`
    const encoder = new TextEncoder();
    const send = it => issueCommand(encoder.encode(JSON.stringify(it)).buffer);
    const { default: d, in: i } = { default: 1, in: 2 };
    send({ d, i })
  `);
  t.deepEqual(opts.messages, ['{"d":1,"i":2}']);
});
