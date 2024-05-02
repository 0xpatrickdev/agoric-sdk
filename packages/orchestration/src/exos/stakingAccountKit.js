// @ts-check
/** @file Use-object for the owner of a staking account */
import {
  MsgDelegate,
  MsgDelegateResponse,
} from '@agoric/cosmic-proto/cosmos/staking/v1beta1/tx.js';
import {
  QueryBalanceRequest,
  QueryBalanceResponse,
} from '@agoric/cosmic-proto/cosmos/bank/v1beta1/query.js';
import { Any } from '@agoric/cosmic-proto/google/protobuf/any';
import { RequestQuery } from '@agoric/cosmic-proto/tendermint/abci/types.js';
import { AmountShape } from '@agoric/ertp';
import { makeTracer } from '@agoric/internal';
import { UnguardedHelperI } from '@agoric/internal/src/typeGuards.js';
import { M, prepareExoClassKit } from '@agoric/vat-data';
import { TopicsRecordShape } from '@agoric/zoe/src/contractSupport/index.js';
import { decodeBase64 } from '@endo/base64';
import { E } from '@endo/far';
import { ChainAddressShape } from '../typeGuards.js';

/**
 * @import { ChainAccount, ChainAddress, CosmosValidatorAddress, ICQConnection } from '../types.js';
 * @import { RecorderKit, MakeRecorderKit } from '@agoric/zoe/src/contractSupport/recorder.js';
 * @import { Baggage } from '@agoric/swingset-liveslots';
 * @import { AnyJson, RequestQueryJson } from '@agoric/cosmic-proto';
 */

const trace = makeTracer('StakingAccountHolder');

const { Fail } = assert;
/**
 * @typedef {object} StakingAccountNotification
 * @property {ChainAddress} chainAddress
 */

/**
 * @typedef {{
 *  topicKit: RecorderKit<StakingAccountNotification>;
 *  account: ChainAccount;
 *  chainAddress: ChainAddress;
 *  icqConnection: ICQConnection;
 *  bondDenom: string;
 * }} State
 */

export const BalanceShape = { amount: M.string(), denom: M.string() };

export const ChainAccountHolderI = M.interface('ChainAccountHolder', {
  getPublicTopics: M.call().returns(TopicsRecordShape),
  makeDelegateInvitation: M.call(M.string(), AmountShape).returns(M.promise()),
  makeCloseAccountInvitation: M.call().returns(M.promise()),
  makeTransferAccountInvitation: M.call().returns(M.promise()),
  delegate: M.callWhen(M.string(), AmountShape).returns(M.string()),
  queryBalance: M.callWhen().optional(M.string()).returns(BalanceShape),
  getAddress: M.call().returns(ChainAddressShape),
});

/** @type {{ [name: string]: [description: string, valueShape: Pattern] }} */
const PUBLIC_TOPICS = {
  account: ['Staking Account holder status', M.any()],
};

/**
 * @param {Baggage} baggage
 * @param {MakeRecorderKit} makeRecorderKit
 * @param {ZCF} zcf
 */
export const prepareStakingAccountKit = (baggage, makeRecorderKit, zcf) => {
  const makeStakingAccountKit = prepareExoClassKit(
    baggage,
    'Staking Account Holder',
    {
      helper: UnguardedHelperI,
      holder: ChainAccountHolderI,
      invitationMakers: M.interface('invitationMakers', {
        Delegate:
          ChainAccountHolderI.payload.methodGuards.makeDelegateInvitation,
        CloseAccount:
          ChainAccountHolderI.payload.methodGuards.makeCloseAccountInvitation,
        TransferAccount:
          ChainAccountHolderI.payload.methodGuards
            .makeTransferAccountInvitation,
      }),
    },
    /**
     * @param {ChainAccount} account
     * @param {StorageNode} storageNode
     * @param {ChainAddress} chainAddress
     * @param {ICQConnection} icqConnection
     * @param {string} bondDenom e.g. 'uatom'
     * @returns {State}
     */
    (account, storageNode, chainAddress, icqConnection, bondDenom) => {
      // must be the fully synchronous maker because the kit is held in durable state
      const topicKit = makeRecorderKit(storageNode, PUBLIC_TOPICS.account[1]);

      return { account, chainAddress, topicKit, icqConnection, bondDenom };
    },
    {
      helper: {
        /** @throws if this holder no longer owns the account */
        owned() {
          const { account } = this.state;
          if (!account) {
            throw Fail`Using account holder after transfer`;
          }
          return account;
        },
        getUpdater() {
          return this.state.topicKit.recorder;
        },
        // TODO move this beneath the Orchestration abstraction,
        // to the OrchestrationAccount provided by makeAccount()
        /**
         * @param {string} [denom] - defaults to bondDenom
         * @returns {Promise<{ amount: string; denom: string; }>}
         */
        async queryBalance(denom) {
          const { chainAddress, icqConnection, bondDenom } = this.state;

          denom ||= bondDenom;

          const [result] = await E(icqConnection).query([
            /** @type {RequestQueryJson} */ (
              RequestQuery.toJSON(
                RequestQuery.fromPartial({
                  path: '/cosmos.bank.v1beta1.Query/Balance',
                  data: QueryBalanceRequest.encode(
                    QueryBalanceRequest.fromPartial({
                      address: chainAddress.address,
                      denom,
                    }),
                  ).finish(),
                }),
              )
            ),
          ]);
          if (!result?.key) throw Fail`Error parsing result ${result}`;
          const { balance } = QueryBalanceResponse.decode(
            decodeBase64(result.key),
          );
          if (!balance) throw Fail`Result lacked balance key: ${result}`;
          // TODO, return Amount? cast amount to bigint? #9211
          return balance;
        },
        /**
         * _Assumes users has already sent funds to their ICA, until #9193
         * @param {CosmosValidatorAddress} cosmosValidatorAddress
         * @param {Amount<'nat'>} ertpAmount
         */
        async delegate(cosmosValidatorAddress, ertpAmount) {
          // FIXME get values from proposal or args #9211
          // FIXME brand handling and amount scaling
          const amount = {
            amount: String(ertpAmount.value),
            denom: this.state.bondDenom, // TODO use ertpAmount.brand #9211
          };

          const account = this.facets.helper.owned();
          const delegatorAddress = this.state.chainAddress.address;

          const result = await E(account).executeEncodedTx([
            /** @type {AnyJson} */ (
              Any.toJSON(
                MsgDelegate.toProtoMsg({
                  delegatorAddress,
                  validatorAddress: cosmosValidatorAddress.address,
                  amount,
                }),
              )
            ),
          ]);

          if (!result) throw Fail`Failed to delegate.`;
          try {
            const decoded = MsgDelegateResponse.decode(decodeBase64(result));
            if (JSON.stringify(decoded) === '{}') return 'Success';
            throw Fail`Unexpected response: ${result}`;
          } catch (e) {
            throw Fail`Unable to decode result: ${result}`;
          }
        },
      },
      invitationMakers: {
        /**
         * @param {CosmosValidatorAddress} validatorAddress
         * @param {Amount<'nat'>} amount
         */
        Delegate(validatorAddress, amount) {
          return this.facets.holder.makeDelegateInvitation(
            validatorAddress,
            amount,
          );
        },
        CloseAccount() {
          return this.facets.holder.makeCloseAccountInvitation();
        },
        TransferAccount() {
          return this.facets.holder.makeTransferAccountInvitation();
        },
      },
      holder: {
        getPublicTopics() {
          const { topicKit } = this.state;
          return harden({
            account: {
              description: PUBLIC_TOPICS.account[0],
              subscriber: topicKit.subscriber,
              storagePath: topicKit.recorder.getStoragePath(),
            },
          });
        },
        /**
         *
         * @param {CosmosValidatorAddress} validatorAddress
         * @param {Amount<'nat'>} ertpAmount
         */
        async delegate(validatorAddress, ertpAmount) {
          trace('delegate', validatorAddress, ertpAmount);
          return this.facets.helper.delegate(validatorAddress, ertpAmount);
        },
        getAddress() {
          return this.state.chainAddress;
        },
        /**
         * @param {string} [denom] - defaults to bondDenom
         * @returns {Promise<{ amount: string; denom: string; }>}
         */
        async queryBalance(denom) {
          denom ||= this.state.bondDenom;
          trace('queryBalance', this.state.chainAddress.address, denom);
          return this.facets.helper.queryBalance(denom);
        },
        /**
         *
         * @param {CosmosValidatorAddress} validatorAddress
         * @param {Amount<'nat'>} ertpAmount
         */
        makeDelegateInvitation(validatorAddress, ertpAmount) {
          trace('makeDelegateInvitation', validatorAddress, ertpAmount);

          return zcf.makeInvitation(async seat => {
            seat.exit();
            return this.facets.helper.delegate(validatorAddress, ertpAmount);
          }, 'Delegate');
        },
        makeCloseAccountInvitation() {
          throw Error('not yet implemented');
        },
        /**
         * Starting a transfer revokes the account holder. The associated updater
         * will get a special notification that the account is being transferred.
         */
        makeTransferAccountInvitation() {
          throw Error('not yet implemented');
        },
      },
    },
  );
  return makeStakingAccountKit;
};

/** @typedef {ReturnType<ReturnType<typeof prepareStakingAccountKit>>} StakingAccountKit */
