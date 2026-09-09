# Business Requirements Document (BRD)
## GHL Internal Team Communication Application

**Prepared by:** Vishnu, Fullstack Developer
**Organization:** GHL India Ventures
**Document Version:** 1.0
**Status:** Draft

---

## 1. Purpose

This document defines the business need, objectives, scope, and stakeholders for building an in-company communication application (internally referred to as **"GHL Connect"**), similar to Microsoft Teams/Slack, to be used across departments for messaging, file sharing, and video/audio meetings.

## 2. Business Problem / Opportunity

GHL India Ventures currently relies on external, fragmented communication tools for internal collaboration. This creates:
- No centralized, company-owned record of internal communication
- Dependence on third-party platforms for sensitive internal discussions
- No unified admin visibility into company communication activity
- Licensing costs for external tools that scale with headcount

Building an in-house solution addresses data ownership, cost control, and allows the platform to be tailored to GHL's specific organizational structure (departments, teams, roles) and future integrations (HR, attendance, project tools).

## 3. Business Objectives

| # | Objective | Success Measure |
|---|-----------|------------------|
| 1 | Replace external chat tools with an internal platform | 100% of internal messaging moved to the new app within rollout period |
| 2 | Provide secure, role-based access to company communication | Zero unauthorized access incidents |
| 3 | Enable real-time collaboration (chat, file sharing, meetings) | Sub-2-second message delivery; stable video calls for teams up to expected group size |
| 4 | Give admins visibility & control over company communication usage | Admin panel live with employee/department management and audit logs |
| 5 | Support regional workforce communication needs (Tamil/English) | Tanglish-aware chat features available (phase 2) |

## 4. Scope

### In Scope (Phase 1 — MVP)
- Authentication & role-based access
- Employee, department/team, and profile management
- One-to-one and group chat with core messaging features
- File sharing attached to chat
- In-app notifications
- One-to-one and group video/audio meetings
- Admin panel for employee/department management and basic audit info

### Out of Scope (Phase 1)
- Mobile native apps (web-first for MVP)
- Third-party calendar/HR system integrations
- AI-powered features (smart search, meeting summarization, Tanglish translation) — planned for Phase 2
- Message retention/compliance policy engine — planned for Phase 2

## 5. Stakeholders

| Stakeholder | Role |
|-------------|------|
| GHL Leadership | Project sponsor, final approval |
| Vishnu (Fullstack Developer) | Sole developer, Phase 1 build |
| Reporting Manager / TL | Requirement validation, review |
| All GHL Employees | End users |
| IT/Admin team | Platform administrators post-launch |

## 6. Assumptions

- Company email domain will be used as the basis for authentication
- Initial user base size is within a single-server deployment's capacity for Phase 1
- Video/audio meetings can use a third-party WebRTC infrastructure (e.g., managed TURN/STUN) rather than building media servers from scratch
- Employees will access the app primarily via web browser for MVP

## 7. Constraints

- Single-developer build for Phase 1 — feature scope must stay realistic for MVP timelines
- No existing internal infrastructure/backend to build on (greenfield project)
- Must be built and delivered incrementally (basic build first, features added after)

## 8. Business Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Video/audio infra complexity underestimated | Delays MVP | Use managed WebRTC service (e.g., LiveKit/Twilio) rather than custom media server for Phase 1 |
| Low adoption if UX is worse than existing tools | Wasted effort | Prioritize core chat UX polish before expanding features |
| Security gaps in a first-time build | Data exposure | Role-based access + audit logging built in from Phase 1 |

## 9. High-Level Timeline (indicative)

| Phase | Deliverable |
|-------|-------------|
| Phase 1 | Auth, org/user management, 1:1 & group chat, file sharing, notifications, admin panel |
| Phase 1.5 | Video/audio meetings |
| Phase 2 | AI features, compliance/retention, integrations, mobile apps |

## 10. Approval

| Name | Role | Signature | Date |
|------|------|-----------|------|
| | Project Sponsor | | |
| | Reporting Manager | | |
| Vishnu | Developer | | |
