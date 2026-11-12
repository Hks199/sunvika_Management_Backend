# Announcements

Web and mobile show an announcement bar beneath the workspace header, outside scrolling page content. Eligible active messages rotate newest-first every 12 seconds, wrapping through the complete feed. A single announcement stays visible. Previous, next and pause/resume controls are available; opening a full message pauses rotation. Hidden browser tabs and background mobile apps pause rotation. Expired announcements are removed locally without polling the server.

The bar loads on sign-in/mount. Refresh in the bar or management screen loads current data; publishing, editing and stopping a message refresh the publisher's bar. The 12-second timer changes the displayed message only: it does not refresh pages, queries, notifications or API data. The refresh control remains available when no messages exist.

| Publisher | Permitted audience | Scope |
| --- | --- | --- |
| RM | CP | Current downline only |
| CP Head | RM, CP | Current downline only |
| MIS | CP Head, RM, CP | Organization-wide for the selected roles |
| MD | Any active role except retired MH/Admin Head | Organization-wide |

The publisher can select one or more permitted audience roles. MD sees all active announcements regardless of target role and can manage every announcement. Other publishers manage only their own. CP and other recipient-only roles cannot publish. The authenticated viewer's current role and hierarchy determine delivery; MIS business visibility does not grant broader announcement feed or management access. Moving a CP to a new team removes the old team's announcements from its next feed request. No client-supplied author/scope field is trusted.

Publish from Announcements in the web sidebar or mobile More menu. Category is Business, Target or Motivation. Title is 1-160 characters and message 1-2000, rendered as plain text. Expiry is optional. Authors and MD can edit content/category/expiry, stop a message or reactivate it. Audience roles can be changed in the edit form. The current selection is prefilled, and the backend revalidates active roles against the editor's permitted audience. An audience change uses the editor's authorized scope: RM/CP Head remain limited to their own downline, while MIS/MD may use their organization-wide permitted roles. Only the original author or MD can edit. Content-only edits and unchanged audience selections preserve the existing scope. Reactivating an expired message also requires extending/removing its expiry.

## API

All endpoints require a live authenticated employee session. Role checks are enforced in the service and require no role-permission reseeding.

- GET /announcements/audience: publisher's available active role choices and TEAM/ORGANIZATION scope.
- POST /announcements: title, body, category (BUSINESS/TARGET/MOTIVATION), audienceRoles, optional expiresAt (future ISO timestamp or null).
- GET /announcements?page=1&limit=20: author's records, including stopped/expired; MD sees all authors.
- PATCH /announcements/:announcementId: one or more of title, body, category, expiresAt, isActive, audienceRoles. Ownership is checked before changing the record.
- GET /announcements/feed?page=1&limit=100: only eligible active and unexpired announcements, with author names/codes and pagination metadata. The clients load all pages so every eligible message can rotate.

Data is stored in the announcements collection, with creator and last editor references. No records are created until an authorized publisher submits a form.

Admin Head is retired. The audience API excludes its code and category, and publishing to ADMIN_HEAD is rejected even if legacy data is still active. Web/mobile also filter retired role names and codes and hide them in historical announcement audience labels.
