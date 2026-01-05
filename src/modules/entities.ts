import { AxiosInstance } from "axios";
import { EntitiesModule, EntityHandler } from "./entities.types";

/**
 * Creates the entities module for the Base44 SDK.
 *
 * @param axios - Axios instance
 * @param appId - Application ID
 * @returns Entities module with dynamic entity access
 * @internal
 */
export function createEntitiesModule(
  axios: AxiosInstance,
  appId: string
): EntitiesModule {
  // Using Proxy to dynamically handle entity names
  return new Proxy(
    {},
    {
      get(target, entityName) {
        // Don't create handlers for internal properties
        if (
          typeof entityName !== "string" ||
          entityName === "then" ||
          entityName.startsWith("_")
        ) {
          return undefined;
        }

        // Create entity handler
        return createEntityHandler(axios, appId, entityName);
      },
    }
  ) as EntitiesModule;
}

/**
 * Creates a handler for a specific entity.
 *
 * @param axios - Axios instance
 * @param appId - Application ID
 * @param entityName - Entity name
 * @returns Entity handler with CRUD methods
 * @internal
 */
function createEntityHandler(
  axios: AxiosInstance,
  appId: string,
  entityName: string
): EntityHandler {
  const baseURL = `/apps/${appId}/entities/${entityName}`;
  const isDevMode = typeof window !== "undefined" 
    ? new URLSearchParams(window.location.search).get("use_staging_db") === "true"
    : false;
  const headers = { "X-Use-Staging-DB": String(isDevMode) };

  return {
    // List entities with optional pagination and sorting
    async list(sort: string, limit: number, skip: number, fields: string[]) {
      const params: Record<string, string | number> = {};
      if (sort) params.sort = sort;
      if (limit) params.limit = limit;
      if (skip) params.skip = skip;
      if (fields)
        params.fields = Array.isArray(fields) ? fields.join(",") : fields;

      return axios.get(baseURL, { params, headers });
    },

    // Filter entities based on query
    async filter(
      query: Record<string, any>,
      sort: string,
      limit: number,
      skip: number,
      fields: string[]
    ) {
      const params: Record<string, string | number> = {
        q: JSON.stringify(query),
      };

      if (sort) params.sort = sort;
      if (limit) params.limit = limit;
      if (skip) params.skip = skip;
      if (fields)
        params.fields = Array.isArray(fields) ? fields.join(",") : fields;

      return axios.get(baseURL, { params, headers });
    },

    // Get entity by ID
    async get(id: string) {
      return axios.get(`${baseURL}/${id}`, { headers });
    },

    // Create new entity
    async create(data: Record<string, any>) {
      return axios.post(baseURL, data, { headers });
    },

    // Update entity by ID
    async update(id: string, data: Record<string, any>) {
      return axios.put(`${baseURL}/${id}`, data, { headers });
    },

    // Delete entity by ID
    async delete(id: string) {
      return axios.delete(`${baseURL}/${id}`, { headers });
    },

    // Delete multiple entities based on query
    async deleteMany(query: Record<string, any>) {
      return axios.delete(baseURL, { data: query, headers });
    },

    // Create multiple entities in a single request
    async bulkCreate(data: Record<string, any>[]) {
      return axios.post(`${baseURL}/bulk`, data, { headers });
    },

    // Import entities from a file
    async importEntities(file: File) {
      const formData = new FormData();
      formData.append("file", file, file.name);

      return axios.post(`${baseURL}/import`, formData, {
        headers: {
          ...headers,
          "Content-Type": "multipart/form-data",
        },
      });
    },
  };
}
