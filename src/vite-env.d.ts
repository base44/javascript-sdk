/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_BASE44_APP_ID?: string;
	readonly VITE_BASE44_BACKEND_URL?: string;
	readonly VITE_BASE44_FUNCTIONS_VERSION?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
