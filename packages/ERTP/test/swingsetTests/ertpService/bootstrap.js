// @ts-check

import { makeScalarBigSetStore } from '@agoric/vat-data/src';
import { E, Far } from '@endo/far';

export const buildRootObject = async (vatPowers, vatParameters, baggage) => {
  const issuerBaggageSet = makeScalarBigSetStore('BaggageSet', {
    durable: true,
  });
  baggage.init('IssuerBaggageSet', issuerBaggageSet);

  const {
    argv: [testName],
  } = vatParameters;

  const obj0 = Far('root', {
    async bootstrap(vats) {
      const aliceMaker = await E(vats.alice).makeAliceMaker();
      const ertpService = await E(vats.ertp).makeErtpService();
      const aliceP = E(aliceMaker).make();
      return E(aliceP).startTest(testName, ertpService);
    },
  });
  return obj0;
};
