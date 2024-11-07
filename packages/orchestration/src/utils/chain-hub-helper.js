import { E } from '@endo/far';
import { makeTracer } from '@agoric/internal';
import { denomHash } from './denomHash.js';
import { registerChain } from '../chain-info.js';

const trace = makeTracer('ChainHubHelper', true);

/**
 * @import {ERef} from '@endo/far';
 * @import {KnownChains} from '../chain-info.js';
 * @import {ChainHubAdmin} from '../exos/chain-hub-admin.js';
 */

/**
 * Consider this a sloppy hack until #9752
 *
 * @param {{
 *   agoricNamesAdmin?: ERef<import('@agoric/vats').NameAdmin>?;
 *   vowTools: import('@agoric/vow').VowTools;
 *   chainHubAdmin: ERef<ChainHubAdmin>;
 * }} powers
 * @param {KnownChains} chainInfo
 * @param chainHubAdmin
 * @param {Record<string, Brand<'nat'>>} brands
 */
export const registerKnownChainsAndAssets = async (
  { agoricNamesAdmin, vowTools, chainHubAdmin },
  chainInfo,
  brands,
) => {
  if (agoricNamesAdmin != null) {
    // Register the names
    // eslint-disable-next-line @jessie.js/safe-await-separator
    for await (const [name, info] of Object.entries(chainInfo)) {
      await registerChain(agoricNamesAdmin, name, info, trace);
    }
  }

  await vowTools.when(
    vowTools.all([
      // multichain-e2e flows
      E(chainHubAdmin).populateChainsAndConnection('agoric', 'cosmoshub'),
      E(chainHubAdmin).populateChainsAndConnection('agoric', 'osmosis'),
      E(chainHubAdmin).populateChainsAndConnection('cosmoshub', 'osmosis'),
      // FastUSDC
      E(chainHubAdmin).populateChainsAndConnection('agoric', 'noble'),
      E(chainHubAdmin).populateChainsAndConnection('dydx', 'noble'),
    ]),
  );

  await Promise.all([
    // agoric
    E(chainHubAdmin).registerAsset('ubld', {
      chainName: 'agoric',
      baseName: 'agoric',
      baseDenom: 'ubld',
      brand: brands?.BLD,
    }),
    E(chainHubAdmin).registerAsset('uist', {
      chainName: 'agoric',
      baseName: 'agoric',
      baseDenom: 'uist',
      brand: brands?.IST,
    }),
    E(chainHubAdmin).registerAsset(
      `ibc/${denomHash({
        channelId:
          chainInfo.agoric.connections['noble-1'].transferChannel.channelId,
        denom: 'uusdc',
      })}`,
      {
        chainName: 'agoric',
        baseName: 'noble',
        baseDenom: 'uusdc',
        brand: brands?.USDC,
      },
    ),
    // noble
    E(chainHubAdmin).registerAsset('uusdc', {
      chainName: 'noble',
      baseName: 'noble',
      baseDenom: 'uusdc',
    }),
    // dydx
    E(chainHubAdmin).registerAsset(
      `ibc/${denomHash({
        channelId:
          chainInfo.dydx.connections['noble-1'].transferChannel.channelId,
        denom: 'uusdc',
      })}`,
      {
        chainName: 'dydx',
        baseName: 'noble',
        baseDenom: 'uusdc',
      },
    ),
  ]);
};
