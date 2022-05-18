// @ts-check
// eslint-disable-next-line import/no-extraneous-dependencies
import { test } from '@agoric/zoe/tools/prepare-test-env-ava.js';

import { E } from '@endo/eventual-send';
import { provide } from '@agoric/store';
import {
  makeKindHandle,
  makeScalarBigMapStore,
  defineDurableKind,
} from '@agoric/vat-data';

import buildManualTimer from '../../tools/manualTimer.js';

test('manualTimer makeNotifier', async t => {
  const manualTimer = buildManualTimer(t.log, 0n);
  const notifier = await E(manualTimer).makeNotifier(1n, 1n);
  await manualTimer.tick();
  const update1 = await E(notifier).getUpdateSince();
  t.is(update1.updateCount, 2);
  await manualTimer.tick();
  const update2 = await E(notifier).getUpdateSince(update1.updateCount);
  t.is(update2.updateCount, 3);
  t.truthy(update2.value > update1.value);
});

const baggage = makeScalarBigMapStore('TestHandler', { durable: true });
const testHandlerHandle = provide(baggage, 'TestHandlerKindHandle', () =>
  makeKindHandle('TestHandler'),
);
const makeHandler = defineDurableKind(
  testHandlerHandle,
  () => ({ calls: 0n, args: harden([]) }),
  {
    getCalls: ({ state }) => {
      return state.calls;
    },
    getArgs: ({ state }) => {
      return state.args;
    },
    wake: ({ state }, arg) => {
      state.args = harden([...state.args, arg]);
      state.calls += 1n;
    },
  },
);

test('manualTimer makeRepeater', async t => {
  const manualTimer = buildManualTimer(t.log, 0n);
  const timestamp = await E(manualTimer).getCurrentTimestamp();
  const repeater = E(manualTimer).makeRepeater(1n, 1n);
  const handler = makeHandler();
  await E(repeater).schedule(handler);
  await manualTimer.tick();

  t.is(handler.getCalls(), 1n);
  t.truthy(handler.getArgs()[0] > timestamp);
});
