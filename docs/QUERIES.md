# Queries and bell notifications

RM and CP can raise a query to their active CP Head ancestor or any active MIS employee. The sender chooses CP Head or MIS, then the named recipient. MD can create queries to any active CP Head or MIS, view all conversations and reply to every query. CP Head and MIS can view/reply only to queries assigned to them, plus conversations they originally created if their role changed. RM/CP can view/reply to their own conversations. Other roles cannot access this feature.

Each new message creates a persistent QueryMessage and per-user QueryNotification records. New queries notify the chosen recipient and every active MD. Replies notify the other participant(s) and every active MD. A user receives one notification per message; MD is notified even for its own action, as requested. Thread, message and notifications are committed in one MongoDB transaction, requiring a replica set/Atlas (the same requirement as customer-to-CP conversion).

The red bell badge counts all unread notifications for the authenticated employee, independent of inbox pagination. Opening the bell alone does not mark anything read. Clicking a notification marks that notification read and opens its conversation. Displaying messages in an active conversation marks only those visible-page message IDs read for that viewer. Other participants and MD keep their independent unread counts. Reading twice is harmless, and new concurrent messages are not cleared by an older page's seen request.

Web and mobile use manual Refresh buttons for conversations, query lists and the notification inbox. There is no timed automatic refresh. Data also loads when a page or inbox is opened, and unread counts update after sending or reading a message. These are in-app notifications, with no push or email delivery configured.

## API

All routes require a valid live bearer session. Role and participant policies run on the server, independently of client menu visibility.

- GET /queries/recipients: available named CP Heads and MIS employees for a sender.
- GET /queries?page=1&limit=20: permitted conversations, most recently active first.
- POST /queries: title (1-160), body (1-5000), recipientRole (CP_HEAD or MIS), recipientId.
- GET /queries/:threadId?page=1&limit=50: thread and latest message page in chronological display order. Higher page numbers return older messages.
- POST /queries/:threadId/replies: body (1-5000).
- POST /queries/:threadId/seen: messageIds (1-50 distinct IDs). Changes only this viewer's unread notifications for those messages in this thread.
- GET /notifications?page=1&limit=20: own paginated inbox, full unreadCount and pagination metadata.
- POST /notifications/:notificationId/seen: own notification only. Returns the conversation ID.

Messages render as plain text in both clients. Responses populate only employee name and code. No employee permissions need reseeding: queries use the explicit role/participant policy above. Mongoose creates collections/indexes through the existing model setup; production deployments with autoIndex disabled should create the declared indexes through their usual deployment process.

MIS organization-wide business-record visibility does not widen query access. MIS-addressed threads are not visible to CP Heads, and CP Head-addressed threads are not visible to MIS. Only the named recipient, original sender and MD can view/reply. Other employees with the same recipient role are excluded.
