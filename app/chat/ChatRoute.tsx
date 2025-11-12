import { ChatView } from '@/components/chat/ChatView'
import { getConversationDetail } from '@/lib/services/conversation-service'
import { getCompanyLogoSetting } from '@/lib/services/settings-service'

interface ChatRouteProps {
  readonly conversationId?: string
}

export async function ChatRoute({ conversationId }: ChatRouteProps) {
  const [logoSetting, conversationDetail] = await Promise.all([
    getCompanyLogoSetting().catch((error) => {
      console.error('[ChatRoute] Failed to load company logo:', error)
      return { url: null, storage_path: null }
    }),
    conversationId
      ? getConversationDetail(conversationId).catch((error) => {
          console.error('[ChatRoute] Failed to load conversation:', error)
          return { conversation: null, messages: [], notFound: true }
        })
      : Promise.resolve(null),
  ])

  const initialMessages = conversationDetail?.messages ?? []
  const resolvedConversationId =
    conversationDetail && !conversationDetail.notFound
      ? conversationDetail.conversation?.id ?? null
      : null
  const conversationNotFound = Boolean(conversationId && conversationDetail?.notFound)

  return (
    <ChatView
      initialLogoUrl={logoSetting.url}
      initialConversationId={resolvedConversationId}
      initialMessages={initialMessages}
      conversationNotFound={conversationNotFound}
    />
  )
}


