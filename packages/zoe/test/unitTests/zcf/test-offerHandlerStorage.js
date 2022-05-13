// @ts-check

// eslint-disable-next-line import/no-extraneous-dependencies
import { test } from '@agoric/zoe/tools/prepare-test-env-ava.js';
import { Far } from '@endo/marshal';

import { makeOfferHandlerStorage } from '../../../src/contractFacet/offerHandlerStorage.js';
import { makeHandle } from '../../../src/makeHandle.js';

test('offerHandlerStorage', async t => {
  const makeInvitationHandle = () => makeHandle('Invitation');
  const { storeOfferHandler, takeOfferHandler } =
    makeOfferHandlerStorage(makeInvitationHandle);

  const offerHandler = Far('offerHandler', () => {});
  const invitationHandle = storeOfferHandler(offerHandler);
  t.is(takeOfferHandler(invitationHandle), offerHandler);

  // Getting the offerHandler also deletes it for explicit GC, so trying to get
  // it twice errors.
  t.throws(() => takeOfferHandler(invitationHandle), {
    message: '"invitationHandle" not found: "[Alleged: InvitationHandle]"',
  });
});
