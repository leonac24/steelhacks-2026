import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

export type PlaidConfig = {
  clientId: string;
  secret: string;
  // Plaid's own environment name, not NODE_ENV.
  env: "sandbox" | "development" | "production";
};

export function createPlaidClient(config: PlaidConfig): PlaidApi {
  const configuration = new Configuration({
    basePath: PlaidEnvironments[config.env],
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": config.clientId,
        "PLAID-SECRET": config.secret,
      },
    },
  });
  return new PlaidApi(configuration);
}
