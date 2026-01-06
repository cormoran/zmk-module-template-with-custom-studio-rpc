import { type JestConfigWithTsJest } from "ts-jest";

const config: JestConfigWithTsJest = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/src/test/setupTests.ts"],
  extensionsToTreatAsEsm: [".ts", ".tsx"],
  moduleNameMapper: {
    "\\.(css|less|scss)$": "<rootDir>/src/test/styleMock.ts",
    "^@cormoran/zmk-studio-react-hook$":
      "<rootDir>/node_modules/@cormoran/zmk-studio-react-hook/lib/index.js",
    "^@cormoran/zmk-studio-react-hook/testing$":
      "<rootDir>/node_modules/@cormoran/zmk-studio-react-hook/lib/testing/index.js",
    "^@zmkfirmware/zmk-studio-ts-client/transport/serial$":
      "<rootDir>/src/test/serialTransportMock.ts",
    "^@zmkfirmware/zmk-studio-ts-client$":
      "<rootDir>/src/test/zmkStudioClientMock.ts",
    "^\\./proto/zmk/template/custom$": "<rootDir>/src/test/protoMock.ts",
    "^@zmkfirmware/zmk-studio-ts-client/(.*)$":
      "<rootDir>/node_modules/@zmkfirmware/zmk-studio-ts-client/lib/$1.js",
  },
  transformIgnorePatterns: [
    "/node_modules/(?!@cormoran/zmk-studio-react-hook/)",
  ],
  transform: {
    "^.+\\.(t|j)sx?$": [
      "ts-jest",
      {
        useESM: true,
        tsconfig: "<rootDir>/tsconfig.test.json",
      },
    ],
  },
};

export default config;
