import { makeStateRecord } from '@agoric/async-flow';
import { InvitationShape } from '@agoric/zoe/src/typeGuards.js';
import { M } from '@endo/patterns';
import { withOrchestration } from '../../src/utils/start-helper.js';
import { prepareChainHubAdmin } from '../../src/exos/chain-hub-admin.js';
import * as flows from './zoeTools.flows.js';

/**
 * @import {TimerService} from '@agoric/time';
 * @import {LocalChain} from '@agoric/vats/src/localchain.js';
 * @import {NameHub} from '@agoric/vats';
 * @import {Remote} from '@agoric/vow';
 * @import {Zone} from '@agoric/zone';
 * @import {CosmosInterchainService} from '../../src/exos/cosmos-interchain-service.js';
 * @import {OrchestrationTools} from '../../src/utils/start-helper.js';
 */

/**
 * @typedef {{
 *   localchain: Remote<LocalChain>;
 *   orchestrationService: Remote<CosmosInterchainService>;
 *   storageNode: Remote<StorageNode>;
 *   timerService: Remote<TimerService>;
 *   agoricNames: Remote<NameHub>;
 * }} OrchestrationPowers
 */

/**
 * Orchestration contract to be wrapped by withOrchestration for Zoe
 *
 * @param {ZCF} zcf
 * @param {OrchestrationPowers & {
 *   marshaller: Marshaller;
 * }} _privateArgs
 * @param {Zone} zone
 * @param {OrchestrationTools} tools
 */
const contract = async (
  zcf,
  _privateArgs,
  zone,
  { chainHub, orchestrateAll, zoeTools },
) => {
  const contractState = makeStateRecord(
    /** @type {{ account: OrchestrationAccount<any> | undefined }} */ {
      localAccount: undefined,
    },
  );

  const creatorFacet = prepareChainHubAdmin(zone, chainHub);

  const orchFns = orchestrateAll(flows, {
    zcf,
    contractState,
    zoeTools,
  });

  const publicFacet = zone.exo(
    'Zoe Tools Test PF',
    M.interface('Zoe Tools Test PF', {
      makeDepositSendInvitation: M.callWhen().returns(InvitationShape),
      makeLocalAccount: M.callWhen().returns(InvitationShape),
    }),
    {
      makeDepositSendInvitation() {
        return zcf.makeInvitation(orchFns.depositSend, 'depositSend');
      },
      makeLocalAccount() {
        return zcf.makeInvitation(orchFns.makeLocalAccount, 'makeLocalAccount');
      },
    },
  );

  return { publicFacet, creatorFacet };
};

export const start = withOrchestration(contract);
harden(start);
