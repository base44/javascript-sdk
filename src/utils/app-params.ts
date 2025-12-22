import { isBrowser } from './common';

const toSnakeCase = (str: string) => {
	return str.replace(/([A-Z])/g, '_$1').toLowerCase();
}

const getAppParamValue = (
    paramName: string,
    { defaultValue = undefined, removeFromUrl = false }: { defaultValue?: any, removeFromUrl?: boolean } = {}
) => {
	const storageKey = `base44_${toSnakeCase(paramName)}`;
	const urlParams = new URLSearchParams(window.location.search);
	const searchParam = urlParams.get(paramName);

	if (removeFromUrl) {
		urlParams.delete(paramName);
		const newUrl = `${window.location.pathname}${urlParams.toString() ? `?${urlParams.toString()}` : ""
			}${window.location.hash}`;
		window.history.replaceState({}, document.title, newUrl);
	}

	if (searchParam) {
		localStorage.setItem(storageKey, searchParam);
		return searchParam;
	}

	if (defaultValue) {
		localStorage.setItem(storageKey, defaultValue);
		return defaultValue;
	}

	const storedValue = localStorage.getItem(storageKey);

	if (storedValue) {
		return storedValue;
	}

	return null;
}

const getAppParams = () => {
	if (!isBrowser) {
		return {};
	}

	if (getAppParamValue("clear_access_token") === 'true') {
		localStorage.removeItem('base44_access_token');
		localStorage.removeItem('token');
	}

	return {
		appId: getAppParamValue("app_id"),
		token: getAppParamValue("access_token", { removeFromUrl: true }),
		fromUrl: getAppParamValue("from_url", { defaultValue: window.location.href }),
		functionsVersion: getAppParamValue("functions_version", { defaultValue: import.meta.env.VITE_BASE44_FUNCTIONS_VERSION }),
	}
}


export const appParams = getAppParams()
