import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';

export const buildRootObject = () => {
  let vatAdmin;
  let ertpRoot;
  let ertpAdmin;
  let issuerKitA;
  let issuerKitB;

  return Far('root', {
    bootstrap: async (vats, devices) => {
      vatAdmin = await E(vats.vatAdmin).createVatAdminService(devices.vatAdmin);
    },

    buildV1: async () => {
      // build the contract vat from ZCF and the contract bundlecap
      const bcap = await E(vatAdmin).getNamedBundleCap('ertpService');
      const res = await E(vatAdmin).createVat(bcap);
      ertpRoot = res.root;
      ertpAdmin = res.adminNode;
      const ertpService = await E(ertpRoot).getErtpService();

      issuerKitA = await E(ertpService).makeIssuerKit('A');
      issuerKitB = await E(ertpService).makeIssuerKit('B');
      // make purses wiht non-zero balances
      // hold onto a payment here.
      return true;
    },

    upgradeV2: async () => {
      const bcap = await E(vatAdmin).getNamedBundleCap('ertpService');
      await E(ertpAdmin).upgrade(bcap);
      // exercise purses
      // deposit a payment from earlier
      return true;
    },
  });
};
