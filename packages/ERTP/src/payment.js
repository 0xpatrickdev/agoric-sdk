// @ts-check

import { provide } from '@agoric/store';
import { defineDurableKind, makeKindHandle } from '@agoric/vat-data';

/**
 * @template {AssetKind} K
 * @param {MapStore<string,any>} issuerBaggage
 * @param {string} allegedName
 * @param {Brand<K>} brand
 * @returns {() => Payment<K>}
 */
export const defineDurablePaymentKind = (issuerBaggage, allegedName, brand) => {
  const paymentKindHandle = provide(issuerBaggage, 'paymentKindHandle', () =>
    makeKindHandle(`${allegedName} payment`),
  );
  const makePayment = defineDurableKind(paymentKindHandle, () => ({}), {
    getAllegedBrand: () => brand,
  });
  return makePayment;
};
harden(defineDurablePaymentKind);
