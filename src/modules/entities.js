/**
 * Creates the entities module for the Base44 SDK
 * @param {import('axios').AxiosInstance} axios - Axios instance
 * @param {string|number} appId - Application ID
 * @returns {Object} Entities module
 */
export function createEntitiesModule(axios, appId) {
  // Using Proxy to dynamically handle entity names
  return new Proxy({}, {
    get(target, entityName) {
      // Don't create handlers for internal properties
      if (typeof entityName !== 'string' || entityName === 'then' || entityName.startsWith('_')) {
        return undefined;
      }

      // Create entity handler
      return createEntityHandler(axios, appId, entityName);
    }
  });
}

/**
 * Creates a handler for a specific entity
 * @param {import('axios').AxiosInstance} axios - Axios instance
 * @param {string|number} appId - Application ID
 * @param {string} entityName - Entity name
 * @returns {Object} Entity handler with CRUD methods
 */
function createEntityHandler(axios, appId, entityName) {
  const baseURL = `/apps/${appId}/entities/${entityName}`;

  return {
    /**
     * List entities with optional pagination and sorting
     * @param {string} [sort] - Sort parameter
     * @param {number} [limit] - Limit results
     * @param {number} [skip] - Skip results (pagination)
     * @param {string[]} [fields] - Fields to include
     * @returns {Promise<Array>} List of entities
     */
    async list(sort, limit, skip, fields) {
      const params = {};
      if (sort) params.sort = sort;
      if (limit) params.limit = limit;
      if (skip) params.skip = skip;
      if (fields) params.fields = Array.isArray(fields) ? fields.join(',') : fields;

      return axios.get(baseURL, { params });
    },

    /**
     * Filter entities based on query
     * @param {Object} query - Filter query
     * @param {string} [sort] - Sort parameter
     * @param {number} [limit] - Limit results
     * @param {number} [skip] - Skip results (pagination)
     * @param {string[]} [fields] - Fields to include
     * @returns {Promise<Array>} Filtered entities
     */
    async filter(query, sort, limit, skip, fields) {
      const params = {
        q: JSON.stringify(query),
      };
      
      if (sort) params.sort = sort;
      if (limit) params.limit = limit;
      if (skip) params.skip = skip;
      if (fields) params.fields = Array.isArray(fields) ? fields.join(',') : fields;

      return axios.get(baseURL, { params });
    },

    /**
     * Get entity by ID
     * @param {string} id - Entity ID
     * @returns {Promise<Object>} Entity
     */
    async get(id) {
      return axios.get(`${baseURL}/${id}`);
    },

    /**
     * Create new entity
     * @param {Object} data - Entity data
     * @returns {Promise<Object>} Created entity
     */
    async create(data) {
      return axios.post(baseURL, data);
    },

    /**
     * Update entity by ID
     * @param {string} id - Entity ID
     * @param {Object} data - Updated entity data
     * @returns {Promise<Object>} Updated entity
     */
    async update(id, data) {
      return axios.put(`${baseURL}/${id}`, data);
    },

    /**
     * Delete entity by ID
     * @param {string} id - Entity ID
     * @returns {Promise<void>}
     */
    async delete(id) {
      return axios.delete(`${baseURL}/${id}`);
    },

    /**
     * Delete multiple entities based on query
     * @param {Object} query - Delete query
     * @returns {Promise<void>}
     */
    async deleteMany(query) {
      return axios.delete(baseURL, { data: query });
    },

    /**
     * Create multiple entities in a single request
     * @param {Array} data - Array of entity data
     * @returns {Promise<Array>} Created entities
     */
    async bulkCreate(data) {
      return axios.post(`${baseURL}/bulk`, data);
    },

    /**
     * Import entities from a file
     * @param {File} file - File to import
     * @returns {Promise<Object>} Import result
     */
    async importEntities(file) {
      const formData = new FormData();
      formData.append('file', file, file.name);
      
      return axios.post(`${baseURL}/import`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
    }
  };
} 