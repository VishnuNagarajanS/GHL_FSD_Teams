# Software Requirements Specification (SRS)
## GHL Connect — Internal Team Communication Application

**Prepared by:** Vishnu, Fullstack Developer
**Document Version:** 1.0
**Status:** Draft
**Standard reference:** Structured per IEEE 830 style sections

---

## 1. Introduction

### 1.1 Purpose
This SRS defines the functional and non-functional requirements for GHL Connect, the internal communication application being developed for GHL India Ventures.

### 1.2 Intended Audience
Developer(s), reporting manager/TL, and QA for requirement validation and future maintenance reference.

### 1.3 Scope
Covers Phase 1 (MVP): authentication, user/org management, chat, file sharing, notifications, video/audio meetings, and admin panel.

### 1.4 Definitions & Acronyms

| Term | Definition |
|------|-----------|
| RBAC | Role-Based Access Control |
| MVP | Minimum Viable Product |
| WebRTC | Web Real-Time Communication (protocol for audio/video/data) |
| DM | Direct Message (1:1 chat) |
| TTL | Time To Live |

## 2. Overall Description

### 2.1 Product Perspective
GHL Connect is a standalone, greenfield web application (not integrated with existing GHL systems in Phase 1).

### 2.2 Product Functions (Summary)
- User authentication and role management
- Organization structure (departments/teams) and profile management
- Real-time messaging (1:1 and group)
- File attachment upload/download
- Notification delivery
- Real-time video/audio meetings
- Administrative controls

### 2.3 User Classes

| User Class | Description | Privilege Level |
|------------|-------------|-----------------|
| Employee | Standard user | Base access: chat, files, meetings, own profile |
| Manager | Team/department lead | Base + group management for own team |
| Admin | Platform administrator | Full access: user/department management, disable accounts, audit logs |

### 2.4 Operating Environment
- Web application, modern evergreen browsers (Chrome, Edge, Firefox)
- Backend server hosted on company-approved infrastructure (cloud or on-prem, per IT decision)
- Relational database for persistent data; object storage for files

### 2.5 Design & Implementation Constraints
- Single-developer build — architecture must favor simplicity and maintainability over premature scaling
- Real-time features (chat, presence, typing, calls) require WebSocket and/or WebRTC infrastructure
- File storage must enforce size/type restrictions server-side, not just client-side

### 2.6 Assumptions & Dependencies
- Company email addresses are available and stable for all employees
- A managed WebRTC/TURN service may be used for video/audio in Phase 1 rather than self-hosted media servers

## 3. Functional Requirements

### FR-1: Authentication
- FR-1.1: System shall allow login via company email and password
- FR-1.2: System shall provide a "Forgot Password" flow via email-based reset link
- FR-1.3: System shall enforce role-based access control (Employee, Manager, Admin)
- FR-1.4: System shall invalidate sessions on password reset

### FR-2: User & Organization Management
- FR-2.1: System shall allow Admins to create, edit, and remove employee records
- FR-2.2: System shall support department/team grouping of employees
- FR-2.3: System shall allow each user to maintain a profile (name, photo, designation, department, contact info)
- FR-2.4: System shall track and display online/offline status in real time

### FR-3: Chat
- FR-3.1: System shall support 1:1 direct messaging between users
- FR-3.2: System shall support group chat creation with multiple members
- FR-3.3: System shall allow sending, editing, and deleting of messages
- FR-3.4: System shall display a timestamp on every message
- FR-3.5: System shall track and display read/unread status per message/conversation
- FR-3.6: System shall show a typing indicator when a user is composing a message
- FR-3.7: System shall support emoji reactions on messages

### FR-4: File Sharing
- FR-4.1: System shall allow users to upload files (images, documents) within a chat
- FR-4.2: System shall allow users to download shared files
- FR-4.3: System shall enforce configurable file size limits
- FR-4.4: System shall enforce allowed file type restrictions
- FR-4.5: System shall associate uploaded files with the message/conversation they were shared in

### FR-5: Notifications
- FR-5.1: System shall notify a user of new incoming messages
- FR-5.2: System shall notify a user when @mentioned in a message
- FR-5.3: System shall notify a user when a file is shared with them
- FR-5.4: System shall notify a user of meeting invitations

### FR-6: Video/Audio Meetings
- FR-6.1: System shall support 1:1 video calls between two users
- FR-6.2: System shall support group video calls among multiple users
- FR-6.3: System shall allow users to toggle microphone and camera on/off during a call
- FR-6.4: System shall support screen sharing during a call
- FR-6.5: System shall allow users to join and leave a meeting at will

### FR-7: Admin Panel
- FR-7.1: System shall allow Admins to view and manage the employee list
- FR-7.2: System shall allow Admins to manage departments/teams
- FR-7.3: System shall allow Admins to disable/enable user accounts
- FR-7.4: System shall provide basic usage/audit information (e.g., login history, active user counts)

## 4. Non-Functional Requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NFR-1 | Performance | Message delivery latency under 2 seconds under normal load |
| NFR-2 | Scalability | Architecture should support incremental scaling of concurrent users without redesign |
| NFR-3 | Security | Passwords stored using strong hashing (e.g., bcrypt); all traffic over HTTPS/WSS |
| NFR-4 | Availability | Core chat functionality should target high uptime during business hours |
| NFR-5 | Usability | UI should follow familiar chat-app conventions to minimize training needs |
| NFR-6 | Data Integrity | No message or file loss on server restart; persistent storage for all chat data |
| NFR-7 | Auditability | Admin actions (disable user, delete department, etc.) shall be logged |
| NFR-8 | Maintainability | Codebase structured for a single/small dev team to extend easily (modular, documented) |

## 5. External Interface Requirements

- **User Interface:** Web-based responsive UI (desktop-first for MVP)
- **Communication Interfaces:** WebSocket for real-time chat/presence; WebRTC (direct or via managed service) for audio/video
- **Storage Interfaces:** Relational database for structured data; file/object storage for uploaded files

## 6. Traceability Note

Each functional requirement in this SRS maps to a corresponding feature in the PRD (Section 5.1) and should be reflected as user stories in the User Stories document.
