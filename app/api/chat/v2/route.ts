/**
 * Chat Route V2 - Refactored Version (TESTING)
 * 
 * Endpoint di test per la versione refactorizzata
 * 
 * USAGE:
 * - Frontend: cambia endpoint da /api/chat a /api/chat/v2
 * - Test in parallelo con route originale
 * - Quando stabile, sostituire route.ts originale
 */

// Re-export dalla route refactorizzata
export { POST, maxDuration } from '../route.refactored'

