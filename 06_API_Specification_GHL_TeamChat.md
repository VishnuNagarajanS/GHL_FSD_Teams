# API Specification
## GHL Connect — Internal Team Communication Application

**Prepared by:** Vishnu, Fullstack Developer
**Document Version:** 1.0
**Status:** Draft
**Base URL (example):** `https://api.ghlconnect.internal/v1`
**Auth:** Bearer JWT in `Authorization` header, unless noted otherwise
**Realtime:** WebSocket namespace `/realtime` (Socket.IO) for events marked "WS"

---

## 1. Authentication

### POST /auth/login
Login with company email and password.
- Body: `{ "email": string, "password": string }`
- 200: `{ "accessToken": string, "refreshToken": string, "user": {...} }`
- 401: Invalid credentials

### POST /auth/logout
Invalidate current session/refresh token.
- 204: No content

### POST /auth/forgot-password
Request a password reset email.
- Body: `{ "email": string }`
- 200: `{ "message": "Reset link sent if account exists" }`

### POST /auth/reset-password
Reset password using a valid reset token.
- Body: `{ "token": string, "newPassword": string }`
- 200: `{ "message": "Password updated" }`
- 400: Invalid/expired token

### POST /auth/refresh
Exchange a refresh token for a new access token.
- Body: `{ "refreshToken": string }`
- 200: `{ "accessToken": string }`

---

## 2. Users & Organization

### GET /users
List all users (paginated). Admin/Manager only for full list.
- Query: `?page=1&limit=50&department=eng`
- 200: `{ "users": [...], "total": number }`

### GET /users/:id
Get a specific user's profile.
- 200: `{ "id", "name", "email", "photoUrl", "designation", "departmentId", "status", "role" }`

### PUT /users/:id
Update a user's own profile (or admin updating another user).
- Body: `{ "name"?, "photoUrl"?, "designation"?, "contact"? }`
- 200: Updated user object

### POST /users (Admin only)
Create a new employee record.
- Body: `{ "name", "email", "departmentId", "role" }`
- 201: Created user object

### DELETE /users/:id (Admin only)
Remove an employee record.
- 204: No content

### PATCH /users/:id/status (Admin only)
Enable/disable a user account.
- Body: `{ "active": boolean }`
- 200: Updated user object

### GET /departments
List departments/teams.
- 200: `{ "departments": [{ "id", "name", "memberCount" }] }`

### POST /departments (Admin only)
Create a department.
- Body: `{ "name": string }`
- 201: Created department object

### PUT /departments/:id (Admin only)
Rename or update a department.

### DELETE /departments/:id (Admin only)
Delete a department (requires member reassignment).

---

## 3. Presence (WS)

### WS event: `presence:update` (client → server)
Sent on connect/disconnect/activity change.
- Payload: `{ "status": "online" | "offline" }`

### WS event: `presence:changed` (server → client, broadcast)
- Payload: `{ "userId": string, "status": "online" | "offline" }`

---

## 4. Chat / Conversations

### GET /conversations
List conversations (DMs + groups) for the logged-in user.
- 200: `{ "conversations": [{ "id", "type": "dm"|"group", "name", "lastMessage", "unreadCount" }] }`

### POST /conversations
Create a new conversation (DM or group).
- Body: `{ "type": "dm"|"group", "memberIds": [string], "name"?: string }`
- 201: Created conversation object

### GET /conversations/:id/messages
Get message history for a conversation (paginated).
- Query: `?before=<messageId>&limit=50`
- 200: `{ "messages": [...] }`

### POST /conversations/:id/messages
Send a message (also triggers WS broadcast).
- Body: `{ "content": string, "attachmentIds"?: [string] }`
- 201: Created message object

### PUT /messages/:id
Edit a message.
- Body: `{ "content": string }`
- 200: Updated message object

### DELETE /messages/:id
Delete a message (soft delete, shows placeholder).
- 204: No content

### POST /messages/:id/reactions
Add an emoji reaction.
- Body: `{ "emoji": string }`
- 200: Updated reaction list

### DELETE /messages/:id/reactions/:emoji
Remove own reaction.

### POST /conversations/:id/read
Mark conversation as read up to a given message.
- Body: `{ "messageId": string }`
- 200: `{ "message": "Marked as read" }`

### WS event: `message:new` (server → client, broadcast)
- Payload: full message object

### WS event: `message:typing` (client ↔ server)
- Payload: `{ "conversationId": string, "userId": string, "isTyping": boolean }`

### WS event: `message:read` (server → client, broadcast)
- Payload: `{ "conversationId": string, "userId": string, "messageId": string }`

---

## 5. File Sharing

### POST /files/upload-url
Request a pre-signed upload URL for direct-to-storage upload.
- Body: `{ "fileName": string, "fileType": string, "fileSize": number }`
- 200: `{ "uploadUrl": string, "fileId": string }`
- 400: File exceeds size/type restrictions

### POST /files/:id/complete
Confirm upload completion and attach metadata.
- Body: `{ "conversationId": string }`
- 200: File metadata object

### GET /files/:id
Get file metadata + download URL.
- 200: `{ "id", "name", "size", "type", "downloadUrl", "uploadedBy", "conversationId" }`

---

## 6. Notifications

### GET /notifications
List notifications for the logged-in user.
- Query: `?unreadOnly=true`
- 200: `{ "notifications": [{ "id", "type", "payload", "read", "createdAt" }] }`

### PATCH /notifications/:id/read
Mark a notification as read.
- 200: Updated notification object

### WS event: `notification:new` (server → client)
- Payload: `{ "type": "message"|"mention"|"file"|"meeting_invite", "payload": {...} }`

---

## 7. Video/Audio Meetings

### POST /meetings
Create a meeting room (1:1 or group).
- Body: `{ "type": "1:1"|"group", "inviteeIds": [string] }`
- 201: `{ "meetingId", "roomToken", "joinUrl" }`

### GET /meetings/:id
Get meeting details/status.
- 200: `{ "id", "status": "scheduled"|"active"|"ended", "participants": [...] }`

### POST /meetings/:id/join
Join an active meeting; returns access token for the WebRTC service SDK.
- 200: `{ "roomToken": string }`

### POST /meetings/:id/leave
Leave a meeting.
- 204: No content

### POST /meetings/:id/end (host only)
End the meeting for all participants.
- 204: No content

---

## 8. Admin

### GET /admin/audit-logs
Retrieve audit log entries (admin actions, logins).
- Query: `?from=<date>&to=<date>&userId=<id>`
- 200: `{ "logs": [{ "actor", "action", "target", "timestamp" }] }`

### GET /admin/usage-stats
Basic usage dashboard data.
- 200: `{ "activeUsersToday", "totalMessagesSent", "totalMeetingsHeld", "storageUsed" }`

---

## 9. Error Response Format (standard across all endpoints)

```json
{
  "error": {
    "code": "STRING_ERROR_CODE",
    "message": "Human readable message"
  }
}
```

| HTTP Status | Meaning |
|-------------|---------|
| 400 | Bad request / validation error |
| 401 | Unauthorized (missing/invalid token) |
| 403 | Forbidden (insufficient role) |
| 404 | Resource not found |
| 409 | Conflict (e.g., duplicate email) |
| 500 | Server error |
