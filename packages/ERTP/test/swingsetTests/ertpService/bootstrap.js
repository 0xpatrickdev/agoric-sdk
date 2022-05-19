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
  const ertpService = provideDurableSingleton(
    baggage,
    'ERTPServiceKindHandle',
    'ERTPService',
    {
      makeIssuer: (
        allegedName,
        assetKind = AssetKind.NAT,
        displayInfo = harden({}),
      ) => {
        const issuerBaggage = makeScalarBigMapStore('IssuerBaggage', {
          durable: true,
        });
        const issuerKit = makeDurableIssuerKit(
          issuerBaggage,
          allegedName,
          assetKind,
          displayInfo,
        );
        issuerBaggageSet.add(issuerBaggage);
      },
    },
  );
};
