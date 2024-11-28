import {
  denomHash,
  type CosmosChainInfo,
  type Denom,
  type DenomDetail,
} from '@agoric/orchestration';
import type { IBCChannelID } from '@agoric/vats';

/** make asset info for current env */
export const makeAssetInfo = (
  chainInfo: Record<string, CosmosChainInfo>,
  tokenMap: Record<string, Denom[]> = {
    agoric: ['ubld', 'uist'],
    cosmoshub: ['uatom'],
    noble: ['uusdc'],
    osmosis: ['uosmo', 'uion'],
  },
): Record<string, DenomDetail> => {
  const getChannelId = (
    issuingChainId: string,
    holdingChainName: string,
  ): IBCChannelID | undefined => {
    return chainInfo[holdingChainName]?.connections?.[issuingChainId]
      .transferChannel.channelId;
  };

  const toDenomHash = (
    denom: Denom,
    issuingChainId: string,
    holdingChainName: string,
  ): Denom => {
    const channelId = getChannelId(issuingChainId, holdingChainName);
    if (!channelId) {
      throw new Error(
        `No channel found for ${issuingChainId} -> ${holdingChainName}`,
      );
    }
    return `ibc/${denomHash({ denom, channelId })}`;
  };

  // Filter tokenMap to only include chains present in the current environment
  const currentTokenMap = Object.entries(tokenMap).reduce<
    Record<string, Denom[]>
  >(
    (acc, [chainName, denoms]) =>
      chainName in chainInfo ? { ...acc, [chainName]: denoms } : acc,
    {},
  );

  const assetInfo: Record<Denom, DenomDetail> = {};
  for (const holdingChain of Object.keys(chainInfo)) {
    for (const [issuingChain, denoms] of Object.entries(currentTokenMap)) {
      for (const denom of denoms) {
        const denomOrHash =
          holdingChain === issuingChain
            ? denom
            : toDenomHash(denom, chainInfo[issuingChain].chainId, holdingChain);
        assetInfo[denomOrHash] = {
          baseName: issuingChain,
          chainName: holdingChain,
          baseDenom: denom,
        };
      }
    }
  }

  return assetInfo;
};
