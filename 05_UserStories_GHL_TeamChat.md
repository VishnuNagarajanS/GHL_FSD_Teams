# User Stories
## GHL Connect — Internal Team Communication Application

**Prepared by:** Vishnu, Fullstack Developer
**Document Version:** 1.0
**Status:** Draft

Format: `As a [role], I want to [action], so that [benefit].`
Each story includes acceptance criteria for dev/QA reference.

---

## Epic 1: Authentication

**US-1.1** As an employee, I want to log in with my company email and password, so that I can securely access the platform.
- AC: Invalid credentials show a clear error; successful login redirects to the main chat view.

**US-1.2** As an employee, I want to reset my password if I forget it, so that I can regain access without admin intervention.
- AC: Reset link sent to registered email; link expires after a set time; new password must meet complexity rules.

**US-1.3** As an admin, I want role-based access enforced, so that employees can't access admin-only functions.
- AC: Non-admin users attempting to access admin routes receive a 403/forbidden response and no UI access.

## Epic 2: User & Organization Management

**US-2.1** As an admin, I want to add/edit/remove employee records, so that the directory stays accurate.
- AC: Changes reflect immediately in the employee directory and affected user's profile.

**US-2.2** As an admin, I want to organize employees into departments/teams, so that group communication maps to the org structure.
- AC: A department can contain multiple employees; an employee can belong to at least one department.

**US-2.3** As an employee, I want to maintain my own profile (photo, designation, contact), so that colleagues can identify and reach me correctly.
- AC: Profile changes save and reflect across chat/UI without requiring re-login.

**US-2.4** As an employee, I want to see who's online, so that I know who's available to chat right now.
- AC: Presence updates in near real-time (within a few seconds) when a user connects/disconnects.

## Epic 3: Chat

**US-3.1** As an employee, I want to send a direct message to a colleague, so that we can communicate privately.
- AC: Message appears instantly for both sender and recipient if online; persists if recipient is offline.

**US-3.2** As an employee, I want to create a group chat, so that my team can discuss together.
- AC: Group creator can add/remove members; all members see the full message history from when they joined.

**US-3.3** As an employee, I want to edit or delete my sent messages, so that I can correct mistakes.
- AC: Edited messages show an "edited" indicator; deleted messages show a "message deleted" placeholder for other participants.

**US-3.4** As an employee, I want to see timestamps on messages, so that I know when something was sent.
- AC: Timestamp shown in local time, with relative format for recent messages (e.g., "2m ago").

**US-3.5** As an employee, I want to know if my message has been read, so that I know the recipient has seen it.
- AC: Read receipt updates when recipient opens the conversation.

**US-3.6** As an employee, I want to see when someone is typing, so that I know a reply is coming.
- AC: Typing indicator appears within 1-2 seconds of the other user typing and disappears after they stop.

**US-3.7** As an employee, I want to react to messages with emojis, so that I can respond quickly without typing.
- AC: Multiple users can react to the same message; reaction counts are visible to all participants.

## Epic 4: File Sharing

**US-4.1** As an employee, I want to attach and send a file in a chat, so that I can share documents with colleagues.
- AC: Upload shows progress; file appears as a downloadable attachment in the message once complete.

**US-4.2** As an employee, I want to download a file shared with me, so that I can use it locally.
- AC: Download works directly from the chat without needing external tools.

**US-4.3** As a system, I want to reject files exceeding size limits or disallowed types, so that storage and security are protected.
- AC: Clear error shown to the user when upload is rejected, stating the reason (size/type).

## Epic 5: Notifications

**US-5.1** As an employee, I want to be notified of new messages, so that I don't miss important communication.
- AC: Notification shown for messages in conversations not currently open/focused.

**US-5.2** As an employee, I want to be notified when I'm mentioned, so that I can respond to things directed at me.
- AC: @mention triggers a distinct notification even in muted group chats (if not fully muted).

**US-5.3** As an employee, I want to be notified when a file is shared with me, so that I know to check it.
- AC: Notification links directly to the message containing the file.

**US-5.4** As an employee, I want to be notified of meeting invitations, so that I can join on time.
- AC: Notification includes meeting time and a direct join link/button.

## Epic 6: Video/Audio Meetings

**US-6.1** As an employee, I want to start a 1:1 video call with a colleague, so that we can discuss things face-to-face.
- AC: Call connects within a few seconds; both parties see/hear each other once camera/mic permissions are granted.

**US-6.2** As an employee, I want to start or join a group video call, so that my whole team can meet.
- AC: Multiple participants can join the same room; video/audio works for all connected participants.

**US-6.3** As an employee, I want to toggle my mic and camera during a call, so that I can control what I share.
- AC: Toggling updates in real time for all participants.

**US-6.4** As an employee, I want to share my screen during a call, so that I can present something to the group.
- AC: Other participants see the shared screen; presenter can stop sharing at any time.

**US-6.5** As an employee, I want to leave a meeting at any time, so that I can exit when I'm done.
- AC: Leaving disconnects cleanly without disrupting the call for remaining participants.

## Epic 7: Admin Panel

**US-7.1** As an admin, I want to view and manage all employees, so that I can maintain accurate access records.
- AC: Admin can search/filter employees and perform edit/disable actions from a single view.

**US-7.2** As an admin, I want to manage departments, so that the org structure stays current.
- AC: Admin can create, rename, and delete departments; deleting a department prompts reassignment of its members.

**US-7.3** As an admin, I want to disable a user account, so that former/suspended employees lose access immediately.
- AC: Disabled users cannot log in; existing sessions are invalidated.

**US-7.4** As an admin, I want to view basic usage/audit information, so that I can monitor platform health and activity.
- AC: Dashboard shows active users, login activity, and key admin actions with timestamps.
