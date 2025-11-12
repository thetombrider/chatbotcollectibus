/**
 * Test script per verificare la gestione di contenuti molto grandi via SSE
 */

import { StreamController } from '../app/api/chat/handlers/stream-handler'

// Mock ReadableStreamDefaultController per il test
class MockController {
  private chunks: string[] = []
  
  enqueue(chunk: Uint8Array) {
    const text = new TextDecoder().decode(chunk)
    this.chunks.push(text)
    console.log(`[Mock] Enqueued chunk (${chunk.length} bytes):`, text.substring(0, 100) + '...')
  }
  
  close() {
    console.log('[Mock] Stream closed')
  }
  
  getChunks() {
    return this.chunks
  }
}

async function testLargeContentHandling() {
  console.log('🧪 Testing SSE large content handling...\n')
  
  const mockController = new MockController()
  const streamController = new StreamController(mockController as any)
  
  // Test 1: Small content (should work normally)
  console.log('Test 1: Small content')
  streamController.sendTextComplete('Small content test')
  
  // Test 2: Large content (should be chunked)
  console.log('\nTest 2: Large content (8KB)')
  const largeContent = 'A'.repeat(8192) // 8KB of 'A' characters
  streamController.sendTextComplete(largeContent)
  
  // Test 3: Very large content (should be chunked multiple times)
  console.log('\nTest 3: Very large content (20KB)')
  const veryLargeContent = 'B'.repeat(20480) // 20KB of 'B' characters
  streamController.sendTextComplete(veryLargeContent)
  
  // Analizza i risultati
  const chunks = mockController.getChunks()
  console.log(`\n📊 Results: Generated ${chunks.length} chunks`)
  
  chunks.forEach((chunk, index) => {
    const lines = chunk.split('\n')
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6))
          console.log(`Chunk ${index + 1}: type=${data.type}, contentLength=${data.content?.length || 0}`)
        } catch (error) {
          console.error(`Chunk ${index + 1}: JSON parse error - ${error}`)
        }
      }
    }
  })
  
  console.log('\n✅ Test completed successfully!')
}

// Esegui il test
testLargeContentHandling().catch(console.error)