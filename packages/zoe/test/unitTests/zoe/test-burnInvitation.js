// @ts-check

// eslint-disable-next-line import/no-extraneous-dependencies
import { test } from '@agoric/zoe/tools/prepare-test-env-ava.js';

import { makeIssuerKit, AssetKind, AmountMath } from '@agoric/ertp';
import { makeScalarMap } from '@agoric/store';

import { burnInvitation } from '../../../src/zoeService/offer/burnInvitation.js';
import { defineDurableHandle } from '../../../src/makeHandle.js';

/** @type {MapStore<string,any>} */
const zcfBaggage = makeScalarMap('Invitation');
const makeInvitationHandle = defineDurableHandle(zcfBaggage, 'Invitation');
const makeInstanceHandle = defineDurableHandle(zcfBaggage, 'Instance');

test('burnInvitation', async t => {
  const mockInvitationKit = makeIssuerKit('mockInvitation', AssetKind.SET);
  const instanceHandle = makeInstanceHandle();
  const invitationHandle = makeInvitationHandle();
  const invitation = mockInvitationKit.mint.mintPayment(
    AmountMath.make(
      mockInvitationKit.brand,
      harden([{ instance: instanceHandle, handle: invitationHandle }]),
    ),
  );

  t.deepEqual(await burnInvitation(mockInvitationKit.issuer, invitation), {
    instanceHandle,
    invitationHandle,
  });
});

test('burnInvitation - not an invitation', async t => {
  const mockInvitationKit = makeIssuerKit('mockInvitation', AssetKind.SET);

  await t.throwsAsync(
    // @ts-expect-error invalid payment for the purposes of testing
    () => burnInvitation(mockInvitationKit.issuer, undefined),
    { message: 'A Zoe invitation is required, not "[undefined]"' },
  );
});

test('burnInvitation - invitation already used', async t => {
  const mockInvitationKit = makeIssuerKit('mockInvitation', AssetKind.SET);

  const instanceHandle = makeInstanceHandle();
  const invitationHandle = makeInvitationHandle();

  const invitation = mockInvitationKit.mint.mintPayment(
    AmountMath.make(
      mockInvitationKit.brand,
      harden([{ instance: instanceHandle, handle: invitationHandle }]),
    ),
  );

  t.deepEqual(await burnInvitation(mockInvitationKit.issuer, invitation), {
    instanceHandle,
    invitationHandle,
  });

  await t.throwsAsync(
    () => burnInvitation(mockInvitationKit.issuer, invitation),
    {
      message:
        'A Zoe invitation is required, not "[Alleged: mockInvitation payment]"',
    },
  );
});

test('burnInvitation - multiple invitations', async t => {
  const mockInvitationKit = makeIssuerKit('mockInvitation', AssetKind.SET);

  const instanceHandle = makeInstanceHandle();
  const invitationHandle1 = makeInvitationHandle();
  const invitationHandle2 = makeInvitationHandle();

  const invitations = mockInvitationKit.mint.mintPayment(
    AmountMath.make(
      mockInvitationKit.brand,
      harden([
        { instance: instanceHandle, handle: invitationHandle1 },
        { instance: instanceHandle, handle: invitationHandle2 },
      ]),
    ),
  );

  await t.throwsAsync(
    () => burnInvitation(mockInvitationKit.issuer, invitations),
    {
      message: 'Only one invitation can be redeemed at a time',
    },
  );
});
