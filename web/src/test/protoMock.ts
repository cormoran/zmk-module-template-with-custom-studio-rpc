export const Request = {
  create: (value: unknown) => value,
  encode: () => ({
    finish: () => new Uint8Array(),
  }),
};

export const Response = {
  decode: () => ({}),
};
