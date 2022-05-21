import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';

const makeAliceMaker = log =>
  Far('aliceMaker', {
    make: () => {
      const alice = Far('alice', {
        testErtpService: async ertpService => {
          log('started ERTP Service');
          const doubloonKit = await E(ertpService).makeIssuerKit('Doubloons');
          log(`Issuer: ${doubloonKit.issuer}`);
          log(`brand: ${doubloonKit.brand}`);
          log(`mint: ${doubloonKit.mint}`);
        },
      });
      return alice;
    },
  });

export const buildRootObject = vatPowers =>
  Far('root', {
    makeAliceMaker: () => {
      return harden(makeAliceMaker(vatPowers.testLog));
    },
  });
