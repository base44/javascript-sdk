import { createClient, createClientFromRequest, type Base44Client } from "./client.js";
import { Base44Error } from "./utils/axios-client.js";
import {
  getAccessToken,
  saveAccessToken,
  removeAccessToken,
  getLoginUrl,
} from "./utils/auth-utils.js";
import { appParams } from "./utils/app-params.js";

export {
  createClient,
  createClientFromRequest,
  Base44Error,
  getAccessToken,
  saveAccessToken,
  removeAccessToken,
  getLoginUrl,
  appParams
};

export type { Base44Client };

export * from "./types.js";
