# System Architecture Document
## GHL Connect — Internal Team Communication Application

**Prepared by:** Vishnu, Fullstack Developer
**Document Version:** 1.0
**Status:** Draft

---

## 1. Architecture Goals

- Support real-time chat, presence, and notifications with low latency
- Keep Phase 1 architecture simple enough for a single developer to build and maintain
- Allow incremental scaling (more users, more features) without a full redesign
- Isolate video/audio complexity behind a managed service to avoid building media infrastructure from scratch

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Client (Web App)                     │
│         React/Next.js SPA — Chat UI, Admin UI            │
└───────────────┬───────────────────────┬──────────────────┘
                │ REST (HTTPS)           │ WebSocket (WSS)
                ▼                        ▼
┌─────────────────────────┐   ┌───────────────────────────┐
│   API Server (Node/     │   │  Realtime Gateway          │
│   Express or NestJS)    │◄──┤  (Socket.IO / WS server)   │
│  - Auth                 │   │  - Message broadcast       │
│  - User/Org mgmt        │   │  - Typing/presence events  │
│  - File metadata        │   └───────────────────────────┘
│  - Admin APIs           │
└───────────┬──────────────┘
            │
   ┌────────┼─────────────────────┐
   ▼        ▼                     ▼
┌────────┐ ┌────────────────┐  ┌─────────────────────┐
│Postgres│ │ Object Storage  │  │ Managed WebRTC/Video │
│(RDS)   │ │ (S3-compatible) │  │ Service (e.g. LiveKit│
│        │ │ - files/images  │  │ / Twilio / Daily)    │
└────────┘ └────────────────┘  └─────────────────────┘

┌───────────────────────────┐
│ Notification Service       │
│ (in-app via WS; email for  │
│ password reset/invites)    │
└───────────────────────────┘
```

## 3. Component Breakdown

### 3.1 Client (Frontend)
- Single Page Application (React or Next.js)
- Modules: Auth, Chat, File Sharing, Meetings, Admin Panel, Profile/Settings
- State management for real-time chat state (e.g., React Query + WebSocket event handlers)

### 3.2 API Server (Backend)
- REST API for non-real-time operations: auth, user/department CRUD, file metadata, admin actions
- Handles business logic, validation, and RBAC enforcement
- Issues JWT (or session) tokens for authenticated requests

### 3.3 Realtime Gateway
- WebSocket server (Socket.IO recommended for room/namespace support) for:
  - Message delivery
  - Typing indicators
  - Online/offline presence
  - Read receipt updates
  - Live notification push
- Can run as part of the API server initially, split out later if load requires it

### 3.4 Database (PostgreSQL)
- Stores: users, departments/teams, messages, conversations, reactions, file metadata, notifications, audit logs
- Chosen for relational integrity (users↔departments↔conversations) and familiarity with existing stack (per CAMS-Engineering experience)

### 3.5 Object Storage
- Stores actual file binaries (images, documents) — S3-compatible storage (AWS S3 or equivalent)
- Database stores only file metadata + storage reference URL

### 3.6 Video/Audio Meetings
- Recommendation: use a managed WebRTC service (e.g., LiveKit, Twilio Video, Daily.co) rather than self-hosting SFU/TURN servers for Phase 1
- API server handles meeting room creation/invitation; client connects directly to the managed service SDK for the actual call

### 3.7 Notification Service
- In-app notifications delivered via the WebSocket gateway
- Email notifications (password reset, account creation) via transactional email service (e.g., SES, SendGrid)

## 4. Data Flow Examples

**Sending a chat message:**
1. Client sends message via WebSocket to Realtime Gateway
2. Gateway persists message via API server → Postgres
3. Gateway broadcasts message to all connected recipients in that conversation
4. Recipients' clients update UI; offline recipients get notification queued for next connect

**Uploading a file in chat:**
1. Client requests a pre-signed upload URL from API server
2. Client uploads file directly to Object Storage using that URL
3. Client notifies API server of successful upload; API server creates file metadata record linked to the message
4. Message with file attachment is broadcast via Realtime Gateway

**Starting a video call:**
1. Client requests meeting room creation from API server
2. API server creates room via managed WebRTC service API, returns access token
3. Client joins room directly via WebRTC service SDK
4. Meeting invitation notification sent to invited users via Realtime Gateway

## 5. Security Architecture

- HTTPS for all REST traffic; WSS for WebSocket traffic
- Passwords hashed with bcrypt; never stored in plaintext
- JWT-based auth with short-lived access tokens + refresh tokens
- RBAC middleware on all API routes checking role before allowing action
- File upload validation (type/size) enforced server-side, not just client-side
- Admin actions logged to an audit table (who, what, when)

## 6. Deployment Considerations (Phase 1)

- API server + Realtime Gateway: containerized (Docker), deployable to a single cloud instance initially
- Database: managed Postgres (e.g., AWS RDS) for reliability and backups
- Object storage: managed S3-compatible service
- Video: managed third-party service — no infra to deploy for this piece

## 7. Scalability Path (Post-MVP)

- Split Realtime Gateway into its own scalable service (with Redis pub/sub for multi-instance WebSocket broadcast) once concurrent users grow
- Add caching layer (Redis) for presence status and frequently accessed data
- Move to a search-optimized store (e.g., Elasticsearch) if/when global message search is added

## 8. Technology Stack Summary

| Layer | Technology |
|-------|-----------|
| Frontend | React / Next.js |
| Backend API | Node.js + Express (or NestJS) |
| Realtime | Socket.IO (WebSocket) |
| Database | PostgreSQL |
| File Storage | S3-compatible object storage |
| Video/Audio | Managed WebRTC service (LiveKit / Twilio / Daily.co) |
| Auth | JWT-based sessions, bcrypt password hashing |
| Notifications | WebSocket (in-app) + transactional email service |
