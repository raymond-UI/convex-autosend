import type { Attachment, ProviderCompatibilityMode } from "./types";

export type ProviderSendPayload = {
  to: string[];
  from: string;
  replyTo?: string;
  subject?: string;
  html?: string;
  text?: string;
  templateId?: string;
  dynamicData?: unknown;
  attachments?: Attachment[];
  metadata?: unknown;
};

export type ProviderOptions = {
  apiKey: string;
  baseUrl: string;
  compatibilityMode: ProviderCompatibilityMode;
};

export type ProviderSendResult =
  | {
      ok: true;
      providerMessageId: string;
      providerStatus?: string;
      responseBody?: unknown;
    }
  | {
      ok: false;
      retryable: boolean;
      error: string;
      statusCode?: number;
      responseBody?: unknown;
    };

export type ProviderBulkResult =
  | {
      ok: true;
      providerMessageIds: string[];
      responseBody?: unknown;
    }
  | {
      ok: false;
      retryable: boolean;
      error: string;
      statusCode?: number;
      responseBody?: unknown;
    };

function toEmailObject(address: string): { email: string } {
  return { email: address };
}

function buildBody(payload: ProviderSendPayload) {
  return {
    to: toEmailObject(payload.to[0]!),
    from: toEmailObject(payload.from),
    ...(payload.replyTo !== undefined ? { replyTo: toEmailObject(payload.replyTo) } : {}),
    ...(payload.subject !== undefined ? { subject: payload.subject } : {}),
    ...(payload.html !== undefined ? { html: payload.html } : {}),
    ...(payload.text !== undefined ? { text: payload.text } : {}),
    ...(payload.templateId !== undefined ? { templateId: payload.templateId } : {}),
    ...(payload.dynamicData !== undefined ? { dynamicData: payload.dynamicData } : {}),
    ...(payload.attachments !== undefined
      ? {
          attachments: payload.attachments.map((a) => ({
            fileName: a.filename,
            content: a.content,
            ...(a.contentType !== undefined ? { contentType: a.contentType } : {}),
            ...(a.disposition !== undefined ? { disposition: a.disposition } : {}),
          })),
        }
      : {}),
    ...(payload.metadata !== undefined ? { metadata: payload.metadata } : {}),
  };
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function pickString(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) return value;
  return undefined;
}

function extractProviderId(
  body: unknown,
  compatibilityMode: ProviderCompatibilityMode,
): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const data = body as Record<string, unknown>;

  const strictCandidates = [
    pickString(data.emailId),
    pickString((data.data as Record<string, unknown> | undefined)?.emailId),
  ];

  for (const candidate of strictCandidates) {
    if (candidate) return candidate;
  }

  if (compatibilityMode === "strict") return undefined;

  const lenientCandidates = [
    pickString(data.id),
    pickString(data.messageId),
    pickString((data.data as Record<string, unknown> | undefined)?.id),
    pickString((data.data as Record<string, unknown> | undefined)?.messageId),
  ];

  for (const candidate of lenientCandidates) {
    if (candidate) return candidate;
  }

  return undefined;
}

async function safeParseJson(response: Response): Promise<unknown | undefined> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

export async function normalizeError(
  response: Response,
  parsedBody?: unknown,
): Promise<string> {
  if (parsedBody && typeof parsedBody === "object") {
    const data = parsedBody as Record<string, unknown>;
    const fromFields = [
      pickString(data.error),
      pickString(data.message),
      pickString((data.error as Record<string, unknown> | undefined)?.message),
    ].find(Boolean);

    if (fromFields) {
      return `AutoSend ${response.status}: ${fromFields}`;
    }
  }

  try {
    const text = await response.text();
    if (text.trim().length > 0) {
      return `AutoSend ${response.status}: ${text}`;
    }
  } catch {
    // ignore
  }

  return `AutoSend ${response.status}: request failed`;
}

export async function sendOne(
  payload: ProviderSendPayload,
  options: ProviderOptions,
): Promise<ProviderSendResult> {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const endpoint = `${baseUrl}/v1/mails/send`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify(buildBody(payload)),
    });
  } catch (error) {
    return {
      ok: false,
      retryable: true,
      error: `AutoSend request failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const parsedBody = await safeParseJson(response);

  if (!response.ok) {
    return {
      ok: false,
      retryable: isRetryableStatus(response.status),
      error: await normalizeError(response, parsedBody),
      statusCode: response.status,
      responseBody: parsedBody,
    };
  }

  const providerMessageId =
    extractProviderId(parsedBody, options.compatibilityMode) ??
    pickString(response.headers.get("x-message-id") ?? undefined);

  if (!providerMessageId) {
    return {
      ok: false,
      retryable: false,
      error:
        "AutoSend success response missing email identifier (enable lenient mode if provider payload varies).",
      statusCode: response.status,
      responseBody: parsedBody,
    };
  }

  const providerStatus =
    parsedBody && typeof parsedBody === "object"
      ? pickString((parsedBody as Record<string, unknown>).status)
      : undefined;

  return {
    ok: true,
    providerMessageId,
    providerStatus,
    responseBody: parsedBody,
  };
}

export async function sendBulk(
  payloads: ProviderSendPayload[],
  options: ProviderOptions,
): Promise<ProviderBulkResult> {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const endpoint = `${baseUrl}/v1/mails/bulk`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify({ mails: payloads.map((payload) => buildBody(payload)) }),
    });
  } catch (error) {
    return {
      ok: false,
      retryable: true,
      error: `AutoSend bulk request failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const parsedBody = await safeParseJson(response);
  if (!response.ok) {
    return {
      ok: false,
      retryable: isRetryableStatus(response.status),
      error: await normalizeError(response, parsedBody),
      statusCode: response.status,
      responseBody: parsedBody,
    };
  }

  const providerMessageIds: string[] = [];

  if (Array.isArray((parsedBody as Record<string, unknown> | undefined)?.results)) {
    const results = (parsedBody as Record<string, unknown>).results as unknown[];
    for (const item of results) {
      const id = extractProviderId(item, options.compatibilityMode);
      if (id) providerMessageIds.push(id);
    }
  }

  if (providerMessageIds.length === 0) {
    const singleId = extractProviderId(parsedBody, options.compatibilityMode);
    if (singleId) providerMessageIds.push(singleId);
  }

  if (providerMessageIds.length === 0) {
    return {
      ok: false,
      retryable: false,
      error: "AutoSend bulk response missing email identifiers.",
      statusCode: response.status,
      responseBody: parsedBody,
    };
  }

  return {
    ok: true,
    providerMessageIds,
    responseBody: parsedBody,
  };
}
