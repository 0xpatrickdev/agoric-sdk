import { makeTracer } from '@agoric/internal';
import { makeStorageNodeChild } from '@agoric/internal/src/lib-chainStorage.js';
import { Stake } from '@agoric/internal/src/tokens.js';
import { E } from '@endo/far';

const trace = makeTracer('StartStakeAtom', true);

/**
 * @param {BootstrapPowers & {installation: {consume: {stakeAtom: Installation<import('../contracts/stakeAtom.contract.js').start>}}}} powers
 */
export const startStakeAtom = async ({
  consume: { board, chainStorage, localchain, network, startUpgradable },
  installation: {
    consume: { stakeAtom },
  },
  instance: {
    produce: { stakeAtom: produceInstance },
  },
  issuer: {
    consume: { ATOM: stakeIssuer },
  },
}) => {
  const VSTORAGE_PATH = 'stakeAtom';
  trace('startStakeAtom');

  const storageNode = await makeStorageNodeChild(chainStorage, VSTORAGE_PATH);

  // NB: committee must only publish what it intended to be public
  const marshaller = await E(board).getPublishingMarshaller();

  /** @type {import('@agoric/network/src/types.js').Port} random port assignment from network */
  const port = await E(network).bind('/ibc-port/');

  // FIXME this isn't detecting missing privateArgs
  /** @type {StartUpgradableOpts<import('../contracts/stakeAtom.contract.js').start>} */
  const startOpts = {
    label: 'stakeAtom',
    installation: stakeAtom,
    issuerKeywordRecord: harden({ ATOM: await stakeIssuer }),
    terms: {
      controllerConnectionId: 'connection-649', // XXX get from well-known
      hostConnectionId: 'connection-8', // XXX get from well-known
    },
    privateArgs: {
      localchain: await localchain,
      port,
      storageNode,
      marshaller,
    },
  };

  const { instance } = await E(startUpgradable)(startOpts);
  produceInstance.resolve(instance);
};
harden(startStakeAtom);

export const getManifestForStakeAtom = ({ restoreRef }, { installKeys }) => {
  return {
    manifest: {
      [startStakeAtom.name]: {
        consume: {
          board: true,
          chainStorage: true,
          localchain: true,
          network: true,
          startUpgradable: true,
        },
        installation: {
          consume: { stakeAtom: true },
        },
        instance: {
          produce: { stakeAtom: true },
        },
        issuer: {
          consume: { [Stake.symbol]: true },
        },
      },
    },
    installations: {
      stakeAtom: restoreRef(installKeys.stakeAtom),
    },
  };
};
