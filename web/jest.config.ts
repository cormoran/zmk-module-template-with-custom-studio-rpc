import type { JestConfigWithTsJest } from "ts-jest";

const config: JestConfigWithTsJest = {
  testEnvironment: "jsdom",
  // jest cannot resolve package.json "exports" field correctly yet
  moduleNameMapper: {
    // Mock CSS imports
    "\\.(css|less|scss|sass)$": "identity-obj-proxy",
    "^@zmkfirmware/zmk-studio-ts-client$":
      "<rootDir>/node_modules/@zmkfirmware/zmk-studio-ts-client/lib/index.js",
    "^@zmkfirmware/zmk-studio-ts-client/(.*)$":
      "<rootDir>/node_modules/@zmkfirmware/zmk-studio-ts-client/lib/$1.js",
    "^@cormoran/zmk-studio-react-hook/testing$":
      "<rootDir>/node_modules/@cormoran/zmk-studio-react-hook/lib/testing/index.js",
    "^@cormoran/zmk-studio-react-hook$":
      "<rootDir>/node_modules/@cormoran/zmk-studio-react-hook/lib/index.js",
  },
  // Transform ESM packages - note the patterns here
  transformIgnorePatterns: ["node_modules/(?!(@cormoran|@zmkfirmware)/)"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        useESM: true,
        tsconfig: {
          jsx: "react-jsx",
          esModuleInterop: true,
          isolatedModules: true,
          moduleResolution: "bundler",
          baseUrl: ".",
          paths: {
            "@cormoran/zmk-studio-react-hook/testing": [
              "./node_modules/@cormoran/zmk-studio-react-hook/lib/testing/index.d.ts",
            ],
          },
        },
      },
    ],
    // Also transform node_modules ESM packages
    "node_modules/.+\\.js$": [
      "ts-jest",
      {
        useESM: true,
      },
    ],
  },
  testMatch: ["**/test/**/*.spec.ts", "**/test/**/*.spec.tsx"],
};

export default config;
