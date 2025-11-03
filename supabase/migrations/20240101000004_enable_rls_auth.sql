-- Enable Row Level Security on conversations and messages tables
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Drop existing foreign key constraint on conversations if it exists
ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_user_id_fkey;

-- Update existing conversations with NULL user_id to assign them to the first user
-- (for development/migration purposes)
DO $$
DECLARE
  first_user_id uuid;
BEGIN
  -- Get the first user ID
  SELECT id INTO first_user_id FROM auth.users LIMIT 1;
  
  -- Update conversations with NULL user_id
  IF first_user_id IS NOT NULL THEN
    UPDATE public.conversations 
    SET user_id = first_user_id 
    WHERE user_id IS NULL;
  END IF;
END $$;

-- Now make user_id NOT NULL
ALTER TABLE public.conversations 
  ALTER COLUMN user_id SET NOT NULL;

-- Re-add the foreign key constraint
ALTER TABLE public.conversations 
  ADD CONSTRAINT conversations_user_id_fkey 
  FOREIGN KEY (user_id) 
  REFERENCES auth.users(id) 
  ON DELETE CASCADE;

-- RLS Policies for conversations table
-- Users can only see their own conversations
CREATE POLICY "Users can view their own conversations"
  ON public.conversations
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own conversations
CREATE POLICY "Users can insert their own conversations"
  ON public.conversations
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own conversations
CREATE POLICY "Users can update their own conversations"
  ON public.conversations
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own conversations
CREATE POLICY "Users can delete their own conversations"
  ON public.conversations
  FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for messages table
-- Users can only see messages from their own conversations
CREATE POLICY "Users can view messages from their own conversations"
  ON public.messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations
      WHERE conversations.id = messages.conversation_id
      AND conversations.user_id = auth.uid()
    )
  );

-- Users can insert messages into their own conversations
CREATE POLICY "Users can insert messages into their own conversations"
  ON public.messages
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations
      WHERE conversations.id = messages.conversation_id
      AND conversations.user_id = auth.uid()
    )
  );

-- Users can update messages in their own conversations
CREATE POLICY "Users can update messages in their own conversations"
  ON public.messages
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations
      WHERE conversations.id = messages.conversation_id
      AND conversations.user_id = auth.uid()
    )
  );

-- Users can delete messages in their own conversations
CREATE POLICY "Users can delete messages in their own conversations"
  ON public.messages
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations
      WHERE conversations.id = messages.conversation_id
      AND conversations.user_id = auth.uid()
    )
  );

-- Add index for better performance on user_id lookups
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON public.conversations(user_id);

