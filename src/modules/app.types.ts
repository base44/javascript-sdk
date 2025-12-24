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
  public_settings?:
    | "private_with_login"
    | "public_with_login"
    | "public_without_login"
    | "workspace_with_login"
    | string;
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
