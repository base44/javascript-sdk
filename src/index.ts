import { createClient, createClientFromRequest, type Base44Client } from "./client.js";
import { Base44Error } from "./utils/axios-client.js";
import {
  getAccessToken,
  saveAccessToken,
  removeAccessToken,
  getLoginUrl,
} from "./utils/auth-utils.js";

export {
  createClient,
  createClientFromRequest,
  Base44Error,
  getAccessToken,
  saveAccessToken,
  removeAccessToken,
  getLoginUrl,
};

export type { Base44Client };

export * from "./types.js";
export type { AuthMethods, LoginViaEmailPasswordResponse } from "./modules/auth.js";
