import type { AiAttachable, AiMessage, AiSource, AiThread, AiThreadDetail, Conversation, MessagePage, Message, NodeView, WorkspaceDetail, WorkspaceList, ConversationState } from "../collab/types";
import { USING_FIXTURES } from "./client";
import { fixtures } from "../home/fixtures";

const BASE = "/api";

// Server error codes -> sentences a person can read.
const MESSAGES: Record<string, string> = {
  request_pending: "You've already sent a request. They need to accept before you can send more.",
  request_declined: "They declined your request.",
  conversation_declined: "You declined this conversation.",
  rate_limited: "You're sending too fast — wait a moment.",
  already_answering: "The assistant is still answering the previous question.",
  model_unavailable: "The AI model isn't available right now.",
  generation_failed: "The assistant couldn't finish that answer. Try again.",
  message_too_long: "That message is too long (4000 characters max).",
  message_required: "Write a message first.",
  not_found: "That no longer exists, or you don't have access.",
  name_taken: "Something with that name already exists here.",
  invalid_name: "Names can't contain / or \\.",
  owner_only: "Only the owner can do that.",
  owner_must_transfer: "Transfer ownership to someone else before leaving.",
  invitee_not_a_contact: "You can only invite people you've already messaged and who accepted.",
  file_too_large: "That file is over the 10 MB limit.",
  workspace_full: "This workspace is out of space (200 MB).",
  too_many_files: "This workspace has too many files.",
  cannot_move_into_itself: "A folder can't be moved into itself.",
  unauthenticated: "Please sign in again.",
  demo_backend_required: "This feature needs the connected backend. The local preview does not send messages, share files, or run an AI model.",
  demo_request_pending: "Your preview request is saved on this browser. No message was sent; replies require the connected backend.",
};

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(MESSAGES[code] ?? `Something went wrong (${code}).`);
  }
}

export const DEMO_COLLAB_UPDATED = "link:demo-collaboration-updated";
const DEMO_CONVERSATIONS_KEY = "link.demo.conversations.v1";
type DemoConversation = { conversation: Conversation; messages: Message[] };
let demoConversations: DemoConversation[] = [];
if (USING_FIXTURES) {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(DEMO_CONVERSATIONS_KEY) ?? "[]");
    if (Array.isArray(stored)) {
      demoConversations = stored.filter((item): item is DemoConversation => {
        const conversation = item?.conversation;
        return conversation && typeof conversation.id === "string" && conversation.state === "requested" &&
          typeof conversation.updatedAt === "string" &&
          fixtures.people.some(({ actor }) => actor.id === conversation.counterparty?.id) &&
          Array.isArray(item.messages) && item.messages.every((message: Message) =>
            message && typeof message.id === "string" && typeof message.body === "string" &&
            typeof message.senderId === "string" && typeof message.createdAt === "string",
          );
      }).map((item, conversationIndex) => {
        // Message pagination in the shared UI compares bigint IDs, just like
        // the backend. Normalize older preview IDs before they reach it.
        const messages = item.messages.map((message, messageIndex) => ({
          ...message,
          id: /^\d+$/.test(message.id) ? message.id : `${Date.now()}${String(conversationIndex).padStart(3, "0")}${String(messageIndex).padStart(3, "0")}`,
        }));
        return {
          conversation: {
            ...item.conversation,
            counterparty: fixtures.people.find(({ actor }) => actor.id === item.conversation.counterparty.id)!.actor,
            incomingRequest: false,
            unread: 0,
            lastMessage: messages[messages.length - 1] ?? null,
          },
          messages,
        };
      });
    }
  } catch {
    // Browser storage is optional; requests can still be previewed in memory.
  }
}

function saveDemoConversations() {
  try {
    localStorage.setItem(DEMO_CONVERSATIONS_KEY, JSON.stringify(demoConversations));
  } catch {
    // A full or unavailable store must not prevent a local preview.
  }
  window.dispatchEvent(new Event(DEMO_COLLAB_UPDATED));
}

async function demoCall<T>(method: string, path: string, body?: unknown): Promise<T> {
  const route = path.split("?")[0];
  let result: unknown;
  if (method === "GET" && route === "/conversations") {
    result = demoConversations.map(({ conversation }) => ({ ...conversation }));
  } else if (method === "GET" && route === "/workspaces") {
    result = { workspaces: [], invites: [] };
  } else if (method === "GET" && route === "/ai/threads") {
    result = [];
  } else if (method === "GET" && route === "/ai/sources") {
    result = { conversations: [], workspaces: [] };
  } else if (method === "POST" && route === "/conversations") {
    const request = body as { targetId: string; body: string };
    const counterparty = fixtures.people.find(({ actor }) => actor.id === request.targetId)?.actor;
    if (!counterparty) throw new ApiError(404, "not_found");
    if (!request.body.trim()) throw new ApiError(400, "message_required");
    if (request.body.length > 4000) throw new ApiError(400, "message_too_long");
    if (demoConversations.some(({ conversation }) => conversation.counterparty.id === request.targetId)) {
      throw new ApiError(409, "demo_request_pending");
    }
    const createdAt = new Date().toISOString();
    const id = `demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const message: Message = { id: `${Date.now()}${Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0")}`, senderId: fixtures.viewer.id, body: request.body.trim(), createdAt };
    const conversation: Conversation = {
      id, state: "requested", incomingRequest: false, counterparty,
      lastMessage: message, unread: 0, updatedAt: createdAt,
    };
    demoConversations.unshift({ conversation, messages: [message] });
    saveDemoConversations();
    result = { conversationId: id, state: "requested", message };
  } else if (method === "GET" && /^\/conversations\/[^/]+\/messages$/.test(route)) {
    const record = demoConversations.find(({ conversation }) => conversation.id === route.split("/")[2]);
    if (!record) throw new ApiError(404, "not_found");
    result = { state: record.conversation.state, counterpartyId: record.conversation.counterparty.id, incomingRequest: false, messages: record.messages.map((message) => ({ ...message })) };
  } else if (method === "POST" && /^\/conversations\/[^/]+\/read$/.test(route)) {
    result = undefined;
  } else if (method === "POST" && /^\/conversations\/[^/]+\/messages$/.test(route)) {
    throw new ApiError(409, "demo_request_pending");
  } else if (method === "GET") {
    throw new ApiError(404, "not_found");
  } else {
    throw new ApiError(503, "demo_backend_required");
  }
  return result as T;
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (USING_FIXTURES) return demoCall<T>(method, path, body);
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: "include",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let code = `http_${res.status}`;
    try {
      code = ((await res.json()) as { error?: string }).error ?? code;
    } catch {
      // not JSON — keep the status code
    }
    if (res.status === 401) code = "unauthenticated";
    throw new ApiError(res.status, code);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export interface AiStreamHandlers {
  onStatus?: (text: string) => void;
  onSources?: (sources: import("../collab/types").AiExcerpt[]) => void;
  onToken: (text: string) => void;
  onDone?: (info: { id: string; firstTokenMs: number | null }) => void;
}

// The answer arrives as server-sent events over a POST, so it is read with
// fetch + a stream reader (EventSource can't POST).
async function streamAnswer(threadId: string, text: string, h: AiStreamHandlers, signal: AbortSignal): Promise<void> {
  if (USING_FIXTURES) throw new ApiError(503, "demo_backend_required");
  const res = await fetch(`${BASE}/ai/threads/${threadId}/messages`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal,
  });
  if (!res.ok || !res.body) {
    let code = `http_${res.status}`;
    try {
      code = ((await res.json()) as { error?: string }).error ?? code;
    } catch {
      // keep the status code
    }
    throw new ApiError(res.status, code);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let end: number;
    while ((end = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const event = /^event: (.+)$/m.exec(block)?.[1];
      const data = /^data: (.+)$/m.exec(block)?.[1];
      if (!event || !data) continue;
      const payload = JSON.parse(data);
      if (event === "status") h.onStatus?.(payload.text);
      else if (event === "sources") h.onSources?.(payload);
      else if (event === "token") h.onToken(payload.text);
      else if (event === "done") h.onDone?.(payload);
      else if (event === "error") throw new ApiError(500, payload.code ?? "generation_failed");
    }
  }
}

export const collabApi = {
  aiSources: () => call<AiAttachable>("GET", "/ai/sources"),
  aiThreads: () => call<AiThread[]>("GET", "/ai/threads"),
  aiThread: (id: string) => call<AiThreadDetail>("GET", `/ai/threads/${id}`),
  aiMessages: (id: string) => call<AiMessage[]>("GET", `/ai/threads/${id}/messages`),
  createAiThread: (sources: AiSource[]) => call<{ id: string }>("POST", "/ai/threads", { sources }),
  setAiSources: (id: string, sources: AiSource[]) => call<void>("PUT", `/ai/threads/${id}/sources`, { sources }),
  deleteAiThread: (id: string) => call<void>("DELETE", `/ai/threads/${id}`),
  streamAnswer,

  conversations: () => call<Conversation[]>("GET", "/conversations"),
  messages: (id: string, before?: string) =>
    call<MessagePage>("GET", `/conversations/${id}/messages?limit=50${before ? `&before=${before}` : ""}`),
  send: (id: string, body: string) => call<Message>("POST", `/conversations/${id}/messages`, { body }),
  start: (targetId: string, body: string) =>
    call<{ conversationId: string; state: ConversationState; message: Message }>("POST", "/conversations", { targetId, body }),
  accept: (id: string) => call<{ state: ConversationState }>("POST", `/conversations/${id}/accept`),
  decline: (id: string) => call<{ state: ConversationState }>("POST", `/conversations/${id}/decline`),
  read: (id: string) => call<void>("POST", `/conversations/${id}/read`),

  workspaces: () => call<WorkspaceList>("GET", "/workspaces"),
  workspace: (id: string) => call<WorkspaceDetail>("GET", `/workspaces/${id}`),
  createWorkspace: (name: string, inviteeIds: string[]) => call<{ id: string }>("POST", "/workspaces", { name, inviteeIds }),
  renameWorkspace: (id: string, name: string) => call<void>("PATCH", `/workspaces/${id}`, { name }),
  deleteWorkspace: (id: string) => call<void>("DELETE", `/workspaces/${id}`),
  leaveWorkspace: (id: string) => call<{ result: "left" | "deleted" }>("POST", `/workspaces/${id}/leave`),
  invite: (id: string, actorIds: string[]) => call<void>("POST", `/workspaces/${id}/invites`, { actorIds }),
  respondInvite: (id: string, accept: boolean) => call<void>("POST", `/workspaces/${id}/invite/${accept ? "accept" : "decline"}`),
  removeMember: (id: string, actorId: string) => call<void>("DELETE", `/workspaces/${id}/members/${actorId}`),
  transferOwner: (id: string, actorId: string) => call<void>("POST", `/workspaces/${id}/owner`, { actorId }),

  createNode: (id: string, kind: "file" | "folder", name: string, parentId: string | null) =>
    call<NodeView>("POST", `/workspaces/${id}/nodes`, { kind, name, parentId }),
  updateNode: (id: string, nodeId: string, patch: { name?: string; parentId?: string | null }) =>
    call<void>("PATCH", `/workspaces/${id}/nodes/${nodeId}`, patch),
  deleteNode: (id: string, nodeId: string) => call<void>("DELETE", `/workspaces/${id}/nodes/${nodeId}`),
  rawUrl: (id: string, nodeId: string) => `${BASE}/workspaces/${id}/nodes/${nodeId}/raw`,

  async upload(id: string, files: File[], parentId: string | null): Promise<{ failed: { name: string; error: string }[] }> {
    if (USING_FIXTURES) throw new ApiError(503, "demo_backend_required");
    const form = new FormData();
    for (const f of files) form.append("files", f);
    if (parentId) form.append("parentId", parentId);
    const res = await fetch(`${BASE}/workspaces/${id}/upload`, { method: "POST", credentials: "include", body: form });
    const body = (await res.json().catch(() => ({}))) as { error?: string; failed?: { name: string; error: string }[] };
    if (!res.ok) throw new ApiError(res.status, body.error ?? `http_${res.status}`);
    return { failed: body.failed ?? [] };
  },
};
