// @ts-check
/* eslint-env node */

import '@endo/init/debug.js';

import * as http from 'http';
import test from 'ava';
import { Slip10RawIndex } from '@cosmjs/crypto';

import { makeJsonHttpClient } from '../src/json-http-client-node.js';
import {
  makeBundlePublisher,
  makeHttpBundlePublisher,
  hdPath,
  Agoric,
} from '../src/publish.js';

/** @type {import('../src/publish.js').EndoZipBase64Bundle} */
const bundle = {
  moduleFormat: 'endoZipBase64',
  endoZipBase64: '',
  endoZipBase64Sha512:
    '55555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555',
};

test('fake publish bundle ok', async t => {
  const publishBundle = makeBundlePublisher({
    publishBundleHttp: makeHttpBundlePublisher({
      async getAccessToken() {
        return 'TO KEN';
      },
      async jsonHttpCall({ hostname, port, path }, receivedBundle) {
        t.is(hostname, 'localhost');
        t.is(port, 8080);
        t.is(path, '/publish-bundle?accessToken=TO%20KEN');
        // @ts-expect-error unknown
        t.is(bundle, receivedBundle);
        return { ok: true };
      },
    }),
  });

  const response = await publishBundle(bundle, {
    type: 'http',
    host: 'localhost',
    port: 8080,
  });

  t.deepEqual(response, {
    moduleFormat: 'endoZipBase64Sha512',
    endoZipBase64Sha512:
      '55555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555',
  });
});

test('fake publish bundle not ok invalid connection type', async t => {
  const publishBundle = makeBundlePublisher({
    publishBundleHttp: makeHttpBundlePublisher({
      async getAccessToken() {
        t.fail();
        return '';
      },
      async jsonHttpCall() {
        t.fail();
      },
    }),
  });

  await t.throwsAsync(
    publishBundle(bundle, {
      // @ts-expect-error
      type: 'bogus',
    }),
  );
});

test('fake publish bundle not ok invalid HTTP connection spec non-string host', async t => {
  const publishBundle = makeBundlePublisher({
    publishBundleHttp: makeHttpBundlePublisher({
      async getAccessToken() {
        t.fail();
        return '';
      },
      async jsonHttpCall() {
        t.fail();
      },
    }),
  });

  await t.throwsAsync(
    publishBundle(bundle, {
      type: 'http',
      // @ts-expect-error
      host: 1,
      port: 8080,
    }),
  );
});

test('fake publish bundle not ok invalid HTTP connection spec non-integer port', async t => {
  const publishBundle = makeBundlePublisher({
    publishBundleHttp: makeHttpBundlePublisher({
      async getAccessToken() {
        t.fail();
        return '';
      },
      async jsonHttpCall() {
        t.fail();
      },
    }),
  });

  await t.throwsAsync(
    publishBundle(bundle, {
      type: 'http',
      host: 'localhost',
      port: 1.5,
    }),
  );
});

test('fake publish bundle not ok response', async t => {
  const publishBundle = makeBundlePublisher({
    publishBundleHttp: makeHttpBundlePublisher({
      async getAccessToken() {
        return 'TOKEN';
      },
      async jsonHttpCall() {
        return { ok: false, rej: 'fake' };
      },
    }),
  });

  await t.throwsAsync(
    publishBundle(bundle, {
      type: 'http',
      host: 'localhost',
      port: 8080,
    }),
    {
      message: /fake/,
    },
  );
});

test('publish bundle with fake HTTP server ok', async t => {
  const jsonHttpCall = makeJsonHttpClient({ http });

  const publishBundle = makeBundlePublisher({
    publishBundleHttp: makeHttpBundlePublisher({
      async getAccessToken() {
        return 'TOKEN';
      },
      jsonHttpCall,
    }),
  });

  const server = http.createServer((req, res) => {
    (async () => {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const requestBytes = Buffer.concat(chunks);
      const requestText = new TextDecoder().decode(requestBytes);
      const request = JSON.parse(requestText);
      t.deepEqual(bundle, request);
      res.end('{"ok": true}');
    })().catch(error => {
      t.fail(error);
    });
  });

  await new Promise(resolve => {
    server.listen(0, () => resolve(undefined));
  });

  const address = server.address();
  assert.typeof(address, 'object');
  assert(address);
  const { port } = address;

  await t.notThrowsAsync(
    publishBundle(bundle, {
      type: 'http',
      host: 'localhost',
      port,
    }),
  );
});

test('hdPath should resolve to supported derivations', t => {
  // 'm/44'/564'/0'/0/1`
  const accountIndex = 1;
  const slip10HdPath = hdPath(Agoric.CoinType, accountIndex);
  t.deepEqual(
    slip10HdPath[0],
    Slip10RawIndex.hardened(44),
    "hdPath should contain m44'",
  );
  t.deepEqual(
    slip10HdPath[1],
    Slip10RawIndex.hardened(564),
    "coinType should be 564' for Agoric",
  );
  t.deepEqual(
    slip10HdPath[2],
    Slip10RawIndex.hardened(0),
    "account path should always be 0'",
  );
  t.deepEqual(
    slip10HdPath[3],
    Slip10RawIndex.normal(0),
    'change path should always be 0',
  );
  t.deepEqual(
    slip10HdPath[4],
    Slip10RawIndex.normal(accountIndex),
    'accountIndex should determine address index path',
  );
  // 'm/44'/118'/0'/0/0`
  const cosmosSlip10HdPath = hdPath();
  t.deepEqual(
    cosmosSlip10HdPath[1],
    Slip10RawIndex.hardened(118),
    "coinType should be 118' for Cosmos",
  );
  t.deepEqual(
    cosmosSlip10HdPath[4],
    Slip10RawIndex.normal(0),
    'accountIndex should determine address index path',
  );
});
