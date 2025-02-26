import { createClient } from './client';
import { Base44Error } from './utils/axios-client';
import { 
  getAccessToken, 
  saveAccessToken, 
  removeAccessToken, 
  getLoginUrl 
} from './utils/auth-utils';

export {
  createClient,
  Base44Error,
  // Export auth utilities for easier access
  getAccessToken,
  saveAccessToken,
  removeAccessToken,
  getLoginUrl
}; 