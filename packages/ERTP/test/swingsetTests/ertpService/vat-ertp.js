// @ts-check

import { Far } from '@endo/marshal';
import {
  makeScalarBigMapStore,
  makeScalarBigSetStore,
  provideDurableSingleton,
} from '@agoric/vat-data/src';
import { AssetKind, makeDurableIssuerKit } from '../../../src';

function makeErtpService(baggage) {
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
        );
        issuerBaggageSet.add(issuerBaggage);

        return issuerKit;
      },
    },
  );

  return ertpService;
}

export const buildRootObject = async (vatPowers, vatParams, baggage) =>
  Far('root', {
    makeErtpService: () => makeErtpService(baggage),
  });
