// @ts-check
/**
 * @file Stake ATOM contract
 *
 */

import { makeTracer } from '@agoric/internal';
import { makeDurableZone } from '@agoric/zone/durable.js';
import { M } from '@endo/patterns';
import { E } from '@endo/far';
import { prepareRecorderKitMakers } from '@agoric/zoe/src/contractSupport/recorder.js';
import { atomicTransfer } from '@agoric/zoe/src/contractSupport/atomicTransfer.js';
import { prepareAccountHolder } from './localchainAccountHolder.js';

const trace = makeTracer('StakeAtom');

/**
 *
 * @param {ZCF} zcf
 * @param {{
 *   localchain: import('@agoric/vats/src/localchain.js').LocalChain;
 *   marshaller: Marshaller;
 *   storageNode: StorageNode;
 * }} privateArgs
 * @param {import("@agoric/vat-data").Baggage} baggage
 */
export const start = async (zcf, privateArgs, baggage) => {
  const { ATOM } = zcf.getTerms().brands;

  const atomAmountShape = await E(ATOM).getAmountShape();

  const zone = makeDurableZone(baggage);

  const { makeRecorderKit } = prepareRecorderKitMakers(
    baggage,
    privateArgs.marshaller,
  );
  const makeAccountHolderKit = prepareAccountHolder(baggage, makeRecorderKit);

  const publicFacet = zone.exo('StakeAtom', undefined, {
    makeStakeAtomInvitation() {
      return zcf.makeInvitation(
        async seat => {
          const { give } = seat.getProposal();
          trace('makeStakeAtomInvitation', give);
          // XXX type appears local but its' remote
          const account = await E(privateArgs.localchain).createAccount();
          const lcaSeatKit = zcf.makeEmptySeatKit();
          atomicTransfer(zcf, seat, lcaSeatKit.zcfSeat, give);
          seat.exit();
          trace('makeStakeAtomInvitation tryExit lca userSeat');
          await E(lcaSeatKit.userSeat).tryExit();
          trace('awaiting payouts');
          const payouts = await E(lcaSeatKit.userSeat).getPayouts();
          const { holder, invitationMakers } = makeAccountHolderKit(
            account,
            privateArgs.storageNode,
          );
          trace('awaiting deposit');
          await E(account).deposit(await payouts.In);

          return {
            publicSubscribers: holder.getPublicTopics(),
            invitationMakers,
            account: holder,
          };
        },
        'wantStake',
        undefined,
        M.splitRecord({
          give: { In: atomAmountShape },
        }),
      );
    },
  });

  return { publicFacet };
};
