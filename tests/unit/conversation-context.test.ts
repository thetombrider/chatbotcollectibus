/**
 * Unit Tests: Conversation Context Module
 * 
 * Tests conversation history management and follow-up query detection
 */

import { describe, it, expect } from '@jest/globals'
import {
  formatConversationContext,
  getLastUserMessage,
  getLastAssistantMessage,
  isFollowUpQuery,
  summarizeConversationHistory,
  buildConversationContextSection,
  type ConversationMessage,
} from '@/lib/context/conversation-context'

// Mock conversation histories
const emptyHistory: ConversationMessage[] = []

const singleUserHistory: ConversationMessage[] = [
  { role: 'user', content: 'What is GDPR?' },
]

const simpleConversation: ConversationMessage[] = [
  { role: 'user', content: 'What is GDPR?' },
  { role: 'assistant', content: 'GDPR is the General Data Protection Regulation, a European Union law on data protection and privacy.' },
]

const multiTurnConversation: ConversationMessage[] = [
  { role: 'user', content: 'What is GDPR?' },
  { role: 'assistant', content: 'GDPR is the General Data Protection Regulation...' },
  { role: 'user', content: 'When was it enacted?' },
  { role: 'assistant', content: 'GDPR was enacted in May 2016 and became enforceable on May 25, 2018.' },
  { role: 'user', content: 'What are the main requirements?' },
]

const longMessageConversation: ConversationMessage[] = [
  { role: 'user', content: 'Explain the detailed requirements of GDPR Article 5 regarding principles relating to processing of personal data, including lawfulness, fairness, transparency, purpose limitation, data minimization, accuracy, storage limitation, integrity and confidentiality.' },
  { role: 'assistant', content: 'GDPR Article 5 establishes fundamental principles for personal data processing. These principles include: 1) Lawfulness, fairness and transparency - data must be processed legally, fairly and in a transparent manner. 2) Purpose limitation - data must be collected for specified, explicit and legitimate purposes. 3) Data minimization - data must be adequate, relevant and limited to what is necessary. 4) Accuracy - data must be accurate and kept up to date. 5) Storage limitation - data must be kept only as long as necessary. 6) Integrity and confidentiality - data must be processed securely.' },
]

describe('Conversation Context Module', () => {
  describe('formatConversationContext', () => {
    it('should return empty string for undefined history', () => {
      const result = formatConversationContext(undefined)
      expect(result).toBe('')
    })

    it('should return empty string for empty history', () => {
      const result = formatConversationContext(emptyHistory)
      expect(result).toBe('')
    })

    it('should format single message', () => {
      const result = formatConversationContext(singleUserHistory)
      expect(result).toContain('User: What is GDPR?')
    })

    it('should format multiple messages', () => {
      const result = formatConversationContext(simpleConversation)
      expect(result).toContain('User: What is GDPR?')
      expect(result).toContain('Assistant: GDPR is the General Data Protection Regulation')
    })

    it('should limit to maxMessages', () => {
      const result = formatConversationContext(multiTurnConversation, { maxMessages: 2 })
      const lines = result.split('\n')
      expect(lines.length).toBe(2)
      expect(result).toContain('What are the main requirements')
    })

    it('should truncate long messages', () => {
      const result = formatConversationContext(longMessageConversation, { maxCharsPerMessage: 50 })
      expect(result).toContain('...')
      expect(result.split('\n')[0].length).toBeLessThan(70) // "User: " + 50 chars + "..."
    })

    it('should filter by role when includeAssistant=false', () => {
      const result = formatConversationContext(simpleConversation, { includeAssistant: false })
      expect(result).toContain('User:')
      expect(result).not.toContain('Assistant:')
    })

    it('should filter by role when includeUser=false', () => {
      const result = formatConversationContext(simpleConversation, { includeUser: false })
      expect(result).toContain('Assistant:')
      expect(result).not.toContain('User:')
    })
  })

  describe('getLastUserMessage', () => {
    it('should return null for undefined history', () => {
      const result = getLastUserMessage(undefined)
      expect(result).toBeNull()
    })

    it('should return null for empty history', () => {
      const result = getLastUserMessage(emptyHistory)
      expect(result).toBeNull()
    })

    it('should return last user message', () => {
      const result = getLastUserMessage(multiTurnConversation)
      expect(result).toBe('What are the main requirements?')
    })

    it('should find user message even if not last', () => {
      const result = getLastUserMessage(simpleConversation)
      expect(result).toBe('What is GDPR?')
    })
  })

  describe('getLastAssistantMessage', () => {
    it('should return null for undefined history', () => {
      const result = getLastAssistantMessage(undefined)
      expect(result).toBeNull()
    })

    it('should return null for empty history', () => {
      const result = getLastAssistantMessage(emptyHistory)
      expect(result).toBeNull()
    })

    it('should return null if no assistant messages', () => {
      const result = getLastAssistantMessage(singleUserHistory)
      expect(result).toBeNull()
    })

    it('should return last assistant message', () => {
      const result = getLastAssistantMessage(multiTurnConversation)
      expect(result).toBe('GDPR was enacted in May 2016 and became enforceable on May 25, 2018.')
    })
  })

  describe('isFollowUpQuery', () => {
    it('should return false for undefined history', () => {
      const result = isFollowUpQuery('What is GDPR?', undefined)
      expect(result).toBe(false)
    })

    it('should return false for empty history', () => {
      const result = isFollowUpQuery('What is GDPR?', emptyHistory)
      expect(result).toBe(false)
    })

    it('should detect follow-up with pronoun reference', () => {
      expect(isFollowUpQuery('e questo cos\'è?', simpleConversation)).toBe(true)
      expect(isFollowUpQuery('E quello invece?', simpleConversation)).toBe(true)
    })

    it('should detect follow-up with comparative terms', () => {
      expect(isFollowUpQuery('confronto con il CCPA', simpleConversation)).toBe(true)
      expect(isFollowUpQuery('differenza rispetto a prima', simpleConversation)).toBe(true)
    })

    it('should detect follow-up with sequential indicators', () => {
      expect(isFollowUpQuery('e poi?', simpleConversation)).toBe(true)
      expect(isFollowUpQuery('inoltre, cosa prevede?', simpleConversation)).toBe(true)
    })

    it('should detect follow-up with building questions', () => {
      expect(isFollowUpQuery('e se non rispetto questo?', simpleConversation)).toBe(true)
      expect(isFollowUpQuery('ma come si applica?', simpleConversation)).toBe(true)
    })

    it('should detect short questions as follow-ups when history exists', () => {
      expect(isFollowUpQuery('perché?', simpleConversation)).toBe(true)
      expect(isFollowUpQuery('come?', simpleConversation)).toBe(true)
    })

    it('should NOT detect standalone questions as follow-ups', () => {
      expect(isFollowUpQuery('What is GDPR?', simpleConversation)).toBe(false)
      expect(isFollowUpQuery('Explain data protection principles', simpleConversation)).toBe(false)
    })
  })

  describe('summarizeConversationHistory', () => {
    it('should return zero counts for undefined history', () => {
      const result = summarizeConversationHistory(undefined)
      expect(result.messageCount).toBe(0)
      expect(result.userMessages).toBe(0)
      expect(result.assistantMessages).toBe(0)
    })

    it('should return zero counts for empty history', () => {
      const result = summarizeConversationHistory(emptyHistory)
      expect(result.messageCount).toBe(0)
    })

    it('should count messages correctly', () => {
      const result = summarizeConversationHistory(multiTurnConversation)
      expect(result.messageCount).toBe(5)
      expect(result.userMessages).toBe(3)
      expect(result.assistantMessages).toBe(2)
    })

    it('should include message previews', () => {
      const result = summarizeConversationHistory(simpleConversation)
      expect(result.lastUserPreview).toBe('What is GDPR?')
      expect(result.lastAssistantPreview).toContain('GDPR is the General Data Protection Regulation')
    })

    it('should truncate long previews', () => {
      const result = summarizeConversationHistory(longMessageConversation)
      expect(result.lastUserPreview?.length).toBeLessThanOrEqual(50)
      expect(result.lastAssistantPreview?.length).toBeLessThanOrEqual(50)
    })
  })

  describe('buildConversationContextSection', () => {
    it('should return empty string for undefined history', () => {
      const result = buildConversationContextSection(undefined)
      expect(result).toBe('')
    })

    it('should return empty string for empty history', () => {
      const result = buildConversationContextSection(emptyHistory)
      expect(result).toBe('')
    })

    it('should include header and formatted context', () => {
      const result = buildConversationContextSection(simpleConversation)
      expect(result).toContain('Previous conversation context:')
      expect(result).toContain('User: What is GDPR?')
      expect(result).toContain('Assistant:')
    })

    it('should respect options', () => {
      const result = buildConversationContextSection(multiTurnConversation, {
        maxMessages: 1,
        includeAssistant: false,
      })
      expect(result).toContain('Previous conversation context:')
      expect(result).not.toContain('Assistant:')
      const lines = result.split('\n').filter(l => l.trim())
      expect(lines.length).toBe(2) // Header + 1 message
    })
  })

  describe('Integration: Query Enhancement Use Case', () => {
    it('should provide context for follow-up query enhancement', () => {
      const conversation: ConversationMessage[] = [
        { role: 'user', content: 'What is GDPR?' },
        { role: 'assistant', content: 'GDPR is the General Data Protection Regulation...' },
      ]

      const followUpQuery = 'e quali sono le sanzioni?'
      
      // Check if it's a follow-up
      const isFollowUp = isFollowUpQuery(followUpQuery, conversation)
      expect(isFollowUp).toBe(true)
      
      // Get formatted context for LLM
      const context = buildConversationContextSection(conversation)
      expect(context).toContain('GDPR')
      expect(context.length).toBeGreaterThan(0)
    })

    it('should handle multi-turn conversation for context-aware expansion', () => {
      const summary = summarizeConversationHistory(multiTurnConversation)
      expect(summary.messageCount).toBe(5)
      
      const lastUser = getLastUserMessage(multiTurnConversation)
      expect(lastUser).toBe('What are the main requirements?')
      
      const contextSection = buildConversationContextSection(multiTurnConversation, {
        maxMessages: 3,
      })
      expect(contextSection).toContain('When was it enacted')
      expect(contextSection).toContain('What are the main requirements')
    })
  })
})
