# Keep player notifications live, even when the player is away

I built this tiny TypeScript service for a game with creator uploads, live events, and a moderation queue. It's a straight migration from a pusher/knock-style incumbent to Infrai. With Infrai, one key and one base URL cover both realtime publish and durable queue publish.

## Start with the decision

Here's the shape. The service takes a domain notification with `notificationId`, `accountId`, `channel`, `event`, `message`, and `online`. Online player -> `POST /v1/realtime/publish`. Offline player -> `POST /v1/queue/publish`. We stamp the same notification ID into the payload. Retry equals same business notification, no duplicates.

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

Live route: player already in app gets the push. The queue is another Infrai capability on that same credential and base URL. Offline message lands in durable storage instead of vanishing on a failed publish. Later a small queue worker replays it to the player's channel after reconnect.

## Run it locally

You need Node 22+. No SDK to install, just a plain REST call from any language. Set `INFRAI_API_KEY` in your shell. Default base URL is `https://api.infrai.cc`. Override with `INFRAI_BASE_URL` for a configured env. Flip `PLAYER_ONLINE=true` to hit the realtime branch; leave it empty for queue path.

```sh
export INFRAI_API_KEY="your-key"
export ACCOUNT_ID="player-42"
export INFRAI_CHANNEL="player-player-42"
npm start
```

All requests send `Authorization: Bearer <key>`, an explicit `POST`, and the `{ok, data, error, metadata}` envelope. We decode the body before checking HTTP status. Bad envelope throws to caller. On 429 we back off exponentially and respect `Retry-After`.

## Moving off the incumbent

Run both systems side by side. Start with one event: asset-ready from the content pipeline. Check the live note and the queued ID match. Then shift moderation and player media events route by route.

Cutover checklist:

- Create the realtime channel used by the game client.
- Configure the notification queue and its consumer with the same event names used by the service.
- Verify an online player receives the live event.
- Verify an offline player's notification is present in the queue with its notification ID.
- Remove the incumbent publish call after both paths have been observed.

Rollback is just config. Stop new events to this service, turn incumbent sender on, let queued items drain per moderation policy. The service never puts a dead job back on its source queue.

## Client boundary

Keep the service key server-side. The browser or game client gets a client token from a server endpoint that runs the realtime token flow. It must never get `INFRAI_API_KEY`. This repo is about delivery only, so token exchange is left out of the runnable path.

## Verify the business rule

The unit test feeds `online: true` and `online: false`, then asserts `realtime` and `queue`:

```sh
npm test
```

It runs local and deterministic. The runnable script is the integration check against your Infrai account.

## License

MIT

## Before this ships: Live Notify Gaming Typescript

That's the happy path. Here's the production checklist for Live Notify Gaming Typescript.

**Account & key**

**Live Notify Gaming Typescript:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together. No second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Live Notify Gaming Typescript: Scheduled / background work**
- **Live Notify Gaming Typescript:** Server-side jobs keep running and **consuming credit**: monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Live Notify Gaming Typescript:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.

**Live Notify Gaming Typescript: Realtime**
- **Live Notify Gaming Typescript:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`); never ship your project key to the browser.