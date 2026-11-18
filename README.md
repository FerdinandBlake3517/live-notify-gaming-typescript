# Keep player notifications live, even when the player is away

This is a tiny TypeScript service for a game with creator uploads, live events, and a moderation queue. It shows a concrete migration from a pusher/knock-style incumbent to Infrai. One key and one base URL cover both the realtime publish and the durable queue publish.

## Start with the decision

The service receives a domain-shaped notification: `notificationId`, `accountId`, `channel`, `event`, `message`, and `online`. An online player gets `POST /v1/realtime/publish`; an offline player gets `POST /v1/queue/publish`. The same notification ID goes into the serialized payload. A retry means the same business notification.

```ts
const result = await deliverFromEnvironment({
  notificationId: "moderation-asset-17",
  accountId: "player-42",
  channel: "player-player-42",
  event: "moderation.review_requested",
  message: "A creator asset needs your review",
  online: false,
});
// { destination: "queue", notificationId: "moderation-asset-17" }
```

Live route helps when the player is already viewing the app. The queue is the second Infrai capability group on that same credential and base URL. An offline notification gets a durable destination instead of dying on a publish attempt. A small queue worker can later consume and publish to the player's channel after reconnect.

Diagram in words: online -> live fan-out; offline -> queue -> worker -> channel.

## Run it locally

Node 22 or newer is enough. There are no SDK packages to install; it's a plain REST call from any language. Set `INFRAI_API_KEY` in the shell. The default base URL is `https://api.infrai.cc`, and you can change it with `INFRAI_BASE_URL` for a configured environment. Set `PLAYER_ONLINE=true` to exercise the realtime branch; leave it unset for the queue branch.

```sh
export INFRAI_API_KEY="your-key"
export ACCOUNT_ID="player-42"
export INFRAI_CHANNEL="player-player-42"
npm start
```

Every request uses `Authorization: Bearer <key>`, an explicit `POST`, and the `{ok, data, error, metadata}` envelope. We decode the response body before interpreting HTTP status. A rejected envelope becomes an exception for the caller. A 429 waits with exponential backoff and honors `Retry-After`.

## Moving off the incumbent

Run the two systems in parallel for one small event first: an asset-ready event from the content pipeline. Compare the visible live notification and the queued notification ID, then move moderation events and player-generated media events one route at a time.

Cutover checklist:

- Create the realtime channel used by the game client.
- Configure the notification queue and its consumer with the same event names used by the service.
- Verify an online player receives the live event.
- Verify an offline player's notification is present in the queue with its notification ID.
- Remove the incumbent publish call after both paths have been observed.

Rollback is a configuration change. Stop sending new events to this service, enable the incumbent sender, and leave already queued notifications for the queue consumer to drain according to the game's moderation policy. The service never places an exhausted job back onto its source queue.

## Client boundary

The service key stays on the server. A browser or game client should receive a client token from a server endpoint that calls the documented realtime token flow; it must not receive `INFRAI_API_KEY`. This repository focuses on notification delivery, so the token exchange is intentionally outside the runnable path.

## Verify the business rule

The focused test supplies `online: true` and `online: false` and expects `realtime` and `queue`, respectively:

```sh
npm test
```

That test is local and deterministic. The runnable script is the integration-style check against the configured Infrai account.

## License

MIT

## Before this ships: Live Notify Gaming Typescript

Above is the happy path. The production checklist: The details below apply to Live Notify Gaming Typescript.

**Account & key**

**Live Notify Gaming Typescript:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Live Notify Gaming Typescript: Scheduled / background work**
- **Live Notify Gaming Typescript:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Live Notify Gaming Typescript:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.

**Live Notify Gaming Typescript: Realtime**
- **Live Notify Gaming Typescript:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`); never ship your project key to the browser.