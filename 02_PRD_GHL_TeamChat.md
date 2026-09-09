# Product Requirements Document (PRD)
## GHL Connect — Internal Team Communication Application

**Prepared by:** Vishnu, Fullstack Developer
**Document Version:** 1.0
**Status:** Draft

---

## 1. Overview

GHL Connect is an internal, web-based communication platform for GHL India Ventures employees, providing chat, file sharing, video/audio meetings, and admin controls — built and rolled out as an MVP first, with features added incrementally.

## 2. Goals

- Give every employee a single place for messaging, files, and meetings
- Give admins control over users, departments, and platform usage
- Ship a stable, usable MVP quickly, then iterate

## 3. Non-Goals (Phase 1)

- Not a project management tool (no tasks/boards)
- Not replacing email for formal/external communication
- Not building custom mobile apps in Phase 1

## 4. Target Users & Personas

| Persona | Description | Key Needs |
|---------|-------------|-----------|
| Employee | Regular staff member | Fast messaging, file sharing, joining meetings |
| Team Lead / Manager | Manages a department/team | Group chat management, visibility into team activity |
| Admin (IT/HR) | Manages the platform | User/department management, audit visibility, disabling accounts |

## 5. Feature Set

### 5.1 MVP Features (Phase 1)

**Authentication**
- Login with company email/password
- Forgot password / reset flow
- Role-based access (Employee, Manager, Admin)

**User & Organization Management**
- Employee directory
- Departments/teams structure
- User profile (name, photo, designation, department, contact)
- Online/offline presence status

**Chat**
- One-to-one direct messages
- Group chat (department/team or custom groups)
- Send, edit, delete messages
- Message timestamps
- Read/unread indicators
- Typing indicator
- Emoji reactions

**File Sharing**
- Upload/download files within chat
- Support for images and documents
- File size and file type restrictions
- Files shown as attachments within message thread

**Notifications**
- New message notification
- @mention notification
- File shared notification
- Meeting invitation notification

**Video/Audio Meetings**
- One-to-one video call
- Group video call
- Mic/camera toggle controls
- Screen sharing
- Join/leave meeting controls

**Admin Panel**
- Manage employees (add/edit/remove)
- Manage departments
- Disable/enable user accounts
- Basic usage and audit log view (logins, messages sent count, active users)

### 5.2 Phase 2+ Features (Post-MVP, for future scoping)

- Global/semantic search across messages and files
- Message threading and pinned messages
- Presence states beyond online/offline (Away, In a meeting, DND)
- Notification preferences (mute, quiet hours)
- Tanglish/Tamil-English smart chat and translation
- AI meeting summarizer with action items
- Attendance/check-in integration
- Org-wide announcement/broadcast channel with read receipts
- Message retention policy & compliance export
- Calendar integration (Google/Outlook)
- Meeting recording with consent
- Collaborative whiteboard during calls

## 6. User Experience Principles

- Familiar chat-app UX (similar mental model to Teams/Slack) to minimize onboarding friction
- Fast perceived performance for sending/receiving messages
- Clear visual distinction between unread and read conversations
- Minimal clicks to start a chat, join a meeting, or share a file

## 7. Success Metrics (Phase 1)

| Metric | Target |
|--------|--------|
| Employee onboarding completion | 100% of employees have an active account |
| Daily active users (of total employees) | >80% within first month post-rollout |
| Message delivery latency | <2 seconds |
| Admin panel adoption | Admin actively manages employees/departments weekly |
| Critical bugs post-launch | Zero data-loss or security-related bugs in first 30 days |

## 8. Release Plan

| Release | Contents |
|---------|----------|
| MVP v0.1 (internal alpha) | Auth, org/user management, 1:1 + group chat (text only) |
| MVP v0.5 | + File sharing, notifications, presence, reactions, typing indicator |
| MVP v1.0 | + Video/audio meetings, Admin panel |
| v1.1+ | Phase 2 feature rollout per priority |

## 9. Open Questions

- Expected total user count (affects infra sizing decisions)?
- Should meetings use a managed WebRTC provider or self-hosted media server?
- Is a company-wide device/browser policy in place that affects supported platforms?
