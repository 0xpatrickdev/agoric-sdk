// @ts-check
// eslint-disable-next-line import/no-extraneous-dependencies
import { test } from '@agoric/swingset-vat/tools/prepare-test-env-ava.js';

// eslint-disable-next-line import/no-extraneous-dependencies
import { loadBasedir, buildVatController } from '@agoric/swingset-vat';

const main = async argv => {
  const basedir = 'ertpService';
  const dir = new URL(`../${basedir}`, import.meta.url).pathname;
  const config = await loadBasedir(dir);
  // config.defaultManagerType = 'xs-worker';
  const controller = await buildVatController(config, argv);
  await controller.run();
  return controller.dump();
};

const ertpServiceExpectation = [
  'started ERTP Service',
  'Issuer: [object Alleged: Doubloons issuer]',
  'brand: [object Alleged: Doubloons brand]',
  'mint: [object Alleged: Doubloons mint]',
];

test('test ertpService', async t => {
  const dump = await main(['ertpService']);
  t.deepEqual(dump.log, ertpServiceExpectation);
});

const multipleIssuersExpectation = [
  'started ERTP Service',
  'Purse 0 has 0',
  'Purse 1 has 1',
  'Purse 2 has 2',
  'Purse 3 has 3',
  'Purse 4 has 4',
  'Purse 5 has 5',
  'Purse 6 has 6',
  'Purse 7 has 7',
  'Purse 8 has 8',
  'Purse 9 has 9',
];

test('test multiple issuers', async t => {
  const dump = await main(['multipleIssuers']);
  t.deepEqual(dump.log, multipleIssuersExpectation);
});
