import './types.js';
import { q, Fail } from '@agoric/assert';
import { AmountMath } from '@agoric/ertp';
import { assertRecord } from '@endo/marshal';
import { isNat } from '@endo/nat';

import { natSafeMath } from './safeMath.js';

const {
  multiply,
  floorDivide,
  ceilDivide,
  bankersDivide,
  add,
  subtract,
  exponentiate,
} = natSafeMath;

// make a Ratio, which represents a fraction. It is a pass-by-copy record.
//
// The natural syntax for the most common operations we want to support
// are Amount * Ratio and Amount / Ratio. Since the operations want to adhere to
// the ratio rather than the amount, we settled on a calling convention of
// [ceil|floor]MultiplyBy(Amount, Ratio) and [ceil|floor]DivideBy(Amount, Ratio)
//
// The most common kind of Ratio can be applied to Amounts of a particular
// brand, and produces results of the same brand. This represents a multiplier
// that is only applicable to that brand. The less common kind of Ratio can be
// applied to one particular brand of amounts, and produces results of another
// particular brand. This represents some kind of exchange rate. The
// brand-checking helps us ensure that normal Ratios aren't applied to amounts
// of the wrong brand, and that exchange rates are only used in the appropriate
// direction.
//
// Since the ratios are represented by a numerator and a denominator, every
// multiplication or division operation that produces an amount ends with a
// division of the underlying bigints, and integer division requires a mode
// of [rounding to integer](https://en.wikipedia.org/wiki/Rounding#Rounding_to_integer).
// Because `Ratio` only work with Natural numbers, just three modes suffice:
//   - floor rounds down
//   - ceil rounds up
//   - default (without prefix) minimizes bias by rounding half to even

const PERCENT = 100n;

const ratioPropertyNames = ['numerator', 'denominator'];

export const assertIsRatio = ratio => {
  assertRecord(ratio, 'ratio');
  const keys = Object.keys(ratio);
  keys.length === 2 || Fail`Ratio ${ratio} must be a record with 2 fields.`;
  for (const name of keys) {
    ratioPropertyNames.includes(name) ||
      Fail`Parameter must be a Ratio record, but ${ratio} has ${q(name)}`;
  }
  const numeratorValue = ratio.numerator.value;
  const denominatorValue = ratio.denominator.value;
  isNat(numeratorValue) ||
    Fail`The numerator value must be a NatValue, not ${numeratorValue}`;
  isNat(denominatorValue) ||
    Fail`The denominator value must be a NatValue, not ${denominatorValue}`;
};

/**
 * @param {bigint} numerator
 * @param {Brand} numeratorBrand
 * @param {bigint} [denominator] The default denominator is 100
 * @param {Brand} [denominatorBrand] The default is to reuse the numeratorBrand
 * @returns {Ratio}
 */
export const makeRatio = (
  numerator,
  numeratorBrand,
  denominator = PERCENT,
  denominatorBrand = numeratorBrand,
) => {
  denominator > 0n ||
    Fail`No infinite ratios! Denominator was 0 ${q(denominatorBrand)}`;

  // @ts-expect-error cast to return type because make() ensures
  return harden({
    numerator: AmountMath.make(numeratorBrand, numerator),
    denominator: AmountMath.make(denominatorBrand, denominator),
  });
};

/**
 * @param {Amount} numeratorAmount
 * @param {Amount} denominatorAmount
 * @returns {Ratio}
 */
export const makeRatioFromAmounts = (numeratorAmount, denominatorAmount) => {
  AmountMath.coerce(numeratorAmount.brand, numeratorAmount);
  AmountMath.coerce(denominatorAmount.brand, denominatorAmount);
  return makeRatio(
    // @ts-expect-error value can be any AmountValue but makeRatio() supports only bigint
    numeratorAmount.value,
    numeratorAmount.brand,
    denominatorAmount.value,
    denominatorAmount.brand,
  );
};

/**
 * @param {Amount<'nat'>} amount
 * @param {Ratio} ratio
 * @param {*} divideOp
 */
const multiplyHelper = (amount, ratio, divideOp) => {
  AmountMath.coerce(amount.brand, amount);
  assertIsRatio(ratio);
  amount.brand === ratio.denominator.brand ||
    Fail`amount's brand ${q(amount.brand)} must match ratio's denominator ${q(
      ratio.denominator.brand,
    )}`;

  return AmountMath.make(
    ratio.numerator.brand,
    divideOp(
      multiply(amount.value, ratio.numerator.value),
      ratio.denominator.value,
    ),
  );
};

/** @type {ScaleAmount} */
export const floorMultiplyBy = (amount, ratio) => {
  return multiplyHelper(amount, ratio, floorDivide);
};

/** @type {ScaleAmount} */
export const ceilMultiplyBy = (amount, ratio) => {
  return multiplyHelper(amount, ratio, ceilDivide);
};

/** @type {ScaleAmount} */
export const multiplyBy = (amount, ratio) => {
  return multiplyHelper(amount, ratio, bankersDivide);
};

/**
 * @param {Amount<'nat'>} amount
 * @param {Ratio} ratio
 * @param {*} divideOp
 */
const divideHelper = (amount, ratio, divideOp) => {
  AmountMath.coerce(amount.brand, amount);
  assertIsRatio(ratio);
  amount.brand === ratio.numerator.brand ||
    Fail`amount's brand ${q(amount.brand)} must match ratio's numerator ${q(
      ratio.numerator.brand,
    )}`;

  return AmountMath.make(
    ratio.denominator.brand,
    divideOp(
      multiply(amount.value, ratio.denominator.value),
      ratio.numerator.value,
    ),
  );
};

/** @type {ScaleAmount} */
export const floorDivideBy = (amount, ratio) => {
  return divideHelper(amount, ratio, floorDivide);
};

/** @type {ScaleAmount} */
export const ceilDivideBy = (amount, ratio) => {
  return divideHelper(amount, ratio, ceilDivide);
};

/** @type {ScaleAmount} */
export const divideBy = (amount, ratio) => {
  return divideHelper(amount, ratio, bankersDivide);
};

/**
 * @param {Ratio} ratio
 * @returns {Ratio}
 */
export const invertRatio = ratio => {
  assertIsRatio(ratio);

  return makeRatio(
    /** @type {NatValue} */ (ratio.denominator.value),
    ratio.denominator.brand,
    /** @type {NatValue} */ (ratio.numerator.value),
    ratio.numerator.brand,
  );
};

/**
 * @param {Ratio} left
 * @param {Ratio} right
 * @returns {Ratio}
 */
export const addRatios = (left, right) => {
  assertIsRatio(right);
  assertIsRatio(left);
  left.numerator.brand === right.numerator.brand ||
    Fail`numerator brands must match: ${q(left)} ${q(right)}`;
  left.denominator.brand === right.denominator.brand ||
    Fail`denominator brands must match: ${q(left)} ${q(right)}`;

  // Simplifying the expression:
  //  (and + bnd) / y d**2
  //  (a + b) nd / y d**2
  //  ((a + b) n / y d) * (d / d)
  //  (a + b) n / yd
  return makeRatio(
    add(
      multiply(left.numerator.value, right.denominator.value), // a nd
      multiply(left.denominator.value, right.numerator.value), // b nd
    ), // (a + b) nd
    left.numerator.brand,
    multiply(left.denominator.value, right.denominator.value), // y d**2
    left.denominator.brand,
  );
};

/**
 * @param {Ratio} left
 * @param {Ratio} right
 * @returns {Ratio}
 */
export const subtractRatios = (left, right) => {
  assertIsRatio(right);
  assertIsRatio(left);
  left.numerator.brand === right.numerator.brand ||
    Fail`numerator brands must match: ${q(left)} ${q(right)}`;
  left.denominator.brand === right.denominator.brand ||
    Fail`denominator brands must match: ${q(left)} ${q(right)}`;

  return makeRatio(
    subtract(
      multiply(left.numerator.value, right.denominator.value), // a nd
      multiply(left.denominator.value, right.numerator.value), // b nd
    ), // (a - b) nd
    left.numerator.brand,
    multiply(left.denominator.value, right.denominator.value), // y d**2
    left.denominator.brand,
  );
};

/**
 * @param {Ratio} left
 * @param {Ratio} right
 * @returns {Ratio}
 */
export const multiplyRatios = (left, right) => {
  assertIsRatio(right);
  assertIsRatio(left);

  const getRemainingBrands = () => {
    // Prefer results that have the same brand as the left operand.
    if (right.numerator.brand === right.denominator.brand) {
      return [left.numerator.brand, left.denominator.brand];
    }
    if (right.numerator.brand === left.denominator.brand) {
      return [left.numerator.brand, right.denominator.brand];
    }
    if (left.numerator.brand === right.denominator.brand) {
      return [right.numerator.brand, left.denominator.brand];
    }
    if (left.numerator.brand === left.denominator.brand) {
      return [right.numerator.brand, right.denominator.brand];
    }
    throw Fail`at least one brand must cancel out: ${q(left)} ${q(right)}`;
  };

  const [numeratorBrand, denominatorBrand] = getRemainingBrands();
  return makeRatio(
    multiply(left.numerator.value, right.numerator.value),
    numeratorBrand,
    multiply(left.denominator.value, right.denominator.value),
    denominatorBrand,
  );
};

/**
 * If ratio is between 0 and 1, subtract from 1.
 *
 * @param {Ratio} ratio
 * @returns {Ratio}
 */
export const oneMinus = ratio => {
  assertIsRatio(ratio);
  ratio.numerator.brand === ratio.denominator.brand ||
    Fail`oneMinus only supports ratios with a single brand, but ${ratio.numerator.brand} doesn't match ${ratio.denominator.brand}`;
  ratio.numerator.value <= ratio.denominator.value ||
    Fail`Parameter must be less than or equal to 1: ${ratio.numerator.value}/${ratio.denominator.value}`;
  return makeRatio(
    subtract(ratio.denominator.value, ratio.numerator.value),
    ratio.numerator.brand,
    ratio.denominator.value,
    ratio.numerator.brand,
  );
};

/**
 * Add 1n to a ratio.
 *
 * @param {Ratio} ratio
 * @returns {Ratio}
 */
export const onePlus = ratio => {
  assertIsRatio(ratio);
  ratio.numerator.brand === ratio.denominator.brand ||
    Fail`onePlus only supports ratios with a single brand, but ${ratio.numerator.brand} doesn't match ${ratio.denominator.brand}`;
  return makeRatio(
    add(ratio.denominator.value, ratio.numerator.value),
    ratio.numerator.brand,
    ratio.denominator.value,
    ratio.numerator.brand,
  );
};

/**
 * @param {Ratio} left
 * @param {Ratio} right
 * @returns {boolean}
 */
export const ratioGTE = (left, right) => {
  if (left.numerator.brand === right.numerator.brand) {
    left.denominator.brand === right.denominator.brand ||
      Fail`numerator brands match, but denominator brands don't: ${q(left)} ${q(
        right,
      )}`;
  } else if (left.numerator.brand === left.denominator.brand) {
    right.numerator.brand === right.denominator.brand ||
      Fail`lefthand brands match, but righthand brands don't: ${q(left)} ${q(
        right,
      )}`;
  }
  return natSafeMath.isGTE(
    multiply(left.numerator.value, right.denominator.value),
    multiply(right.numerator.value, left.denominator.value),
  );
};

/**
 * True iff the ratios are the same values (equal or equivalant may return false)
 *
 * @param {Ratio} left
 * @param {Ratio} right
 * @returns {boolean}
 */
export const ratiosSame = (left, right) => {
  return (
    AmountMath.isEqual(left.numerator, right.numerator) &&
    AmountMath.isEqual(left.denominator, right.denominator)
  );
};

/**
 * Make an equivalant ratio with a new denominator
 *
 * @param {Ratio} ratio
 * @param {bigint} newDen
 * @returns {Ratio}
 */
export const quantize = (ratio, newDen) => {
  const oldDen = ratio.denominator.value;
  const oldNum = ratio.numerator.value;
  const newNum =
    newDen === oldDen ? oldNum : bankersDivide(oldNum * newDen, oldDen);
  return makeRatio(
    newNum,
    ratio.numerator.brand,
    newDen,
    ratio.denominator.brand,
  );
};

const NUMERIC_RE = /^(\d\d*)(?:\.(\d*))?$/;
/** @typedef {bigint | number | string} ParsableNumber */

/**
 * Create a ratio from a given numeric value.
 *
 * @param {ParsableNumber} numeric
 * @param {Brand} numeratorBrand
 * @param {Brand} [denominatorBrand]
 * @returns {Ratio}
 */
export const parseRatio = (
  numeric,
  numeratorBrand,
  denominatorBrand = numeratorBrand,
) => {
  const match = `${numeric}`.match(NUMERIC_RE);
  if (!match) {
    throw Fail`Invalid numeric data: ${numeric}`;
  }

  const [_, whole, part = ''] = match;
  return makeRatio(
    BigInt(`${whole}${part}`),
    numeratorBrand,
    10n ** BigInt(part.length),
    denominatorBrand,
  );
};

// eslint-disable-next-line jsdoc/require-returns-check
/**
 * @param {unknown} specimen
 * @returns {asserts specimen is ParsableNumber}
 */
export const assertParsableNumber = specimen => {
  const match = `${specimen}`.match(NUMERIC_RE);
  match || Fail`Invalid numeric data: ${specimen}`;
};

/**
 * Ratios might be greater or less than one.
 *
 * @param {Ratio} ratio
 * @returns {number}
 */
export const ratioToNumber = ratio => {
  const n = Number(ratio.numerator.value);
  const d = Number(ratio.denominator.value);
  return n / d;
};

/**
 * Raises the base ratio to the power of the exponent ratio, using Newton's
 * method.
 * The base ratio and exponent ratios should all have the same brand for their
 * numerators and denominators.
 *
 * @param {Ratio} base
 * @param {Ratio} exponent
 * @param {bigint} [precision]
 * @returns {Ratio}
 */
export const exponentiateRatiosNewton = (base, exponent, precision = 8n) => {
  assertIsRatio(base);
  assertIsRatio(exponent);
  isNat(precision) ||
    Fail`The precision value must be a NatValue, not ${precision}`;

  // Ensure all ratios are of a single brand
  base.numerator.brand === base.denominator.brand ||
    base.numerator.brand === exponent.numerator.brand ||
    base.denominator.brand === exponent.denominator.brand ||
    Fail`base and exponent ratios must have the same brand`;

  /**
   * Use Newton's method to calculate nth root of BigInt
   *
   * @param {bigint} base
   * @param {bigint} root
   * @returns {bigint}
   */
  const nthRoot = (base, root) => {
    if (base <= 0n) return 0n;
    const rootMinusOne = subtract(root, 1n);

    let xPrev = base;
    let xNext = bankersDivide(
      add(
        multiply(rootMinusOne, xPrev),
        bankersDivide(base, exponentiate(xPrev, rootMinusOne)),
      ),
      root,
    );
    while (xNext < xPrev) {
      xPrev = xNext;
      xNext = bankersDivide(
        add(
          multiply(rootMinusOne, xPrev),
          bankersDivide(base, exponentiate(xPrev, rootMinusOne)),
        ),
        root,
      );
    }
    return xPrev;
  };

  // Calculate baseNumerator^exponentNumerator and baseDenominator^exponentNumerator
  const baseNumeratorPowered = exponentiate(
    base.numerator.value,
    exponent.numerator.value,
  );
  const baseDenominatorPowered = exponentiate(
    base.denominator.value,
    exponent.numerator.value,
  );

  const nRoot = nthRoot(baseNumeratorPowered, exponent.denominator.value);
  const dRoot = nthRoot(baseDenominatorPowered, exponent.denominator.value);

  return quantize(
    makeRatio(nRoot, base.numerator.brand, dRoot, base.denominator.brand),
    10n ** precision,
  );
};

/**
 * Raises the base ratio to the power of the exponent ratio, using Binary
 * Search.
 * The base ratio and exponent ratios should all have the same brand for their
 * numerators and denominators.
 *
 * @param {Ratio} base
 * @param {Ratio} exponent
 * @param {bigint} [precision]
 * @returns {Ratio}
 */
export const exponentiateRatiosBinary = (base, exponent, precision = 8n) => {
  assertIsRatio(base);
  assertIsRatio(exponent);
  isNat(precision) ||
    Fail`The precision value must be a NatValue, not ${precision}`;

  // Ensure all ratios are of a single brand
  base.numerator.brand === base.denominator.brand ||
    base.numerator.brand === exponent.numerator.brand ||
    base.denominator.brand === exponent.denominator.brand ||
    Fail`base and exponent ratios must have the same brand`;

  /**
   * Approximate the dth root using binary search
   * @param {bigint} value
   * @param {bigint} root nth root
   * */
  const binaryRoot = (value, root) => {
    let low = 1n;
    let high = value;
    while (low <= high) {
      const mid = bankersDivide(add(low, high), 2n);
      const midPow = exponentiate(mid, root);
      if (midPow === value) {
        return mid;
      } else if (midPow < value) {
        low = add(mid, 1n);
      } else {
        high = subtract(mid, 1n);
      }
    }
    return low - 1n;
  };

  // Calculate baseNumerator^exponentNumerator and baseDenominator^exponentNumerator
  const baseNumeratorPowered = exponentiate(
    base.numerator.value,
    exponent.numerator.value,
  );
  const baseDenominatorPowered = exponentiate(
    base.denominator.value,
    exponent.numerator.value,
  );

  // Calculate the dth root of baseNumeratorPowered and baseDenominatorPowered
  const nRoot = binaryRoot(baseNumeratorPowered, exponent.denominator.value);
  const dRoot = binaryRoot(baseDenominatorPowered, exponent.denominator.value);

  return quantize(
    makeRatio(nRoot, base.numerator.brand, dRoot, base.denominator.brand),
    10n ** precision,
  );
};
