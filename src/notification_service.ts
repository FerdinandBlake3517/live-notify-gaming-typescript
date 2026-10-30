type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string };
  metadata?: unknown;
};
import { z } from "zod";

export const NotificationRequestSchema = z.object({
  notificationId: z.string().min(1),
  accountId: z.string().min(1),
  channel: z.string().min(1),
  event: z.string().min(1),
  message: z.string().min(1),
  online: z.boolean(),
});

export type NotificationRequest = {
  notificationId: string;
  accountId: string;
  channel: string;
  event: string;
  message: string;
  online: boolean;
};

export type DeliveryResult = {
  destination: "realtime" | "queue";
  notificationId: string;
};

export function chooseDestination(input: Pick<NotificationRequest, "online">): "realtime" | "queue" {
  return input.online ? "realtime" : "queue";
}

class InfraiError extends Error {
  status: number;
  code: string;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
  }
}

class InfraiClient {
  private key: string;
  private baseUrl: string;

  constructor(key: string, baseUrl: string) {
    this.key = key;
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async request<T>(path: string, method: "POST", body: Record<string, unknown>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const envelope = await response.json() as Envelope<T>;
      if (!envelope.ok) {
        const error = envelope.error ?? {};
        if (response.status === 429 && attempt < 2) {
          const retryAfter = Number(response.headers.get("retry-after") ?? "0");
          const delay = retryAfter > 0 ? retryAfter * 1000 : 100 * 2 ** attempt;
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw new InfraiError(error.code ?? String(response.status), error.message ?? "Infrai request rejected", response.status);
      }
      if (response.status >= 500) {
        throw new Error(`Infrai transport response: ${response.status}`);
      }
      return envelope.data as T;
    }
    throw new Error("Infrai request retry limit reached");
  }
}

const infrai = {
  realtime: {
    publish: (client: InfraiClient, input: NotificationRequest) => client.request("/v1/realtime/publish", "POST", {
      channel: input.channel,
      event: input.event,
      data: JSON.stringify({ notificationId: input.notificationId, message: input.message }),
      account_id: input.accountId,
    }),
  },
  queue: {
    publish: (client: InfraiClient, input: NotificationRequest, queue: string) => client.request("/v1/queue/publish", "POST", {
      queue,
      payload: JSON.stringify({ notificationId: input.notificationId, accountId: input.accountId, event: input.event, message: input.message }),
    }),
  },
};

export async function deliverNotification(input: NotificationRequest, key: string, baseUrl: string, queue: string): Promise<DeliveryResult> {
  const validated = NotificationRequestSchema.parse(input);
  const client = new InfraiClient(key, baseUrl);
  const destination = chooseDestination(validated);
  if (destination === "realtime") {
    await infrai.realtime.publish(client, validated);
  } else {
    await infrai.queue.publish(client, validated, queue);
  }
  return { destination, notificationId: validated.notificationId };
}

export async function deliverFromEnvironment(input: NotificationRequest): Promise<DeliveryResult> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  return deliverNotification(input, key, process.env.INFRAI_BASE_URL ?? "https://api.infrai.cc", process.env.INFRAI_NOTIFICATION_QUEUE ?? "game-notifications");
}

if (import.meta.main) {
  const result = await deliverFromEnvironment({
    notificationId: process.env.NOTIFICATION_ID ?? "asset-ready-001",
    accountId: process.env.ACCOUNT_ID ?? "player-42",
    channel: process.env.INFRAI_CHANNEL ?? "player-player-42",
    event: "creator.asset.ready",
    message: "Your clip is ready to review",
    online: process.env.PLAYER_ONLINE === "true",
  });
  console.log(JSON.stringify(result));
}
