// @ts-check
/**
 * @file Example contract that uses orchestration
 */
import { makeTracer } from '@agoric/internal';
import { makeDurableZone } from '@agoric/zone/durable.js';
import { V as E } from '@agoric/vat-data/vow.js';
import { M } from '@endo/patterns';
import { prepareRecorderKitMakers } from '@agoric/zoe/src/contractSupport';
import { prepareStakingAccountKit } from '../exos/stakingAccountKit.js';

const trace = makeTracer('StakeAtom');
/**
 * @import { Baggage } from '@agoric/vat-data';
 * @import { IBCConnectionID } from '@agoric/vats';
 * @import { ICQConnection, OrchestrationService } from '../types.js';
 */

/**
 * @typedef {{
 *  hostConnectionId: IBCConnectionID;
 *  controllerConnectionId: IBCConnectionID;
 *  bondDenom: string;
 * }} StakeAtomTerms
 */

/**
 *
 * @param {ZCF<StakeAtomTerms>} zcf
 * @param {{
 *  orchestration: OrchestrationService;
 *  storageNode: StorageNode;
 *  marshaller: Marshaller;
 *  icqConnection: ICQConnection
 * }} privateArgs
 * @param {Baggage} baggage
 */
export const start = async (zcf, privateArgs, baggage) => {
  // TODO #9063 this roughly matches what we'll get from Chain<C>.getChainInfo()
  const { hostConnectionId, controllerConnectionId, bondDenom } =
    zcf.getTerms();
  const { orchestration, marshaller, storageNode, icqConnection } = privateArgs;

  const zone = makeDurableZone(baggage);

  const { makeRecorderKit } = prepareRecorderKitMakers(baggage, marshaller);

  const makeStakingAccountKit = prepareStakingAccountKit(
    baggage,
    makeRecorderKit,
    zcf,
  );

  async function makeAccount() {
    const account = await E(orchestration).makeAccount(
      hostConnectionId,
      controllerConnectionId,
    );
    const accountAddress = await E(account).getAddress();
    trace('account address', accountAddress);
    const { holder, invitationMakers } = makeStakingAccountKit(
      account,
      storageNode,
      accountAddress,
      icqConnection,
      bondDenom,
    );
    return {
      publicSubscribers: holder.getPublicTopics(),
      invitationMakers,
      account: holder,
    };
  }

  const publicFacet = zone.exo(
    'StakeAtom',
    M.interface('StakeAtomI', {
      makeAccount: M.callWhen().returns(M.remotable('ChainAccount')),
      makeMakeAccountInvitation: M.call().returns(M.promise()),
    }),
    {
      async makeAccount() {
        trace('makeAccount');
        return makeAccount().then(({ account }) => account);
      },
      makeMakeAccountInvitation() {
        trace('makeCreateAccountInvitation');
        return zcf.makeInvitation(
          async seat => {
            seat.exit();
            return makeAccount();
          },
          'wantStakingAccount',
          undefined,
          undefined,
        );
      },
    },
  );

  return { publicFacet };
};

/** @typedef {typeof start} StakeAtomSF */
