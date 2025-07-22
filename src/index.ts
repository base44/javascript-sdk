import { createClient } from "./client.js";
import { Base44Error } from "./utils/axios-client.js";
import {
  getAccessToken,
  saveAccessToken,
  removeAccessToken,
  getLoginUrl,
} from "./utils/auth-utils.js";

export {
  createClient,
  Base44Error,
  // Export auth utilities for easier access
  getAccessToken,
  saveAccessToken,
  removeAccessToken,
  getLoginUrl,
};
