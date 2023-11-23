/*

 Converts a int, mongoId or an UUID to a hash and converts back to the original value.
 You can inform a different salt to have different values, to avoid collisions on same application

*/

const ALPHABET = 'abcdfghjklmnpqrstuvwxyz0123456789BCDFGHJKLMNPQRSTUVWXYZ';
const BASE = ALPHABET.length;
const MAXLEN = 4;
const MAX_BIGINT = 2n ** (64n - 1n) - 1n; // big int number

const shiftSalt = (salt = 'lexai') => {
  let qty = 0;
  const minLength = salt.length;
  for (let i = 0; i < minLength; i += 1) {
    qty += salt.charCodeAt(i);
  }

  return qty % BASE;
};

const shiftAlphabet = (salt = 'lexai') => {
  const shift = shiftSalt(salt);

  return (ALPHABET + ALPHABET).slice(shift, BASE + shift);
};

const randomId = (salt = 'lexai', minLength = MAXLEN) => {
  return fromInt(Date.now(), salt, minLength);
};

const fromInt = (number = null, salt = 'lexai', minLength = MAXLEN) => {
  if (number === null) {
    return randomId(salt);
  } else if (minLength < 2) {
    throw Error('Minimum lenght should be 2');
  } else if (minLength > 12) {
    throw Error('Maximum lenght should be 12');
  } else if (typeof number !== 'bigint' && isNaN(number)) {
    throw Error('Informed number is not a number');
  } else if (isNaN(minLength)) {
    throw Error('Informed minLength is not a number');
  }

  // the control character will take 1 unit of minLength
  minLength -= 1;

  const baseBig = BigInt(BASE);

  number = BigInt(number) + baseBig ** BigInt(minLength - 1);
  if (number > MAX_BIGINT) {
    throw Error(`Informed number is greater than the maximum allowed of ${MAX_BIGINT}`);
  }

  const alphabet = shiftAlphabet(salt);

  const text = [];
  while (number > 1) {
    let index = number % baseBig;
    text.push(alphabet[index]);
    number = number / baseBig;
  }
  text.push(alphabet[number % baseBig]);

  const output = text.join('');
  const signature = alphabet[shiftSalt(output)];

  return `${output}${signature}`;
};

const toInt = (text, salt = 'lexai', minLength = MAXLEN) => {
  if (typeof salt !== 'string') {
    throw Error('salt cannot be empty');
  }

  const textLen = text.length;
  const alphabet = shiftAlphabet(salt);
  const validator = text.slice(-1);
  text = text.slice(0, -1);

  const signature = alphabet[shiftSalt(text)];

  if (validator !== signature) {
    throw Error('Informed hash is not valid');
  }

  text = text.split('');
  text.reverse();

  let size = textLen - 2;
  let sum = BigInt(-1 * Math.pow(BASE, minLength - 2));
  text.forEach((letter) => {
    const pow = BigInt(Math.pow(BASE, size));
    index = BigInt(alphabet.indexOf(letter));
    sum += index * pow;
    size -= 1;
  });

  return Number(sum);
};

const fromMongoDBId = (mongoId, salt = 'lexai') => {
  if (mongoId.length != 24) {
    throw Error('Informed id is not a MongoDB ObjectId');
  }

  const p1 = BigInt(`0x${mongoId.slice(0, 12)}`);
  const p2 = BigInt(`0x${mongoId.slice(12)}`);

  return fromInt(p1, salt) + fromInt(p2, salt);
};

const toMongoDBId = (text, salt = 'lexai') => {
  const p1 = text.slice(0, text.length / 2);
  const p2 = text.slice(p1.length);

  return toInt(p1, salt).toString(16) + toInt(p2, salt).toString(16);
};

const fromUUID = (uuid, salt = 'lexai') => {
  uuid = uuid.replace(/-/g, '');

  const size = 8;
  const parts = [];
  while (parts.length < 4) {
    parts.push(fromInt(BigInt(`0x${uuid.slice(size * parts.length, size * (parts.length + 1))}`), salt, size));
  }

  return parts.reduce((partialSum, a) => partialSum + a, '');
};

const toUUID = (text, salt = 'lexai') => {
  const size = 8;
  const parts = [];
  while (parts.length < 4) {
    parts.push(toInt(text.slice(size * parts.length, size * (parts.length + 1)), salt, size).toString(16));
  }

  const hex = parts.reduce((partialSum, a) => partialSum + a, '');

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

module.exports = {
  randomId,
  toInt,
  fromInt,
  fromMongoDBId,
  toMongoDBId,
  fromUUID,
  toUUID
};
