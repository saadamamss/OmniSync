# Apex Chatbot Application

A modern chatbot application built with Vue.js, TypeScript, and Supabase.

## Features

- Create and manage AI-powered chatbots
- Train chatbots with custom knowledge from websites, PDFs, or text
- Real-time chat functionality
- Lead collection and conversation analytics
- Responsive widget integration
- User authentication and subscription management

## Tech Stack

- **Frontend**: Vue 3, TypeScript, Tailwind CSS
- **Backend**: Supabase (PostgreSQL, Auth, Edge Functions)
- **AI**: Groq API for chat responses
- **Payments**: Stripe for subscriptions

## Setup

1. Create a new Supabase project
2. Run `supabase/schema.sql` in SQL Editor
3. Add the environment variables in Supabase > Settings > Secrets
4. Run `npm install && npm run dev`

### Required Environment Variables

Add these secrets to your Supabase project:

```
GROQ_API_KEY=gsk_...           # Required - for AI functionality
OPENAI_API_KEY=sk-...          # Optional - for vector embeddings
STRIPE_SECRET_KEY=sk_...       # Required for payments
STRIPE_WEBHOOK_SECRET=whsec_.. # Required for webhook
```

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Project Structure

- `src/` - Vue.js application source code
- `supabase/` - Database schema and edge functions
- `public/` - Static assets and widget loader

## License

MIT
