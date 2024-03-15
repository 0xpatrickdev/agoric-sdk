// @ts-check
/**
 * @file Stake ATOM contract
 *
 */

import { makeTracer } from '@agoric/internal';
import { initEmpty } from '@agoric/store';
import { makeDurableZone } from '@agoric/zone/durable.js';
import { M } from '@endo/patterns';
import { E } from '@endo/far';
import { prepareVowTools } from '@agoric/vat-data/vow.js';
import { prepareRecorderKitMakers } from '@agoric/zoe/src/contractSupport/recorder.js';
import { atomicTransfer } from '@agoric/zoe/src/contractSupport/atomicTransfer.js';
import { SeatShape } from '@agoric/zoe/src/typeGuards.js';
import { prepareAccountHolder } from './localchainAccountHolder.js';

const trace = makeTracer('StakeAtom');

/**
 *
 * @param {ZCF<{ hostConnectionId: string; controllerConnectionId: string; }>} zcf
 * @param {{
 *   localchain: import('@agoric/vats/src/localchain.js').LocalChain;
 *   port: import('@agoric/network/src/types.js').Port;
 *   marshaller: Marshaller;
 *   storageNode: StorageNode;
 * }} privateArgs
 * @param {import("@agoric/vat-data").Baggage} baggage
 */
export const start = async (zcf, privateArgs, baggage) => {
  const { brands, hostConnectionId, controllerConnectionId } = zcf.getTerms();
  const { localchain, port, marshaller, storageNode } = privateArgs;

  const atomAmountShape = await E(brands.ATOM).getAmountShape();

  const zone = makeDurableZone(baggage);

  const { makeRecorderKit } = prepareRecorderKitMakers(baggage, marshaller);
  const makeAccountHolderKit = prepareAccountHolder(baggage, makeRecorderKit);
  const { makeVowKit, when } = prepareVowTools(zone);

  // XXX should this be scoped to the handler?
  // XXX what to do with vow? i believe this resolves when the connection closes
  const { /* vow, */ resolver } = makeVowKit();

  const makeAtomAccountConnectionHandler = zone.exoClass(
    'AtomAccountHandler',
    undefined,
    () => ({ resolver }),
    {
      async onOpen(connection, localAddr, remoteAddr) {
        trace('onOpen', JSON.stringify({ localAddr, remoteAddr }));
        return connection;
        // XXX should we persist connection to state? so we can .send()
        // void connection.close();
      },
      async onClose(_connection, reason) {
        trace('onClose', reason);
        this.state.resolver.resolve(null);
      },
      async onReceive(_connection, bytes) {
        /// XXX maybe should throw an error since ica connections will not receive packets?
        trace('onReceive', bytes);
        return bytes;
      },
    },
  );

  const makeCreateAtomAccountHandler = zone.exoClass(
    'CreateAtomAccountInvitationHandler',
    M.interface('OfferHandler', {
      handle: M.call(SeatShape).optional(M.any()).returns(M.any()),
    }),
    initEmpty,
    {
      async handle(_seat) {
        trace('makeCreateAtomAccountInvitation');
        const connString = JSON.stringify({
          version: 'ics27-1',
          controllerConnectionId,
          hostConnectionId,
          address: '',
          encoding: 'proto3',
          txType: 'sdk_multi_msg',
        });

        const connection = await when(
          E(port).connect(
            `/ibc-hop/${controllerConnectionId}/ibc-port/icahost/ordered/${connString}`,
            makeAtomAccountConnectionHandler(),
          ),
        );
        trace('connection made');
        const remoteAddress = connection.getRemoteAddress();
        trace('remoteAddress', remoteAddress);

        // XXX make holder and continuing inv.
        return connection;

        // XXX to transact, later
        // const packet = JSON.stringify({ type: 1, data: toBase64(TxBodyBytes), memo: '' });
        // E(connection).send(packet);
      },
    },
  );

  const publicFacet = zone.exo('StakeAtom', undefined, {
    makeCreateAtomAccountInvitation() {
      return zcf.makeInvitation(
        makeCreateAtomAccountHandler(),
        'createAtomAccount',
        undefined,
        M.any(),
      );
    },
    makeStakeAtomInvitation() {
      return zcf.makeInvitation(
        async seat => {
          const { give } = seat.getProposal();
          trace('makeStakeAtomInvitation', give);
          // XXX type appears local but its' remote
          const account = await E(localchain).createAccount();
          const lcaSeatKit = zcf.makeEmptySeatKit();
          atomicTransfer(zcf, seat, lcaSeatKit.zcfSeat, give);
          seat.exit();
          trace('makeStakeAtomInvitation tryExit lca userSeat');
          await E(lcaSeatKit.userSeat).tryExit();
          trace('awaiting payouts');
          const payouts = await E(lcaSeatKit.userSeat).getPayouts();
          const { holder, invitationMakers } = makeAccountHolderKit(
            account,
            storageNode,
          );
          trace('awaiting deposit');
          await E(account).deposit(await payouts.In);

          // XXX 1. create atomAccount
          // XXX 2. ibc/transfer from localAccount to atomAccount
          // XXX 3. return combined holder for atomAccount + localAccount
          //  - would think to close localAcc, but the user may want to stake more later

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
