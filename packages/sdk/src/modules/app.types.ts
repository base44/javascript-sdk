/**
 * The app's visibility.
 *
 * You can set and manage the app's visibility in the app's dashboard or with the Base44 CLI [`visibility`](/developers/references/cli/commands/visibility) command. Learn more about [app visibility](/Setting-up-your-app/Managing-access#setting-your-app-visibility).
 *
 * <Note>
 * The CLI doesn't support `public_with_login`. To use it, change the app's visibility in the dashboard.
 * </Note>
 *
 * The following table shows the supported values and the visibility each one represents:
 *
 * | Value | Visibility |
 * | --- | --- |
 * | `private_with_login` | **Private**: Only [invited users](/Setting-up-your-app/Managing-access#inviting-users-to-your-app) |
 * | `workspace_with_login` | **Workspace**: Users in your Base44 [workspace](/documentation/account-and-billing/about-workspaces) |
 * | `public_with_login` | **Public (login required)**: Visitors with a Base44 account |
 * | `public_without_login` | **Public (no login)**: Anyone |
 */
export type AppPublicSettings =
  | "private_with_login"
  | "public_with_login"
  | "public_without_login"
  | "workspace_with_login"
  | string;

/**
 * The app's public settings.
 */
export interface AppPublicSettingsResponse {
  /** The app's ID. */
  id: string;
  /**
   * The app's visibility.
   *
   * Returns the value saved in the app's settings.
   *
   * <Note>
   * If your workspace [enforces SSO for apps](/Enterprise/Enterprise-SSO-and-app-visibility), apps set to `public_without_login` also require sign-in. Visitors who aren't signed in get the `auth_required` error.
   * </Note>
   */
  public_settings: AppPublicSettings;
}

/**
 * App module for reading an app's public settings, including its visibility.
 *
 * Use it to read the app's visibility and determine whether the current visitor can access the app.
 * If the app requires login, use `redirectToLogin()` from the {@link AuthModule | auth module} to send the visitor to the login page.
 *
 * Learn more about [app visibility](/Setting-up-your-app/Managing-access#setting-your-app-visibility).
 *
 * ## Authentication modes
 *
 * You can use this module with a client in any authentication mode. The client sends its token, if it has one, with the request.
 */
export interface AppModule {
  /**
   * Retrieves the app's public settings.
   *
   * Rejects with a {@linkcode Base44Error} that has a `status` of `403` when the visitor can't access the app.
   * Check `data.extra_data.reason` to find the cause:
   * - `auth_required`: The visitor must sign in.
   * - `user_not_registered`: The visitor is signed in but doesn't have access.
   *
   * @returns Promise resolving to the app's ID and visibility.
   *
   * @example
   * ```typescript
   * // Redirect a visitor who isn't signed in
   * try {
   *   const { public_settings } = await base44.app.getPublicSettings();
   *   console.log('App visibility:', public_settings);
   * } catch (error) {
   *   if (error.status === 403 && error.data?.extra_data?.reason === 'auth_required') {
   *     base44.auth.redirectToLogin('<URL to return to after login>');
   *   }
   * }
   * ```
   */
  getPublicSettings(): Promise<AppPublicSettingsResponse>;
}

/**
 * @internal
 */
export interface AppMessageContent {
  content?: string;
  file_urls?: string[];
  custom_context?: unknown;
  additional_message_params?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * @internal
 */
export interface AppConversationMessage extends AppMessageContent {
  id?: string | null;
  role?: "user" | "assistant" | string;
}

/**
 * @internal
 */
export interface AppConversationLike {
  id?: string | null;
  messages?: AppMessageContent[] | null;
  model?: string;
  functions_fail_silently?: boolean;
}

/**
 * @internal
 */
export interface DenoProjectLike {
  project_id: string;
  project_name: string;
  app_id: string;
  deployment_name_to_info: Record<string, { id: string; code: string }>;
}

/**
 * @internal
 */
export interface AppLike {
  id?: string;
  conversation?: AppConversationLike | null;
  app_stage?: "pending" | "product_flows" | "ready" | string;
  created_date?: string;
  updated_date?: string;
  created_by?: string;
  organization_id?: string;
  name?: string;
  user_description?: string;
  entities?: Record<string, any>;
  additional_user_data_schema?: any;
  pages?: { [key: string]: string };
  components: { [key: string]: any };
  layout?: string;
  globals_css?: string;
  agents?: Record<string, any>;
  logo_url?: string;
  slug?: string;
  public_settings?: AppPublicSettings;
  is_blocked?: boolean;
  github_repo_url?: string;
  main_page?: string;
  installable_integrations?: any;
  backend_project?: DenoProjectLike;
  last_deployed_at?: string;
  is_remixable?: boolean;
  remixed_from_app_id?: string;
  hide_entity_created_by?: boolean;
  platform_version?: number;
  enable_username_password?: boolean;
  auth_config?: AuthConfigLike;
  status?: {
    state?: string;
    details?: any;
    last_updated_date?: string;
  };
  custom_instructions?: any;
  frozen_files?: string[];
  deep_coding_mode?: boolean;
  needs_to_add_diff?: boolean;
  installed_integration_context_items?: any[];
  model?: string;
  is_starred?: boolean;
  agents_enabled?: boolean;
  categories?: string[];
  functions?: any;
  function_names?: string[];
  user_entity?: UserEntityLike;
  app_code_hash?: string;
  has_backend_functions_enabled?: boolean;
}

/**
 * @internal
 */
export interface UserLike {
  id?: string | null;
}

/**
 * @internal
 */
export interface UserEntityLike {
  type: string;
  name: string;
  title?: string;
  properties?: {
    role?: {
      type?: string;
      description?: string;
      enum?: ("admin" | "user" | string)[];
    };
    email?: {
      type?: string;
      description?: string;
    };
    full_name?: {
      type?: string;
      description?: string;
    };
  };
  required: string[];
}

/**
 * @internal
 */
export interface AuthConfigLike {
  enable_username_password?: boolean;
  enable_google_login?: boolean;
  enable_microsoft_login?: boolean;
  enable_facebook_login?: boolean;
  sso_provider_name?: string;
  enable_sso_login?: boolean;
}

/**
 * @internal
 */
export type LoginInfoResponse = Pick<
  AppLike,
  | "id"
  | "name"
  | "slug"
  | "logo_url"
  | "user_description"
  | "updated_date"
  | "created_date"
  | "auth_config"
  | "platform_version"
>;
