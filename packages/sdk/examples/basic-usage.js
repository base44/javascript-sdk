// Import the SDK
import { createClient, Base44Error } from '../src';

// Example async function
async function exampleUsage() {
  try {
    // Create a client instance
    const base44 = createClient({
      appId: 'your-app-id',
      // Optional parameters:
      // serverUrl: 'https://api.base44.com',
      // env: 'prod',
      // token: 'your-auth-token'
    });

    // Check if the user is authenticated
    const isAuthenticated = await base44.auth.isAuthenticated();
    console.log('Authenticated:', isAuthenticated);

    if (!isAuthenticated) {
      console.log('User is not authenticated, please set a valid token');
      // In a real application, you might redirect to login
      // or set a token if you have one
      // base44.setToken('your-token');
      return;
    }

    // Get current user information
    const me = await base44.auth.me();
    console.log('Current user:', me);

    // Working with entities
    // List all Todo items
    const todos = await base44.entities.Todo.list();
    console.log('Todo items:', todos);

    // Create a new Todo
    const newTodo = await base44.entities.Todo.create({
      title: 'Try Base44 SDK',
      completed: false,
      priority: 'high'
    });
    console.log('New Todo created:', newTodo);

    // Update the Todo
    const updatedTodo = await base44.entities.Todo.update(newTodo.id, {
      completed: true
    });
    console.log('Todo updated:', updatedTodo);

    // Filter Todos
    const highPriorityTodos = await base44.entities.Todo.filter({
      priority: 'high',
      completed: false
    });
    console.log('High priority incomplete Todos:', highPriorityTodos);

    // Using integrations
    const emailResult = await base44.integrations.Core.SendEmail({
      to: 'example@example.com',
      subject: 'Testing Base44 SDK',
      body: 'This is a test email from the Base44 SDK example'
    });
    console.log('Email sent:', emailResult);

    // Clean up - delete the Todo we created
    await base44.entities.Todo.delete(newTodo.id);
    console.log('Todo deleted');

  } catch (error) {
    if (error instanceof Base44Error) {
      console.error('Base44 API Error:');
      console.error(`Status: ${error.status}`);
      console.error(`Message: ${error.message}`);
      console.error(`Code: ${error.code}`);
      if (error.data) {
        console.error(`Additional data: ${JSON.stringify(error.data, null, 2)}`);
      }
    } else {
      console.error('Unexpected error:', error);
    }
  }
}

// Run the example
exampleUsage(); 