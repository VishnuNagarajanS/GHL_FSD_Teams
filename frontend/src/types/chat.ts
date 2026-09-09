export interface ConversationMember {
  id: string;
  name: string;
  photo_url?: string;
  status: string;
  designation?: string;
}

export interface Conversation {
  id: string;
  type: 'dm' | 'group';
  name: string;
  members: ConversationMember[];
  last_message?: { content: string; sender_id: string; is_deleted: number; } | null;
  unread_count: number;
  updated_at: string;
}
