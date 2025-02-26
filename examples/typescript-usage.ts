// Import the SDK and types
import { createClient, Base44Error } from '../src';
import type { Entity, Base44Client } from '../src/types';

// Define a Todo interface extending the base Entity
interface Todo extends Entity {
  title: string;
  completed: boolean;
  priority: 'high' | 'medium' | 'low';
  dueDate?: string;
}

// Example async function
async function typescriptExample(): Promise<void> {
  try {
    // Create a typed client instance
    const base44: Base44Client = createClient({
      appId: 'your-app-id',
    });

    // Check authentication
    const isAuthenticated: boolean = await base44.auth.isAuthenticated();
    console.log('Authenticated:', isAuthenticated);

    if (!isAuthenticated) {
      console.log('User is not authenticated');
      return;
    }

    // Get current user with proper typing
    const me: Entity = await base44.auth.me();
    console.log('Current user name:', me.name);

    // List all todos with typed response
    const todos: Todo[] = await base44.entities.Todo.list() as Todo[];
    console.log('Total todos:', todos.length);

    // Filter high priority todos
    const highPriorityTodos: Todo[] = await base44.entities.Todo.filter({
      priority: 'high'
    }) as Todo[];
    console.log('High priority todos:', highPriorityTodos.length);

    // Create a new todo with typed data
    const todoData: Omit<Todo, 'id'> = {
      title: 'Implement TypeScript support',
      completed: false,
      priority: 'high'
    };
    
    const newTodo: Todo = await base44.entities.Todo.create(todoData) as Todo;
    console.log('Created todo:', newTodo.title);

    // Update the todo with partial data
    const updatedTodo: Todo = await base44.entities.Todo.update(
      newTodo.id, 
      { completed: true }
    ) as Todo;
    console.log('Updated todo completed status:', updatedTodo.completed);

    // Send an email with typed parameters
    interface EmailParams {
      to: string;
      subject: string;
      body: string;
      attachments?: File[];
    }
    
    const emailParams: EmailParams = {
      to: 'example@example.com',
      subject: 'TypeScript Example',
      body: 'This email was sent using TypeScript with the Base44 SDK'
    };
    
    const emailResult = await base44.integrations.Core.SendEmail(emailParams);
    console.log('Email sent:', !!emailResult);

    // Delete the todo
    await base44.entities.Todo.delete(newTodo.id);
    console.log('Todo deleted');

  } catch (error) {
    if (error instanceof Base44Error) {
      console.error(`Error ${error.status}: ${error.message}`);
      if (error.data) {
        console.error('Error data:', error.data);
      }
    } else {
      console.error('Unexpected error:', error);
    }
  }
}

// Run the example
typescriptExample().catch(err => console.error('Unhandled exception:', err)); 