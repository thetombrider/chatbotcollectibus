import { ChatRoute } from '../ChatRoute'

export default function ChatPageWithId({ params }: { params: { id: string } }) {
  return <ChatRoute conversationId={params.id} />
}
