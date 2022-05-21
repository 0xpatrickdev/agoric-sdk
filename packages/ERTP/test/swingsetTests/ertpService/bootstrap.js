// @ts-check

import {
  makeScalarBigMapStore,
  makeScalarBigSetStore,
  provideDurableSingleton,
} from '@agoric/vat-data/src';
import { AssetKind, makeDurableIssuerKit } from '../../../src';

export const buildRootObject = async (vatPowers, vatParameters, baggage) => {
  const issuerBaggageSet = makeScalarBigSetStore('BaggageSet', {
    durable: true,
  });
  baggage.init('IssuerBaggageSet', issuerBaggageSet);

  const obj0 = Far('root', {
    async bootstrap(vats) {
      const aliceMaker = await E(vats.alice).makeAliceMaker();
      const ertpService = await E(vats.ertp).makeErtpService();
      const aliceP = E(aliceMaker).make();
      return E(aliceP).testErtpService(ertpService);
    },
  });
  return obj0;
};
