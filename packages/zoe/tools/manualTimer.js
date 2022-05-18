// @ts-check

import { E } from '@endo/eventual-send';
import { provide } from '@agoric/store';
import { Nat } from '@agoric/nat';
import {
  defineDurableKindMulti,
  makeKindHandle,
  makeScalarBigMapStore,
  provideDurableSingleton,
  defineDurableKind,
} from '@agoric/vat-data';

import './types.js';
import './internal-types.js';
import { makeNotifierKit } from '@agoric/notifier';
import { makePromiseKit } from '@endo/promise-kit';

const { details: X } = assert;
/**
 * A fake clock that also logs progress.
 *
 * @param {(...args: any[]) => void} log
 * @param {Timestamp} [startValue=0n]
 * @param {RelativeTime} [timeStep=1n]
 * @param {MapStore<string, any>} timerBaggage
 * @returns {ManualTimer}
 */
const buildManualTimer = (
  log,
  startValue = 0n,
  timeStep = 1n,
  timerBaggage = makeScalarBigMapStore('ManualTimer', { durable: true }),
) => {
  let ticks = Nat(startValue);

  /** @type {MapStore<Timestamp, ERef<TimerWaker>[]>} */
  const schedule = provide(timerBaggage, 'Schedule', () =>
    makeScalarBigMapStore('Timestamp', { durable: true }),
  );

  const repeaterKindHandle = provide(timerBaggage, 'RepeaterKindHandle', () =>
    makeKindHandle('TimerRepeater'),
  );
  const delayWakerKindHandle = provide(
    timerBaggage,
    'DelayWakerKindHandle',
    () => makeKindHandle('DelayWaker'),
  );
  const makeRepeaterKit = defineDurableKindMulti(
    repeaterKindHandle,
    (delay, interval, timer) => {
      assert.typeof(delay, 'bigint');
      assert(
        delay % timeStep === 0n,
        `timer has a resolution of ${timeStep}; ${delay} is not divisible`,
      );
      assert.typeof(interval, 'bigint');
      assert(
        interval % timeStep === 0n,
        `timer has a resolution of ${timeStep}; ${interval} is not divisible`,
      );
      const nextWakeup = ticks + delay;

      /** @type {Array<ERef<TimerWaker>> | null} */
      return { wakers: harden([]), nextWakeup, interval, timer };
    },
    {
      repeater: {
        schedule: ({ state }, waker) => {
          assert(state.wakers, X`Cannot schedule on a disabled repeater`);
          state.wakers = harden([...state.wakers, waker]);
          return state.nextWakeup;
        },
        disable: ({ state }) => {
          state.wakers = null;
          state.timer.removeWakeup(state.repeaterWaker);
        },
      },

      repeatWaker: {
        wake: async ({ state }, timestamp) => {
          assert.typeof(timestamp, 'bigint');
          assert(
            timestamp % timeStep === 0n,
            `timer has a resolution of ${timeStep}; ${timestamp} is not divisible`,
          );
          if (!state.wakers) {
            return;
          }

          state.nextWakeup = ticks + state.interval;
          state.timer.setWakeup(state.nextWakeup, state.repeaterWaker);
          await Promise.allSettled(
            state.wakers.map(waker => E(waker).wake(timestamp)),
          );
        },
      },
    },
    {
      finish: ({ state, facets }) =>
        state.timer.setWakeup(state.nextWakeup, facets.repeatWaker),
    },
  );

  /** @type {ManualTimer} */
  // @ts-expect-error provideDurableSingleton needs type info
  const timer = provideDurableSingleton(
    timerBaggage,
    'TimerKindHandle',
    'ManualTimer',
    {
      // This function will only be called in testing code to advance the clock.
      tick: async (_context, msg) => {
        ticks += timeStep;
        log(`@@ tick:${ticks}${msg ? `: ${msg}` : ''} @@`);
        if (schedule.has(ticks)) {
          const wakers = schedule.get(ticks);
          schedule.delete(ticks);
          await Promise.allSettled(
            wakers.map(waker => {
              log(`&& running a task scheduled for ${ticks}. &&`);
              return E(waker).wake(ticks);
            }),
          );
        }
      },
      getCurrentTimestamp: _context => ticks,
      setWakeup: (_context, baseTime, waker) => {
        assert.typeof(baseTime, 'bigint');
        assert(
          baseTime % timeStep === 0n,
          `timer has a resolution of ${timeStep}; ${baseTime} is not divisible`,
        );
        if (baseTime <= ticks) {
          log(`&& task was past its deadline when scheduled: ${baseTime} &&`);
          E(waker).wake(ticks);
          return baseTime;
        }
        log(`@@ schedule task for:${baseTime}, currently: ${ticks} @@`);
        if (!schedule.has(baseTime)) {
          schedule.init(baseTime, harden([]));
        }
        schedule.set(baseTime, harden([...schedule.get(baseTime), waker]));
        return baseTime;
      },
      removeWakeup: (_context, waker) => {
        /** @type {Array<Timestamp>} */
        const baseTimes = [];
        for (const [baseTime, wakers] of schedule.entries()) {
          if (wakers.includes(waker)) {
            baseTimes.push(baseTime);
            const remainingWakers = wakers.filter(w => waker !== w);

            if (remainingWakers.length) {
              // Cull the wakers for this time.
              schedule.set(baseTime, remainingWakers);
            } else {
              // There are no more wakers for this time.
              schedule.delete(baseTime);
            }
          }
        }
        return harden(baseTimes);
      },
      makeRepeater: ({ self }, delay, interval) =>
        makeRepeaterKit(delay, interval, self).repeater,
      makeNotifier: ({ self }, delay, interval) => {
        assert.typeof(delay, 'bigint');
        assert(
          delay % timeStep === 0n,
          `timer has a resolution of ${timeStep}; ${delay} is not divisible`,
        );
        assert.typeof(interval, 'bigint');
        assert(
          interval % timeStep === 0n,
          `timer has a resolution of ${timeStep}; ${interval} is not divisible`,
        );
        const { notifier, updater } = makeNotifierKit();
        const notifierWaker = provideDurableSingleton(
          timerBaggage,
          'NotifierWakerKindHandle',
          'NotifyWaker',
          {
            // expect-error
            wake: async ({ self: notiferWaker }, timestamp) => {
              assert.typeof(timestamp, 'bigint');
              updater.updateState(timestamp);
              timer.setWakeup(ticks + interval, notiferWaker);
            },
          },
        );
        self.setWakeup(ticks + delay, notifierWaker);
        return notifier;
      },
      delay: ({ self }, delay) => {
        assert.typeof(delay, 'bigint');
        assert(
          delay % timeStep === 0n,
          `timer has a resolution of ${timeStep}; ${delay} is not divisible`,
        );
        const promiseKit = makePromiseKit();
        const makeDelayWaker = defineDurableKind(
          delayWakerKindHandle,
          () => ({}),
          {
            wake: async (_context, timestamp) => {
              promiseKit.resolve(timestamp);
            },
          },
        );
        self.setWakeup(delay, makeDelayWaker());
        return promiseKit.promise;
      },
    },
  );

  return timer;
};

harden(buildManualTimer);
export default buildManualTimer;
