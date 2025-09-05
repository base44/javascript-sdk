import { createClient } from '@base44/sdk';

// Basic agents usage example
async function basicAgentsUsage() {
  // Create client with agents support
  const client = createClient({
    appId: 'your-app-id',
    token: 'your-auth-token',
    agents: {
      enableWebSocket: true, // Enable real-time updates
      socketUrl: 'wss://base44.app/ws' // Optional: custom WebSocket URL
    }
  });

  try {
    // 1. List existing conversations
    console.log('Listing conversations...');
    const conversations = await client.agents.listConversations({
      limit: 10,
      sort: { created_at: -1 } // Sort by newest first
    });
    console.log(`Found ${conversations.length} conversations`);

    // 2. Create a new conversation with an agent
    console.log('Creating new conversation...');
    const conversation = await client.agents.createConversation({
      agent_name: 'customer-support-agent',
      metadata: {
        source: 'web-app',
        user_context: 'premium-user'
      }
    });
    console.log(`Created conversation: ${conversation.id}`);

    // 3. Send a message to the agent
    console.log('Sending message to agent...');
    const userMessage = {
      role: 'user',
      content: 'Hello! I need help with my account settings.',
      metadata: {
        timestamp: new Date().toISOString()
      }
    };

    const response = await client.agents.sendMessage(conversation.id, userMessage);
    console.log('Agent response:', response);

    // 4. Subscribe to real-time updates (if WebSocket is enabled)
    console.log('Subscribing to conversation updates...');
    const unsubscribe = client.agents.subscribeToConversation(
      conversation.id,
      (updatedConversation) => {
        console.log('Conversation updated:', {
          id: updatedConversation.id,
          messageCount: updatedConversation.messages.length,
          lastMessage: updatedConversation.messages[updatedConversation.messages.length - 1]
        });
      }
    );

    // 5. Send another message to see real-time updates
    setTimeout(async () => {
      await client.agents.sendMessage(conversation.id, {
        role: 'user',
        content: 'Can you also help me understand the billing cycle?'
      });
    }, 2000);

    // 6. Clean up subscription after 30 seconds
    setTimeout(() => {
      unsubscribe();
      console.log('Unsubscribed from conversation updates');
    }, 30000);

  } catch (error) {
    console.error('Error:', error);
  }
}

// Advanced agents usage with conversation management
async function advancedAgentsUsage() {
  const client = createClient({
    appId: 'your-app-id',
    token: 'your-auth-token',
    agents: {
      enableWebSocket: true
    }
  });

  try {
    // Create multiple conversations with different agents
    const agents = ['sales-agent', 'support-agent', 'technical-agent'];
    const conversations = [];

    for (const agentName of agents) {
      const conversation = await client.agents.createConversation({
        agent_name: agentName,
        metadata: {
          department: agentName.split('-')[0],
          priority: 'normal'
        }
      });
      conversations.push(conversation);
      console.log(`Created conversation with ${agentName}: ${conversation.id}`);
    }

    // Send different messages to each agent
    const messages = [
      'I\'m interested in your premium plan pricing',
      'I\'m having trouble logging into my account',
      'I need help integrating your API with my system'
    ];

    const responses = await Promise.all(
      conversations.map((conv, index) =>
        client.agents.sendMessage(conv.id, {
          role: 'user',
          content: messages[index]
        })
      )
    );

    console.log('All agent responses received:', responses.length);

    // Update conversation metadata based on responses
    for (let i = 0; i < conversations.length; i++) {
      await client.agents.updateConversation(conversations[i].id, {
        metadata: {
          ...conversations[i].metadata,
          status: 'active',
          last_response_at: new Date().toISOString()
        }
      });
    }

    // Get updated conversations
    const updatedConversations = await Promise.all(
      conversations.map(conv => client.agents.getConversation(conv.id))
    );

    console.log('Updated conversations:', updatedConversations.map(conv => ({
      id: conv.id,
      agent: conv.agent_name,
      messageCount: conv.messages.length,
      status: conv.metadata.status
    })));

  } catch (error) {
    console.error('Advanced usage error:', error);
  }
}

// Customer service chatbot example
async function customerServiceExample() {
  const client = createClient({
    appId: 'your-app-id',
    token: 'your-auth-token',
    agents: { enableWebSocket: true }
  });

  // Simulate a customer service session
  const conversation = await client.agents.createConversation({
    agent_name: 'customer-service-bot',
    metadata: {
      customer_id: 'cust_12345',
      session_start: new Date().toISOString(),
      channel: 'web-chat'
    }
  });

  // Set up real-time message handling
  const unsubscribe = client.agents.subscribeToConversation(
    conversation.id,
    (updatedConversation) => {
      const lastMessage = updatedConversation.messages[updatedConversation.messages.length - 1];
      if (lastMessage?.role === 'assistant') {
        console.log('🤖 Agent:', lastMessage.content);
        
        // Check if agent is asking for escalation
        if (lastMessage.content.toLowerCase().includes('transfer') || 
            lastMessage.content.toLowerCase().includes('human agent')) {
          console.log('🔄 Escalating to human agent...');
          // Here you would implement escalation logic
        }
      }
    }
  );

  // Simulate customer conversation flow
  const customerMessages = [
    'Hi, I have a problem with my recent order',
    'My order number is ORD-12345 and it was supposed to arrive yesterday',
    'Yes, I can provide my email address: customer@example.com',
    'I would like a refund please',
    'Thank you for your help!'
  ];

  for (let i = 0; i < customerMessages.length; i++) {
    console.log(`👤 Customer: ${customerMessages[i]}`);
    
    await client.agents.sendMessage(conversation.id, {
      role: 'user',
      content: customerMessages[i],
      metadata: {
        timestamp: new Date().toISOString(),
        message_number: i + 1
      }
    });

    // Wait for agent response before sending next message
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  // Clean up
  setTimeout(() => {
    unsubscribe();
    console.log('Customer service session ended');
  }, 20000);
}

// Error handling and retry example
async function errorHandlingExample() {
  const client = createClient({
    appId: 'your-app-id',
    token: 'your-auth-token',
    agents: { enableWebSocket: true }
  });

  const maxRetries = 3;
  let retryCount = 0;

  async function sendMessageWithRetry(conversationId, message) {
    while (retryCount < maxRetries) {
      try {
        return await client.agents.sendMessage(conversationId, message);
      } catch (error) {
        retryCount++;
        console.log(`Attempt ${retryCount} failed:`, error.message);
        
        if (retryCount >= maxRetries) {
          throw new Error(`Failed to send message after ${maxRetries} attempts: ${error.message}`);
        }
        
        // Exponential backoff
        const delay = Math.pow(2, retryCount) * 1000;
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  try {
    const conversation = await client.agents.createConversation({
      agent_name: 'support-agent'
    });

    const response = await sendMessageWithRetry(conversation.id, {
      role: 'user',
      content: 'This message should be sent with retry logic'
    });

    console.log('Message sent successfully:', response);
  } catch (error) {
    console.error('Final error:', error);
  }
}

// WebSocket status monitoring
function webSocketStatusExample() {
  const client = createClient({
    appId: 'your-app-id',
    token: 'your-auth-token',
    agents: { enableWebSocket: true }
  });

  // Check WebSocket status
  const status = client.agents.getWebSocketStatus();
  console.log('WebSocket status:', status);

  if (status.enabled && !status.connected) {
    console.log('Connecting WebSocket...');
    client.agents.connectWebSocket()
      .then(() => {
        console.log('WebSocket connected successfully');
        const newStatus = client.agents.getWebSocketStatus();
        console.log('Updated status:', newStatus);
      })
      .catch(error => {
        console.error('WebSocket connection failed:', error);
      });
  }

  // Monitor connection status
  setInterval(() => {
    const currentStatus = client.agents.getWebSocketStatus();
    if (!currentStatus.connected && currentStatus.enabled) {
      console.log('WebSocket disconnected, attempting to reconnect...');
      client.agents.connectWebSocket().catch(console.error);
    }
  }, 10000); // Check every 10 seconds
}

// Run examples
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Running Basic Agents Usage Example...');
  basicAgentsUsage();

  setTimeout(() => {
    console.log('\nRunning Advanced Agents Usage Example...');
    advancedAgentsUsage();
  }, 5000);

  setTimeout(() => {
    console.log('\nRunning Customer Service Example...');
    customerServiceExample();
  }, 10000);
}

export {
  basicAgentsUsage,
  advancedAgentsUsage,
  customerServiceExample,
  errorHandlingExample,
  webSocketStatusExample
};
