// @ts-check
/** @file QueryConnection Exo */
import { NonNullish } from '@agoric/assert';
import { makeTracer } from '@agoric/internal';
import { V as E } from '@agoric/vat-data/vow.js';
import { M } from '@endo/patterns';
import { makeQueryPacket, parseQueryPacket } from '../utils/packet.js';
import { ConnectionHandlerI } from '../typeGuards.js';

/**
 * @import { Zone } from '@agoric/base-zone';
 * @import { Connection, Port } from '@agoric/network';
 * @import { Remote } from '@agoric/vow';
 * @import { Base64Any, RequestQueryJson } from '@agoric/cosmic-proto';
 * @import { ResponseQuery } from '@agoric/cosmic-proto/tendermint/abci/types.js';
 * @import { LocalIbcAddress, RemoteIbcAddress } from '@agoric/vats/tools/ibc-utils.js';
 */

const { Fail } = assert;
const trace = makeTracer('Orchestration:QueryConnection');

export const QueryMsgShape = M.splitRecord(
  { path: M.string(), data: M.string() },
  { height: M.string(), prove: M.boolean() },
);

export const QueryConnectionI = M.interface('QueryConnection', {
  getLocalAddress: M.call().returns(M.string()),
  getRemoteAddress: M.call().returns(M.string()),
  query: M.call(M.arrayOf(QueryMsgShape)).returns(M.promise()),
});

/** @param {Zone} zone */
export const prepareQueryConnectionKit = zone =>
  zone.exoClassKit(
    'QueryConnectionKit',
    { connection: QueryConnectionI, connectionHandler: ConnectionHandlerI },
    /**
     * @param {Port} port
     */
    port =>
      /**
       * @type {{
       *   port: Port;
       *   connection: Remote<Connection> | undefined;
       *   localAddress: LocalIbcAddress | undefined;
       *   remoteAddress: RemoteIbcAddress | undefined;
       * }}
       */ (
        harden({
          port,
          connection: undefined,
          remoteAddress: undefined,
          localAddress: undefined,
        })
      ),
    {
      connection: {
        getLocalAddress() {
          return NonNullish(
            this.state.localAddress,
            'local address not available',
          );
        },
        getRemoteAddress() {
          return NonNullish(
            this.state.remoteAddress,
            'remote address not available',
          );
        },
        /**
         * @param {RequestQueryJson[]} msgs
         * @returns {Promise<Base64Any<ResponseQuery>[]>}
         * @throws {Error} if packet fails to send or an error is returned
         */
        query(msgs) {
          const { connection } = this.state;
          if (!connection) throw Fail`connection not available`;
          return E.when(
            E(connection).send(makeQueryPacket(msgs)),
            // if parseTxPacket cannot find a `result` key, it throws
            ack => parseQueryPacket(ack),
          );
        },
      },
      connectionHandler: {
        /**
         * @param {Remote<Connection>} connection
         * @param {LocalIbcAddress} localAddr
         * @param {RemoteIbcAddress} remoteAddr
         */
        async onOpen(connection, localAddr, remoteAddr) {
          trace(`ICQ Channel Opened for ${localAddr} at ${remoteAddr}`);
          this.state.connection = connection;
          this.state.remoteAddress = remoteAddr;
          this.state.localAddress = localAddr;
        },
        async onClose(_connection, reason) {
          trace(`ICQ Channel closed. Reason: ${reason}`);
        },
        async onReceive(connection, bytes) {
          trace(`ICQ Channel onReceive`, connection, bytes);
          return '';
        },
      },
    },
  );

/** @typedef {ReturnType<ReturnType<typeof prepareQueryConnectionKit>>} QueryConnectionKit */
/** @typedef {QueryConnectionKit['connection']} QueryConnection */
