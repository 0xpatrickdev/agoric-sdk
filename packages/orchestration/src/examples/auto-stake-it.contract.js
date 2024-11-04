import {
  EmptyProposalShape,
  InvitationShape,
} from '@agoric/zoe/src/typeGuards.js';
import { E } from '@endo/far';
import { M } from '@endo/patterns';
import { prepareChainHubAdmin } from '../exos/chain-hub-admin.js';
import { preparePortfolioHolder } from '../exos/portfolio-holder-kit.js';
import { withOrchestration } from '../utils/start-helper.js';
import { prepareStakingTap } from './auto-stake-it-tap-kit.js';
import * as flows from './auto-stake-it.flows.js';
import fetchedChainInfo from '../fetched-chain-info.js';

const { values } = Object;

/**
 * @import {Zone} from '@agoric/zone';
 * @import {OrchestrationPowers, OrchestrationTools} from '../utils/start-helper.js';
 */

/**
 * AutoStakeIt allows users to to create an auto-forwarding address that
 * transfers and stakes tokens on a remote chain when received.
 *
 * To be wrapped with `withOrchestration`.
 *
 * @param {ZCF} zcf
 * @param {OrchestrationPowers & {
 *   marshaller: Marshaller;
 * }} privateArgs
 * @param {Zone} zone
 * @param {OrchestrationTools} tools
 */
const contract = async (
  zcf,
  privateArgs,
  zone,
  { chainHub, orchestrateAll, vowTools },
) => {
  const makeStakingTap = prepareStakingTap(
    zone.subZone('stakingTap'),
    vowTools,
  );
  const makePortfolioHolder = preparePortfolioHolder(
    zone.subZone('portfolio'),
    vowTools,
  );

  const { makeAccounts } = orchestrateAll(flows, {
    makeStakingTap,
    makePortfolioHolder,
    chainHub,
  });

  // register assets in ChainHub ourselves,
  // UNTIL https://github.com/Agoric/agoric-sdk/issues/9752
  const assets =
    /** @type {import('@agoric/vats/src/vat-bank.js').AssetInfo[]} */ (
      await E(E(privateArgs.agoricNames).lookup('vbankAsset')).values()
    );
  for (const chainName of ['agoric', 'cosmoshub']) {
    chainHub.registerChain(chainName, fetchedChainInfo[chainName]);
  }
  console.log('@@@@@@@@@brand', assets);

  for (const brand of values(zcf.getTerms().brands)) {
    console.log('@@@@@@@@@brand', brand);
    const info = assets.find(a => a.brand === brand);
    if (info) {
      chainHub.registerAsset(info.denom, {
        // we are only registering agoric assets, so safe to use denom and
        // hardcode chainName
        baseDenom: info.denom,
        baseName: 'agoric',
        chainName: 'agoric',
        brand,
      });
    }
  }

  const publicFacet = zone.exo(
    'AutoStakeIt Public Facet',
    M.interface('AutoStakeIt Public Facet', {
      makeAccountsInvitation: M.callWhen().returns(InvitationShape),
    }),
    {
      makeAccountsInvitation() {
        return zcf.makeInvitation(
          makeAccounts,
          'Make Accounts',
          undefined,
          EmptyProposalShape,
        );
      },
    },
  );

  const creatorFacet = prepareChainHubAdmin(zone, chainHub);

  return { publicFacet, creatorFacet };
};

export const start = withOrchestration(contract);
harden(start);

/** @typedef {typeof start} AutoStakeItSF */
