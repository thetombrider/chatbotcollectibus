# Authentication Implementation

## Overview
Simple email/password authentication has been implemented using Supabase Auth with Next.js 14 App Router.

## Features Implemented

### 1. Unified Login/Signup Page
- **Location**: `/app/login/page.tsx`
- **Features**:
  - Toggle between login and signup modes
  - Email and password fields
  - No email verification required
  - Auto-login after signup
  - Redirects to `/chat` after successful authentication
  - Error handling with user-friendly messages

### 2. Session Management
- **Middleware**: `middleware.ts`
  - Automatically refreshes auth tokens
  - Protects routes requiring authentication
  - Redirects unauthenticated users to `/login`
  - Redirects authenticated users away from `/login` to `/chat`

### 3. Supabase Client Setup
- **Location**: `lib/supabase/client.ts`
- **Clients**:
  - `createClient()` - For Client Components
  - `createServerSupabaseClient()` - For Server Components, Server Actions, and Route Handlers
  - `supabaseAdmin` - Service role client for admin operations

### 4. Navigation Bar with User Info
- **Location**: `components/NavigationBar.tsx`
- **Features**:
  - Shows logged-in user's email in top right
  - Logout button
  - Hidden on login page
  - Listens to auth state changes

### 5. Logout API Route
- **Location**: `app/api/auth/logout/route.ts`
- **Method**: POST
- Signs out the user and clears session

### 6. Row Level Security (RLS)
- **Migration**: `supabase/migrations/20240101000004_enable_rls_auth.sql`
- **Tables Protected**:
  - `conversations` - Users can only access their own conversations
  - `messages` - Users can only access messages from their own conversations
- **Policies**:
  - SELECT, INSERT, UPDATE, DELETE policies for both tables
  - Automatic filtering based on `auth.uid()`

### 7. Updated API Routes
- **Conversations API** (`app/api/conversations/route.ts`):
  - GET: Returns only the authenticated user's conversations
  - POST: Creates conversations for the authenticated user
- **Conversation by ID** (`app/api/conversations/[id]/route.ts`):
  - GET: Returns conversation and messages (RLS enforced)
  - DELETE: Deletes conversation (RLS enforced)
  - PATCH: Updates conversation (RLS enforced)

## Authentication Flow

### Sign Up
1. User enters email and password on `/login` page
2. User toggles to "Sign Up" mode
3. On submit, account is created via `supabase.auth.signUp()`
4. User is automatically logged in
5. User is redirected to `/chat`

### Login
1. User enters email and password on `/login` page
2. On submit, credentials are verified via `supabase.auth.signInWithPassword()`
3. Session is created and stored in cookies
4. User is redirected to `/chat`
5. Middleware maintains the session across requests

### Logout
1. User clicks "Logout" in navigation bar
2. POST request to `/api/auth/logout`
3. Session is cleared via `supabase.auth.signOut()`
4. User is redirected to `/login`

## Security Features

### Row Level Security (RLS)
All user data is protected with PostgreSQL Row Level Security:
- Users can only see and modify their own data
- Policies are enforced at the database level
- Cannot be bypassed through API

### Session Management
- Sessions are stored in secure HTTP-only cookies
- Automatic token refresh via middleware
- Always uses `auth.getUser()` for server-side validation (never trust `getSession()`)

### Authentication Checks
- All protected API routes check for authenticated user
- Returns 401 Unauthorized if not authenticated
- Middleware redirects unauthenticated users to login

## Configuration

### No Email Verification
Email verification is disabled in the implementation:
- Users can log in immediately after signing up
- No confirmation email required
- Set via signup options: `emailRedirectTo` points to `/chat`

### Environment Variables
Required in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## Database Schema Changes

### Conversations Table
- `user_id` column made NOT NULL
- Foreign key to `auth.users(id)` with CASCADE delete
- Index added on `user_id` for performance
- RLS enabled with user-scoped policies

### Messages Table
- RLS enabled with conversation-based policies
- Access controlled through parent conversation ownership

## Testing the Implementation

### Manual Test Steps
1. Start the development server: `npm run dev`
2. Navigate to `http://localhost:3000`
3. Should redirect to `/login` (not authenticated)
4. Create a new account:
   - Enter email and password
   - Click "Registrati"
   - Should redirect to `/chat`
5. Check navigation bar shows your email
6. Create a conversation and send messages
7. Click "Logout"
8. Should redirect to `/login`
9. Log in with the same credentials
10. Should see your previous conversations

### API Testing
```bash
# Test authenticated endpoint (should return 401)
curl http://localhost:3000/api/conversations

# After logging in through the UI, test with browser cookies
# Conversations should be returned
```

## Future Enhancements (Not Implemented)

- Password reset functionality
- Email verification (optional)
- OAuth providers (Google, GitHub, etc.)
- Multi-factor authentication
- User profile management
- Password strength requirements
- Rate limiting on auth endpoints

## Notes

- The implementation prioritizes simplicity and security
- All sensitive operations use the server-side Supabase client
- RLS ensures data isolation at the database level
- Middleware handles session refresh automatically
- The auth system is production-ready for internal tools

## Troubleshooting

### User can't log in
- Check Supabase Auth settings in dashboard
- Verify environment variables are correct
- Check browser console for errors

### RLS blocks legitimate requests
- Verify user_id is correctly set on records
- Check RLS policies in Supabase dashboard
- Use `supabaseAdmin` for operations that need to bypass RLS (carefully!)

### Session not persisting
- Check middleware is properly configured
- Verify cookies are being set (check browser dev tools)
- Ensure `auth.getUser()` is called in middleware



