// @ts-check

import { Far } from '@endo/marshal';
import {
  makeScalarBigMapStore,
  makeScalarBigSetStore,
  provideDurableSingleton,
} from '@agoric/vat-data/src';
import { AssetKind, makeDurableIssuerKit } from '../../../src';

function makeErtpService(baggage, exitVatWithFailure) {
  const issuerBaggageSet = makeScalarBigSetStore('BaggageSet', {
    durable: true,
  });
  baggage.init('IssuerBaggageSet', issuerBaggageSet);

  const ertpService = provideDurableSingleton(
    baggage,
    'ERTPServiceKindHandle',
    'ERTPService',
    {
      makeIssuerKit: (
        _context,
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
          exitVatWithFailure,
        );
        issuerBaggageSet.add(issuerBaggage);

        return issuerKit;
      },
    },
  );

  return ertpService;
}

export const buildRootObject = async (vatPowers, vatParams, baggage) => {
  const ertpService = makeErtpService(baggage, vatPowers.exitVatWithFailure);
  return Far('root', {
    getErtpService: () => ertpService,
  });
};
