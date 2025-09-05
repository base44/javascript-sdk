# Base44 JavaScript SDK

A modern JavaScript SDK for interacting with the Base44 API. Designed to work with both JavaScript and TypeScript projects.

## Installation

```bash
npm install @base44/sdk
# or
yarn add @base44/sdk
```

## Usage

### Basic Setup

```javascript
import { createClient } from "@base44/sdk";

// Create a client instance
const base44 = createClient({
  serverUrl: "https://base44.app", // Optional, defaults to 'https://base44.app'
  appId: "your-app-id", // Required
  token: "your-user-token", // Optional, for user authentication
  serviceToken: "your-service-token", // Optional, for service role authentication
  autoInitAuth: true, // Optional, defaults to true - auto-detects tokens from URL or localStorage
});
```

### Working with Entities

```javascript
// List all products
const products = await base44.entities.Product.list();

// Filter products by category
const filteredProducts = await base44.entities.Product.filter({
  category: ["electronics", "computers"],
});

// Get a specific product
const product = await base44.entities.Product.get("product-id");

// Create a new product
const newProduct = await base44.entities.Product.create({
  name: "New Product",
  price: 99.99,
  category: "electronics",
});

// Update a product
const updatedProduct = await base44.entities.Product.update("product-id", {
  price: 89.99,
});

// Delete a product
await base44.entities.Product.delete("product-id");

// Bulk create products
const newProducts = await base44.entities.Product.bulkCreate([
  { name: "Product 1", price: 19.99 },
  { name: "Product 2", price: 29.99 },
]);
```

### Service Role Authentication

Service role authentication allows server-side applications to perform operations with elevated privileges. This is useful for administrative tasks, background jobs, and server-to-server communication.

```javascript
import { createClient } from "@base44/sdk";

// Create a client with service role token
const base44 = createClient({
  appId: "your-app-id",
  token: "user-token", // For user operations
  serviceToken: "service-token", // For service role operations
});

// User operations (uses user token)
const userEntities = await base44.entities.User.list();

// Service role operations (uses service token)
const allEntities = await base44.asServiceRole.entities.User.list();

// Service role has access to:
// - base44.asServiceRole.entities
// - base44.asServiceRole.integrations
// - base44.asServiceRole.functions
// Note: Service role does NOT have access to auth module for security

// If no service token is provided, accessing asServiceRole throws an error
const clientWithoutService = createClient({ appId: "your-app-id" });
try {
  await clientWithoutService.asServiceRole.entities.User.list();
} catch (error) {
  // Error: Service token is required to use asServiceRole
}
```

### Server-Side Usage

For server-side applications, you can create a client from incoming HTTP requests:

```javascript
import { createClientFromRequest } from "@base44/sdk";

// In your server handler (Express, Next.js, etc.)
app.get("/api/data", async (req, res) => {
  try {
    // Extract client configuration from request headers
    const base44 = createClientFromRequest(req);

    // Headers used:
    // - Authorization: Bearer <user-token>
    // - Base44-Service-Authorization: Bearer <service-token>
    // - Base44-App-Id: <app-id>
    // - Base44-Api-Url: <custom-api-url> (optional)

    // Use appropriate authentication based on available tokens
    let data;
    if (base44.asServiceRole) {
      // Service token available - use elevated privileges
      data = await base44.asServiceRole.entities.SensitiveData.list();
    } else {
      // Only user token available - use user permissions
      data = await base44.entities.PublicData.list();
    }

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### Working with Integrations

```javascript
// Send an email using the Core integration
const emailResult = await base44.integrations.Core.SendEmail({
  to: "user@example.com",
  subject: "Hello from Base44",
  body: "This is a test email sent via the Base44 SDK",
});

// Use a custom integration
const result = await base44.integrations.CustomPackage.CustomEndpoint({
  param1: "value1",
  param2: "value2",
});

// Upload a file
const fileInput = document.querySelector('input[type="file"]');
const file = fileInput.files[0];
const uploadResult = await base44.integrations.Core.UploadFile({
  file,
  metadata: { type: "profile-picture" },
});
```

## Authentication

The SDK provides comprehensive authentication capabilities to help you build secure applications.

### Creating an Authenticated Client

To create a client with authentication:

```javascript
import { createClient } from "@base44/sdk";
import { getAccessToken } from "@base44/sdk/utils/auth-utils";

// Create a client with authentication
const base44 = createClient({
  appId: "your-app-id",
  token: getAccessToken(), // Automatically retrieves token from localStorage or URL
});

// Check authentication status
const isAuthenticated = await base44.auth.isAuthenticated();
console.log("Authenticated:", isAuthenticated);

// Get current user information (requires authentication)
if (isAuthenticated) {
  const user = await base44.auth.me();
  console.log("Current user:", user);
}
```

### Login and Logout

```javascript
import { createClient } from "@base44/sdk";
import {
  getAccessToken,
  saveAccessToken,
  removeAccessToken,
} from "@base44/sdk/utils/auth-utils";

const base44 = createClient({ appId: "your-app-id" });

// Redirect to the login page
// This will redirect to: base44.app/login?from_url=http://your-app.com/dashboard&app_id=your-app-id
function handleLogin() {
  base44.auth.login("/dashboard");
}

// Handle successful login (on return from Base44 login)
function handleLoginReturn() {
  const token = getAccessToken();
  if (token) {
    console.log("Successfully logged in with token:", token);
    // The token is automatically saved to localStorage and removed from URL
  }
}

// Logout
function handleLogout() {
  removeAccessToken();
  window.location.href = "/login";
}
```

### Real-World Authentication Example (React)

Here's a complete example of implementing Base44 authentication in a React application:

```jsx
import React, { createContext, useContext, useEffect, useState } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { createClient } from "@base44/sdk";
import {
  getAccessToken,
  removeAccessToken,
} from "@base44/sdk/utils/auth-utils";

// Create AuthContext
const AuthContext = createContext(null);

// Auth Provider Component
function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [client] = useState(() =>
    createClient({
      appId: "your-app-id",
      token: getAccessToken(),
    })
  );

  useEffect(() => {
    async function loadUser() {
      try {
        const isAuth = await client.auth.isAuthenticated();
        if (isAuth) {
          const userData = await client.auth.me();
          setUser(userData);
        }
      } catch (error) {
        console.error("Authentication error:", error);
      } finally {
        setLoading(false);
      }
    }

    loadUser();
  }, [client]);

  const login = () => {
    client.auth.login(window.location.pathname);
  };

  const logout = () => {
    removeAccessToken();
    setUser(null);
    window.location.href = "/login";
  };

  return (
    <AuthContext.Provider value={{ user, loading, client, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// Custom hook to use auth context
function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

// Protected Route Component
function ProtectedRoute() {
  const { user, loading, login } = useAuth();
  const location = useLocation();

  // Check if we're returning from login with a token in URL
  useEffect(() => {
    const token = getAccessToken(); // This will save token from URL if present
    if (token && !user && !loading) {
      window.location.reload(); // Reload to apply the new token
    }
  }, [location, user, loading]);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    // If not authenticated, redirect to login
    login();
    return <div>Redirecting to login...</div>;
  }

  // If authenticated, render the child routes
  return <Outlet />;
}

// Dashboard Component (protected)
function Dashboard() {
  const { user, client, logout } = useAuth();
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadTodos() {
      try {
        // Load user-specific data using the SDK
        const items = await client.entities.Todo.filter({
          assignee: user.id,
        });
        setTodos(items);
      } catch (error) {
        console.error("Failed to load todos:", error);
      } finally {
        setLoading(false);
      }
    }

    loadTodos();
  }, [client, user]);

  return (
    <div>
      <h1>Welcome, {user.name}!</h1>
      <button onClick={logout}>Logout</button>

      <h2>Your Todos</h2>
      {loading ? (
        <div>Loading todos...</div>
      ) : (
        <ul>
          {todos.map((todo) => (
            <li key={todo.id}>{todo.title}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Login Page
function LoginPage() {
  const { login, user } = useAuth();

  if (user) {
    return <Navigate to="/dashboard" />;
  }

  return (
    <div>
      <h1>Login Required</h1>
      <button onClick={login}>Login with Base44</button>
    </div>
  );
}

// App Component
function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/profile" element={<ProfilePage />} />
          {/* Add more protected routes here */}
        </Route>
        <Route path="/" element={<Navigate to="/dashboard" />} />
      </Routes>
    </AuthProvider>
  );
}
```

## TypeScript Support

This SDK includes TypeScript definitions out of the box:

```typescript
import { createClient, Base44Error } from "@base44/sdk";
import type { Entity, Base44Client, AuthModule } from "@base44/sdk";

// Create a typed client
const base44: Base44Client = createClient({
  appId: "your-app-id",
});

// Using the entities module with type safety
async function fetchProducts() {
  try {
    const products: Entity[] = await base44.entities.Product.list();
    console.log(products.map((p) => p.name));

    const product: Entity = await base44.entities.Product.get("product-id");
    console.log(product.name);
  } catch (error) {
    if (error instanceof Base44Error) {
      console.error(`Error ${error.status}: ${error.message}`);
    }
  }
}

// Service role operations with TypeScript
async function adminOperations() {
  const base44 = createClient({
    appId: "your-app-id",
    serviceToken: "service-token",
  });

  // TypeScript knows asServiceRole requires a service token
  try {
    const allUsers: Entity[] = await base44.asServiceRole.entities.User.list();
    console.log(`Total users: ${allUsers.length}`);
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message); // Service token is required to use asServiceRole
    }
  }
}

// Authentication with TypeScript
async function handleAuth(auth: AuthModule) {
  // Check authentication
  const isAuthenticated: boolean = await auth.isAuthenticated();

  if (isAuthenticated) {
    // Get user info
    const user: Entity = await auth.me();
    console.log(`Logged in as: ${user.name}, Role: ${user.role}`);

    // Update user
    const updatedUser: Entity = await auth.updateMe({
      preferences: { theme: "dark" },
    });
  } else {
    // Redirect to login
    auth.login("/dashboard");
  }
}

// Execute with proper typing
handleAuth(base44.auth);
```

### Advanced TypeScript Usage

You can define your own entity interfaces for better type safety:

```typescript
// Define custom entity interfaces
interface User extends Entity {
  name: string;
  email: string;
  role: "admin" | "editor" | "viewer";
  preferences?: {
    theme: "light" | "dark";
    notifications: boolean;
  };
}

interface Product extends Entity {
  name: string;
  price: number;
  category: string;
  inStock: boolean;
}

// Use your custom interfaces with the SDK
async function getLoggedInUser(): Promise<User | null> {
  const base44 = createClient({ appId: "your-app-id" });

  try {
    const user = (await base44.auth.me()) as User;
    return user;
  } catch (error) {
    console.error("Failed to get user:", error);
    return null;
  }
}

// Use with React hooks
function useBase44User() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const base44 = createClient({ appId: "your-app-id" });

    async function fetchUser() {
      try {
        const userData = (await base44.auth.me()) as User;
        setUser(userData);
      } catch (error) {
        console.error("Auth error:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchUser();
  }, []);

  return { user, loading };
}
```

## Error Handling

The SDK provides a custom `Base44Error` class for error handling:

```javascript
import { createClient, Base44Error } from "@base44/sdk";

const base44 = createClient({ appId: "your-app-id" });

try {
  const result = await base44.entities.NonExistentEntity.list();
} catch (error) {
  if (error instanceof Base44Error) {
    console.error(`Status: ${error.status}`);
    console.error(`Message: ${error.message}`);
    console.error(`Code: ${error.code}`);
    console.error(`Data: ${JSON.stringify(error.data)}`);
  } else {
    console.error("Unexpected error:", error);
  }
}
```

## Functions

The SDK supports invoking custom functions:

```javascript
// Invoke a function without parameters
const result = await base44.functions.myFunction();

// Invoke a function with parameters
const result = await base44.functions.calculateTotal({
  items: ["item1", "item2"],
  discount: 0.1,
});

// Functions are automatically authenticated with the user token
// Service role can also invoke functions
const serviceResult = await base44.asServiceRole.functions.adminFunction();
```

## AI Agents

The SDK provides comprehensive support for AI agent conversations with real-time messaging capabilities.

### Basic Agent Setup

```javascript
import { createClient } from "@base44/sdk";

// Create a client with agents support
const base44 = createClient({
  appId: "your-app-id",
  token: "your-auth-token",
  agents: {
    enableWebSocket: true, // Enable real-time updates
    socketUrl: "wss://base44.app/ws", // Optional: custom WebSocket URL
  },
});
```

### Working with Agent Conversations

```javascript
// Create a new conversation with an agent
const conversation = await base44.agents.createConversation({
  agent_name: "customer-support-agent",
  metadata: {
    source: "web-app",
    priority: "normal",
    customer_id: "cust_12345",
  },
});

// Send a message to the agent
const response = await base44.agents.sendMessage(conversation.id, {
  role: "user",
  content: "Hello! I need help with my account.",
  metadata: {
    timestamp: new Date().toISOString(),
  },
});

// Get conversation history
const fullConversation = await base44.agents.getConversation(conversation.id);
console.log("Messages:", fullConversation.messages);

// List all conversations
const conversations = await base44.agents.listConversations({
  limit: 10,
  sort: { created_at: -1 },
});
```

### Real-Time Agent Conversations

```javascript
// Subscribe to real-time updates for a conversation
const unsubscribe = base44.agents.subscribeToConversation(
  conversation.id,
  (updatedConversation) => {
    console.log("New messages:", updatedConversation.messages);

    // Handle new agent responses
    const lastMessage =
      updatedConversation.messages[updatedConversation.messages.length - 1];
    if (lastMessage?.role === "assistant") {
      displayAgentMessage(lastMessage.content);
    }
  }
);

// Send a message and receive real-time responses
await base44.agents.sendMessage(conversation.id, {
  role: "user",
  content: "Can you help me with billing questions?",
});

// Clean up subscription when done
unsubscribe();
```

### Advanced Agent Usage

```javascript
// Filter conversations by agent type
const supportConversations = await base44.agents.listConversations({
  query: { agent_name: "support-agent" },
  limit: 20,
});

// Update conversation metadata
await base44.agents.updateConversation(conversation.id, {
  metadata: {
    status: "resolved",
    satisfaction_rating: 5,
    resolution_time: "5 minutes",
  },
});

// Delete a specific message from conversation
await base44.agents.deleteMessage(conversation.id, "message-id");

// Check WebSocket connection status
const status = base44.agents.getWebSocketStatus();
console.log("WebSocket enabled:", status.enabled);
console.log("WebSocket connected:", status.connected);

// Manually control WebSocket connection
if (status.enabled && !status.connected) {
  await base44.agents.connectWebSocket();
}

// Disconnect WebSocket when done
base44.agents.disconnectWebSocket();
```

### TypeScript Support for Agents

```typescript
import {
  createClient,
  AgentConversation,
  Message,
  CreateConversationPayload,
} from "@base44/sdk";

// Define custom conversation metadata interface
interface CustomerSupportMetadata {
  customer_id: string;
  priority: "low" | "normal" | "high" | "urgent";
  department: "sales" | "support" | "technical";
  source: "web" | "mobile" | "email";
}

// Create typed conversation
const conversation: AgentConversation = await base44.agents.createConversation({
  agent_name: "support-agent",
  metadata: {
    customer_id: "cust_123",
    priority: "high",
    department: "support",
    source: "web",
  } as CustomerSupportMetadata,
});

// Send typed message
const message: Omit<Message, "id"> = {
  role: "user",
  content: "I need help with my order",
  timestamp: new Date().toISOString(),
  metadata: {
    intent: "order_inquiry",
    order_id: "ord_456",
  },
};

const response: Message = await base44.agents.sendMessage(
  conversation.id,
  message
);
```

### Customer Service Chatbot Example

```javascript
class CustomerServiceBot {
  constructor(base44Client) {
    this.client = base44Client;
    this.activeConversations = new Map();
  }

  async startConversation(customerId, initialMessage) {
    // Create conversation with customer context
    const conversation = await this.client.agents.createConversation({
      agent_name: "customer-service-bot",
      metadata: {
        customer_id: customerId,
        session_start: new Date().toISOString(),
        channel: "web-chat",
      },
    });

    // Set up real-time message handling
    const unsubscribe = this.client.agents.subscribeToConversation(
      conversation.id,
      (updatedConversation) => {
        this.handleConversationUpdate(updatedConversation);
      }
    );

    // Store conversation reference
    this.activeConversations.set(conversation.id, {
      conversation,
      unsubscribe,
      customerId,
    });

    // Send initial message
    await this.client.agents.sendMessage(conversation.id, {
      role: "user",
      content: initialMessage,
      metadata: { message_type: "initial_inquiry" },
    });

    return conversation.id;
  }

  handleConversationUpdate(conversation) {
    const lastMessage = conversation.messages[conversation.messages.length - 1];

    if (lastMessage?.role === "assistant") {
      // Display agent response to user
      this.displayMessage(conversation.id, lastMessage);

      // Check for escalation keywords
      if (this.shouldEscalate(lastMessage.content)) {
        this.escalateToHuman(conversation.id);
      }
    }
  }

  shouldEscalate(messageContent) {
    const escalationKeywords = [
      "human agent",
      "supervisor",
      "manager",
      "escalate",
    ];
    return escalationKeywords.some((keyword) =>
      messageContent.toLowerCase().includes(keyword)
    );
  }

  async escalateToHuman(conversationId) {
    await this.client.agents.updateConversation(conversationId, {
      metadata: {
        escalated: true,
        escalation_time: new Date().toISOString(),
        status: "pending_human_agent",
      },
    });

    console.log(`Conversation ${conversationId} escalated to human agent`);
  }

  async endConversation(conversationId) {
    const conversationData = this.activeConversations.get(conversationId);
    if (conversationData) {
      // Clean up subscription
      conversationData.unsubscribe();

      // Update conversation status
      await this.client.agents.updateConversation(conversationId, {
        metadata: {
          status: "completed",
          session_end: new Date().toISOString(),
        },
      });

      this.activeConversations.delete(conversationId);
    }
  }

  displayMessage(conversationId, message) {
    // Implement your UI message display logic here
    console.log(`[${conversationId}] Agent: ${message.content}`);
  }
}

// Usage
const customerBot = new CustomerServiceBot(base44);
const conversationId = await customerBot.startConversation(
  "customer_123",
  "Hi, I have a problem with my recent order"
);
```

### Multi-Agent System Example

```javascript
class MultiAgentRouter {
  constructor(base44Client) {
    this.client = base44Client;
    this.agents = {
      sales: "sales-agent",
      support: "support-agent",
      technical: "technical-agent",
    };
  }

  async routeQuery(userQuery, customerContext) {
    // Determine the best agent based on query content
    const department = this.classifyQuery(userQuery);
    const agentName = this.agents[department];

    // Create conversation with appropriate agent
    const conversation = await this.client.agents.createConversation({
      agent_name: agentName,
      metadata: {
        ...customerContext,
        department,
        routing_reason: `Auto-routed based on query classification`,
        original_query: userQuery,
      },
    });

    // Send initial message
    await this.client.agents.sendMessage(conversation.id, {
      role: "user",
      content: userQuery,
      metadata: {
        routing_department: department,
        confidence: this.getClassificationConfidence(userQuery, department),
      },
    });

    return { conversationId: conversation.id, department, agent: agentName };
  }

  classifyQuery(query) {
    const lowerQuery = query.toLowerCase();

    if (
      lowerQuery.includes("buy") ||
      lowerQuery.includes("price") ||
      lowerQuery.includes("plan")
    ) {
      return "sales";
    }
    if (
      lowerQuery.includes("api") ||
      lowerQuery.includes("integration") ||
      lowerQuery.includes("code")
    ) {
      return "technical";
    }
    return "support"; // Default to support
  }

  getClassificationConfidence(query, department) {
    // Simple confidence scoring (you could use ML models here)
    const keywords = {
      sales: ["buy", "purchase", "price", "plan", "upgrade", "billing"],
      technical: ["api", "integration", "code", "sdk", "development", "bug"],
      support: ["help", "problem", "issue", "account", "login", "password"],
    };

    const queryWords = query.toLowerCase().split(" ");
    const matches = keywords[department].filter((keyword) =>
      queryWords.some((word) => word.includes(keyword))
    );

    return Math.min(matches.length * 0.3, 1.0);
  }
}

// Usage
const router = new MultiAgentRouter(base44);
const result = await router.routeQuery(
  "I want to upgrade to your enterprise plan",
  { customer_id: "cust_789", tier: "premium" }
);

console.log(
  `Routed to ${result.department} (${result.agent}): ${result.conversationId}`
);
```

### Error Handling with Agents

```javascript
import { Base44Error } from "@base44/sdk";

async function robustAgentInteraction() {
  const maxRetries = 3;
  let retryCount = 0;

  while (retryCount < maxRetries) {
    try {
      // Attempt to create conversation
      const conversation = await base44.agents.createConversation({
        agent_name: "support-agent",
      });

      // Send message with retry logic
      const response = await base44.agents.sendMessage(conversation.id, {
        role: "user",
        content: "Hello, I need assistance",
      });

      console.log("Successfully sent message:", response);
      return conversation;
    } catch (error) {
      retryCount++;

      if (error instanceof Base44Error) {
        console.error(`Agent API Error (${error.status}): ${error.message}`);

        // Don't retry on client errors (4xx)
        if (error.status >= 400 && error.status < 500) {
          throw error;
        }
      } else {
        console.error("Network or other error:", error);
      }

      if (retryCount >= maxRetries) {
        throw new Error(
          `Failed to create agent conversation after ${maxRetries} attempts`
        );
      }

      // Exponential backoff
      const delay = Math.pow(2, retryCount) * 1000;
      console.log(
        `Retrying in ${delay}ms... (attempt ${retryCount + 1}/${maxRetries})`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

// WebSocket error handling
base44.agents.subscribeToConversation(
  conversationId,
  (conversation) => {
    // Handle successful updates
    console.log("Conversation updated:", conversation.id);
  },
  (error) => {
    // Handle WebSocket errors
    console.error("WebSocket error:", error);

    // Attempt to reconnect
    setTimeout(() => {
      base44.agents.connectWebSocket().catch(console.error);
    }, 5000);
  }
);
```

## Testing

The SDK includes comprehensive tests to ensure reliability.

### Running Tests

```bash
# Run all tests
npm test

# Run unit tests only (no API calls)
npm run test:unit

# Run end-to-end tests (requires API access)
npm run test:e2e

# Run tests with coverage report
npm run test:coverage
```

### Setting Up E2E Tests

E2E tests require access to a Base44 API. To run these tests:

1. Copy `tests/.env.example` to `tests/.env`
2. Fill in your Base44 API credentials in the `.env` file:

   ```
   BASE44_SERVER_URL=https://base44.app
   BASE44_APP_ID=your_app_id_here
   BASE44_AUTH_TOKEN=your_auth_token_here
   ```

3. Optionally, set `SKIP_E2E_TESTS=true` to skip E2E tests.

### Writing Your Own Tests

You can use the provided test utilities for writing your own tests:

```javascript
const { createClient } = require("@base44/sdk");
const { getTestConfig } = require("@base44/sdk/tests/utils/test-config");

describe("My Tests", () => {
  let base44;

  beforeAll(() => {
    const config = getTestConfig();
    base44 = createClient({
      serverUrl: config.serverUrl,
      appId: config.appId,
    });

    if (config.token) {
      base44.setToken(config.token);
    }
  });

  test("My test", async () => {
    const todos = await base44.entities.Todo.filter({}, 10);
    expect(Array.isArray(todos)).toBe(true);
    expect(todos.length).toBeGreaterThan(0);
  });
});
```

## License

MIT
