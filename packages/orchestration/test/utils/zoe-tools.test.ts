import { test } from '@agoric/zoe/tools/prepare-test-env-ava.js';

import { setUpZoeForTest } from '@agoric/zoe/tools/setup-zoe.js';
import { E } from '@endo/far';
import path from 'path';
import { makeIssuerKit } from '@agoric/ertp';
import { withAmountUtils } from '@agoric/zoe/tools/test-utils.js';
import { commonSetup } from '../supports.js';

const dirname = path.dirname(new URL(import.meta.url).pathname);

const contractName = 'zoeTools';
const contractFile = `${dirname}/../../test/fixtures/${contractName}.contract.js`;
type StartFn = typeof import('../../test/fixtures/zoeTools.contract.js').start;

test('zoeTool.localTransfer and zoeTools.withdrawToSeat', async t => {
  t.log('bootstrap, orchestration core-eval');
  const {
    bootstrap,
    commonPrivateArgs,
    brands: { ist, bld },
    utils: { pourPayment },
  } = await commonSetup(t);
  const vt = bootstrap.vowTools;

  const moolah = withAmountUtils(makeIssuerKit('MOO'));
  t.log('Making Moolah issuer kit', moolah);

  t.log('contract coreEval', contractName);
  const { zoe, bundleAndInstall } = await setUpZoeForTest();
  const installation: Installation<StartFn> =
    await bundleAndInstall(contractFile);

  const issuerKeywordRecord = harden({
    IST: ist.issuer,
    BLD: bld.issuer,
    MOO: moolah.issuer,
  });
  t.log('issuerKeywordRecord', issuerKeywordRecord);

  const storageNode = await E(bootstrap.storage.rootNode).makeChildNode(
    contractName,
  );
  const sendKit = await E(zoe).startInstance(
    installation,
    issuerKeywordRecord,
    {},
    { ...commonPrivateArgs, storageNode },
  );

  t.log('make a localAccount to receive bank sends');
  const publicFacet = await E(zoe).getPublicFacet(sendKit.instance);
  const lcaSeat = await E(zoe).offer(E(publicFacet).makeLocalAccount());
  const lca = await vt.when(E(lcaSeat).getOfferResult());
  const destAddr = await E(lca).getAddress();

  t.log('zoeTools.localTransfer recovers when presented non-vbank asset');
  {
    const tenMoolah = moolah.make(10n);
    const MOO = await E(moolah.mint).mintPayment(tenMoolah);
    console.log('MOO', MOO);
    const userSeat = await E(zoe).offer(
      E(publicFacet).makeDepositSendInvitation(),
      { give: { MOO: tenMoolah } },
      { MOO },
      {
        destAddr,
      },
    );
    await t.throwsAsync(vt.when(E(userSeat).getOfferResult()), {
      message:
        'One or more deposits to LCA failed. ["[Error: key \\"[Alleged: MOO brand]\\" not found in collection \\"brandToAssetRecord\\"]"]',
    });
  }

  t.log('zoeTools.localTransfer recovers from: give: { IST, MOO } ');
  {
    const tenMoolah = moolah.make(10n);
    const MOO = await E(moolah.mint).mintPayment(tenMoolah);
    const tenStable = ist.make(10n);
    const IST = await pourPayment(tenStable);
    console.log('pmtKwr', { MOO, IST });
    const userSeat = await E(zoe).offer(
      E(publicFacet).makeDepositSendInvitation(),
      { give: { IST: tenStable, MOO: tenMoolah } },
      { IST, MOO },
      {
        destAddr,
      },
    );
    await t.throwsAsync(vt.when(E(userSeat).getOfferResult()), {
      message:
        'One or more deposits to LCA failed. ["[Error: key \\"[Alleged: MOO brand]\\" not found in collection \\"brandToAssetRecord\\"]"]',
    });
  }
  t.log('zoeTools.localTransfer recovers from: give: { BLD, MOO, IST } ');
  {
    const tenMoolah = moolah.make(10n);
    const MOO = await E(moolah.mint).mintPayment(tenMoolah);
    const tenStable = ist.make(10n);
    const IST = await pourPayment(tenStable);
    const tenStake = bld.make(10n);
    const BLD = await pourPayment(tenStake);
    console.log('pmtKwr', { BLD, MOO, IST });
    const userSeat = await E(zoe).offer(
      E(publicFacet).makeDepositSendInvitation(),
      { give: { BLD: tenStake, MOO: tenMoolah, IST: tenStable } },
      { BLD, MOO, IST },
      {
        destAddr,
      },
    );
    await t.throwsAsync(vt.when(E(userSeat).getOfferResult()), {
      message:
        'One or more deposits to LCA failed. ["[Error: key \\"[Alleged: MOO brand]\\" not found in collection \\"brandToAssetRecord\\"]"]',
    });
  }
  t.log('zoeTools.localTransfer recovers from: give: { BLD, IST } ');
  {
    const tenStable = ist.make(10n);
    const IST = await pourPayment(tenStable);
    const tenStake = bld.make(10n);
    const BLD = await pourPayment(tenStake);
    console.log('pmtKwr', { BLD, IST });
    const userSeat = await E(zoe).offer(
      E(publicFacet).makeDepositSendInvitation(),
      { give: { BLD: tenStake, IST: tenStable } },
      { BLD, IST },
      {
        destAddr,
      },
    );
    await t.throwsAsync(vt.when(E(userSeat).getOfferResult()), {
      message: 'IBC Transfer failed "[Error: Brands not currently supported.]"',
    });
  }
});

test.todo('withdrawToSeat, unknown brand');
