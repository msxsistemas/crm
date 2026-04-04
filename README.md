# MSX CRM

Sistema de gestão de atendimento via WhatsApp.

## Stack

- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend:** Node.js + Fastify + PostgreSQL 16
- **Auth:** JWT (bcryptjs)
- **Realtime:** Socket.io
- **WhatsApp:** Evolution API

## Deploy

- Frontend: https://msxzap.pro
- Backend: https://api.msxzap.pro

## Desenvolvimento local

```bash
# Frontend
npm install
npm run dev

# Backend
cd backend
npm install
cp .env.example .env  # configure as variáveis
node src/server.js
```

## Variáveis de ambiente

Veja `.env.example` e `backend/.env.example`.
