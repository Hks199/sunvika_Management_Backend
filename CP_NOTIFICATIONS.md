# Scheduled RM notifications for CPs

Web: **CP notifications** in the organization menu (`/cp-notifications`). Mobile: More -> CP notifications. Each RM can have multiple independent schedules, with separate messages, dates, times and repeats. Use Add notification to create one, Edit to change it and Delete to remove it after confirmation. RM controls self, CP Head controls RMs in their reporting hierarchy and MD controls all active RMs. MIS has organization-wide read-only visibility. Only current active CPs in the selected RM's hierarchy receive a run; inactive and transferred CPs are excluded. Retired roles are never offered.

Controls: title (100 characters), message (500), enabled/paused, start date, run duration (1-365 calendar days), send every N days (1-365), first send time and optional repeats every 15/30/60/120/180/240/360/720 minutes until the last send time. All times are IST. Overnight windows are not supported. The duration includes the start date. Editing affects future occurrences; an occurrence already queued keeps its original message. Pause prevents queued phone sends, but messages already delivered to an inbox cannot be recalled.

The backend checks schedules every 30 seconds. A unique schedule/time-slot record prevents duplicate bell deliveries on restart, edit or concurrent instances. A five-minute grace window permits a late tick; older missed occurrences are skipped instead of flooding CPs. Queued runs are recoverable with a five-minute ownership lease and transactional inbox/outbox creation. Runs more than one hour old, expired schedules and disabled schedules are cancelled before generating inbox messages. The backend must remain running for scheduled work.

Messages appear alongside existing query notifications in the bell, with recipient-private unread counts. Opening a message marks it seen and displays its full text. Existing query conversations retain their original privacy and navigation. CPs without registered phones still receive bell inbox messages. The interface uses manual refresh; a native notification event also refreshes unread counts.

Native phone push uses Expo's HTTPS push service. Tokens are private, tied to the active CP and authenticated refresh-token family, and disabled on sign-out where possible. Before each phone send, the worker rechecks current CP/RM activity, hierarchy, enabled schedule and session validity. Retries use exponential backoff (up to five attempts), claims prevent concurrent normal sends, and DeviceNotRegistered responses disable the device. Uncertain network failures can cause a repeated OS push; bell entries remain unique. Phone sends expire after one hour. Receipt checks distinguish Expo acceptance from FCM/APNs handoff; handoff is not proof the user read or saw a notification.

## Phone push activation (not yet configured)

The app currently has no Expo/EAS project ID. Bell messages and scheduling work independently. To enable background/closed-app phone notifications:

1. Link the mobile project to the organization's Expo/EAS project. Set `EXPO_PUBLIC_EAS_PROJECT_ID` in the mobile build environment (or configure `extra.eas.projectId`). `app.config.js` reads the variable without embedding credentials.
2. Configure Android FCM v1 credentials and iOS APNs credentials in that project's Expo/EAS account. The app uses package/bundle identifier `com.sunvika.management`.
3. Build and install a development or production app containing the new `expo-notifications` plugin. Expo Go does not support remote push notifications. CPs open their bell and choose **Enable phone notifications**, then grant phone permission. Already granted permission is registered automatically on CP sign-in.
4. If Expo push access-token security is enabled, configure `EXPO_PUSH_ACCESS_TOKEN` in the backend environment. This is a server secret, never an EXPO_PUBLIC variable. No token is required for projects that do not enable that optional security setting.

Sources: https://docs.expo.dev/push-notifications/push-notifications-setup/ and https://docs.expo.dev/push-notifications/sending-notifications/.

API: `GET /cp-reminders/managers`, `GET /cp-reminders?rmId=...`, `POST /cp-reminders/:rmId`, `PATCH /cp-reminders/schedules/:scheduleId`, `DELETE /cp-reminders/schedules/:scheduleId`, `GET /cp-reminders/:rmId/history`, `POST /push-devices`, `POST /push-devices/unregister`. Schedule writes validate the complete form and scope server-side. Device ownership is derived from authentication, never request-supplied employee IDs.

Indexes are initialized at backend startup, including production indexes. Tests: unit and HTTP suite; `CP_REMINDER_DB_TEST=1 node tests/cp-reminders.db.test.mjs` uses a unique temporary database and fully mocked Expo transport. It tests scope, timing, active recipients, duplicate runs, bell privacy, rollback, retry, invalid tokens and revoked sessions without sending a real push.


Deleting a schedule permanently removes its configuration and cancels only that schedule's pending runs and queued phone sends. Completed run history and already delivered CP inbox messages remain. A push already handed to the phone provider cannot be recalled. Other schedules for the same RM continue independently, including schedules at the same time. Editing never creates a new schedule; creating always adds another one. Schedule listing is paginated separately from delivery history in web and mobile.

Startup replaces the old unique RM and RM/time-slot indexes with a nonunique RM lookup and a unique schedule/time-slot index. The migration removes only these obsolete index constraints and preserves all existing schedules, runs, CP inbox messages and push delivery records. It is idempotent and tested against legacy indexes with historical data.
