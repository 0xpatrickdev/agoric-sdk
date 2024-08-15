import { Fail, q } from '@endo/errors';
import { mustMatch } from '@endo/patterns';
import { ChainAddressShape } from '../../src/typeGuards.js';

const { values } = Object;

/**
 * @import {GuestInterface} from '@agoric/async-flow';
 * @import {ZoeTools} from '../../src/utils/zoe-tools.js';
 * @import {Orchestrator, LocalAccountMethods, OrchestrationAccountI, OrchestrationFlow, ChainAddress} from '../../src/types.js';
 */

/**
 * Accept one or more deposits and send them to an account on the local chain
 * using MsgSend. This isn't a practical example, just a test fixture.
 *
 * @satisfies {OrchestrationFlow}
 * @param {Orchestrator} orch
 * @param {object} ctx
 * @param {{ localAccount?: OrchestrationAccountI & LocalAccountMethods }} ctx.contractState
 * @param {GuestInterface<ZoeTools>} ctx.zoeTools
 * @param {ZCFSeat} seat
 * @param {{ destAddr: ChainAddress }} offerArgs
 */
export const depositSend = async (
  orch,
  { contractState, zoeTools: { localTransfer, withdrawToSeat } },
  seat,
  offerArgs,
) => {
  mustMatch(offerArgs, harden({ destAddr: ChainAddressShape }));
  const { destAddr } = offerArgs;
  assert(destAddr.value.startsWith('agoric1'), 'must send to a local address');

  const { give } = seat.getProposal();

  if (!contractState.localAccount) {
    const agoricChain = await orch.getChain('agoric');
    contractState.localAccount = await agoricChain.makeAccount();
  }

  await localTransfer(seat, contractState.localAccount, give);

  try {
    await contractState.localAccount.sendAll(destAddr, values(give));
  } catch (e) {
    await withdrawToSeat(contractState.localAccount, seat, give);
    seat.exit();
    throw Fail`IBC Transfer failed ${q(e)}`;
  }

  seat.exit();
};
harden(depositSend);

/**
 * Make a local account.
 *
 * @satisfies {OrchestrationFlow}
 * @param {Orchestrator} orch
 * @param {object} _ctx
 * @param {ZCFSeat} seat
 */
export const makeLocalAccount = async (orch, _ctx, seat) => {
  seat.exit();
  // return the holder, not the continuing offer
  const agoric = await orch.getChain('agoric');
  return agoric.makeAccount();
};
harden(makeLocalAccount);
