import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';
import { AmountMath } from '../../../src';

const makeAliceMaker = log =>
  Far('aliceMaker', {
    make: () => {
      const alice = Far('alice', {
        startTest: async (testName, ertpService) => {
          switch (testName) {
            case 'ertpService': {
              log('started ERTP Service');
              const doubloonKit = await E(ertpService).makeIssuerKit(
                'Doubloons',
              );
              log(`Issuer: ${doubloonKit.issuer}`);
              log(`brand: ${doubloonKit.brand}`);
              log(`mint: ${doubloonKit.mint}`);
              break;
            }

            case 'multipleIssuers': {
              log('started ERTP Service');
              const issuerKitPromises = [];
              for (let h = 0; h < 10; h += 1) {
                issuerKitPromises.push(
                  E(ertpService).makeIssuerKit(`Doubloons${h}`),
                );
              }
              const issuerKits = await Promise.all(issuerKitPromises);

              const promises = [];
              const purseAs = [];
              const purseBs = [];
              for (let i = 0; i < 10; i += 1) {
                const { issuer, brand, mint } = issuerKits[i];
                purseAs.push(E(issuer).makeEmptyPurse());
                purseBs.push(E(issuer).makeEmptyPurse());

                promises.push(
                  E(mint)
                    .mintPayment(AmountMath.make(brand, BigInt(i)))
                    .then(p => E(purseAs[i]).deposit(p)),
                );
              }
              await Promise.all(promises);

              const promises2 = [];
              for (const j of [9, 6, 3, 5, 2, 4, 7, 1, 0, 8]) {
                promises2.push(
                  E(purseAs[j])
                    .withdraw(AmountMath.make(issuerKits[j].brand, BigInt(j)))
                    .then(p => E(purseBs[j]).deposit(p)),
                );
              }

              await Promise.all(promises2);

              const promises3 = [];
              for (let k = 0; k < 10; k += 1) {
                promises3.push(
                  E(purseBs[k])
                    .getCurrentAmount()
                    .then(a => log(`Purse ${k} has ${a.value}`)),
                );
              }

              break;
            }
            default: {
              throw Error('no test case specified');
            }
          }
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
