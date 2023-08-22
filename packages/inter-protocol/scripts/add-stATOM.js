import { makeHelpers } from '@agoric/deploy-script-support';
import { defaultProposalBuilder as vaultProposalBuilder } from './add-collateral-core.js';
import { defaultProposalBuilder as oraclesProposalBuilder } from './price-feed-core.js';

/** @type {import('@agoric/deploy-script-support/src/externalTypes.js').ProposalBuilder} */
export const starsVaultProposalBuilder = async powers => {
  return vaultProposalBuilder(powers, {
    interchainAssetOptions: {
      denom:
        'ibc/49C630713B2AB60653F76C0C58D43C2A64956803B4D422CACB6DD4AD016ED846',
      decimalPlaces: 6,
      keyword: 'STATOM',
      issuerName: 'stATOM',
      oracleBrand: 'stATOM',
      proposedName: 'stATOM',
    },
  });
};

/** @type {import('@agoric/deploy-script-support/src/externalTypes.js').ProposalBuilder} */
export const starsOraclesProposalBuilder = async powers => {
  return oraclesProposalBuilder(powers, {
    AGORIC_INSTANCE_NAME: `STATOM-USD price feed`,
    IN_BRAND_LOOKUP: ['agoricNames', 'oracleBrand', 'stATOM'],
    IN_BRAND_DECIMALS: 6,
    OUT_BRAND_LOOKUP: ['agoricNames', 'oracleBrand', 'USD'],
    OUT_BRAND_DECIMALS: 4,
    oracleAddresses: [
      // copied from decentral-test-vaults-config.json
      'agoric1ldmtatp24qlllgxmrsjzcpe20fvlkp448zcuce',
      'agoric140dmkrz2e42ergjj7gyvejhzmjzurvqeq82ang',
      'agoric15xddzse9lq74cyt6ev9d7wywxerenxdgxsdc3m',
    ],
  });
};

export default async (homeP, endowments) => {
  const { writeCoreProposal } = await makeHelpers(homeP, endowments);
  await writeCoreProposal('add-stATOM', starsVaultProposalBuilder);
  await writeCoreProposal('add-stATOM-oracles', starsOraclesProposalBuilder);
};
