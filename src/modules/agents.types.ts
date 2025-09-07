



export type AgentConversation = {
	id: string;
	app_id: string;
	agent_name: string;
	created_by_id: string;
	messages: AgentMessage[];
	metadata?: Record<string, any>;
};


export type AgentMessage = {
	id: string;
    role: "user" | "assistant" | "system";
    reasoning: {
			start_date: string;
			end_date?: string;
			content: string;
		}
    content?: string | Record<string, any> | null;
    file_urls?: string[] | null;
    tool_calls?: {id: string;
			name: string;
			arguments_string: string;
			status: "running" | "success" | "error" | "stopped";
			results?: string | null;
		}[] | null;
	
    usage: { prompt_tokens?: number
			completion_tokens?: number
	} | null;
    hidden?: boolean;
    custom_context?: {message: string;
			data: Record<string, any>;
			type: string;
		}[] | null;
    model: string | null;
    checkpoint_id: string | null;
    metadata?: {
			created_date: string;
			created_by_email: string;
			created_by_full_name: string | null;
		};
    additional_message_params?: Record<string, any>;
};
