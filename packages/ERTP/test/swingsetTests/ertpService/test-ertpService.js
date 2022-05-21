// @ts-check
// eslint-disable-next-line import/no-extraneous-dependencies
import { test } from '@agoric/swingset-vat/tools/prepare-test-env-ava.js';

// eslint-disable-next-line import/no-extraneous-dependencies
import { loadBasedir, buildVatController } from '@agoric/swingset-vat';

const main = async (basedir, argv) => {
  const dir = new URL(`../${basedir}`, import.meta.url).pathname;
  const config = await loadBasedir(dir);
  // config.defaultManagerType = 'xs-worker';
  const controller = await buildVatController(config, argv);
  await controller.run();
  return controller.dump();
};

const expected = [
  'started ERTP Service',
  'Issuer: [object Alleged: Doubloons issuer]',
  'brand: [object Alleged: Doubloons brand]',
  'mint: [object Alleged: Doubloons mint]',
];

test('test splitPayments', async t => {
  const dump = await main('ertpService', ['ertpService']);
  t.deepEqual(dump.log, expected);
});
