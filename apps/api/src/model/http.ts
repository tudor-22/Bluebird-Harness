import { ModelUnavailableError } from "./ollama";

/** POSTs to a model service and turns connection and key problems into messages a person can act on. */
export async function postModel(
  engineName: string,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  signal?: AbortSignal,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ModelUnavailableError(
      `Cannot reach ${engineName}. Check that it is running and its address is right in Settings, Engine.`,
    );
  }
  if (response.status === 401 || response.status === 403) {
    throw new ModelUnavailableError(
      `${engineName} refused the API key. Check it in Settings, Engine.`,
    );
  }
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`model ${response.status}: ${detail}`);
  }
  return response;
}

/** Yields the data payload of each server-sent event. */
export async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary: number;
    while ((boundary = buffer.search(/\r?\n\r?\n/)) >= 0) {
      const event = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + (buffer[boundary] === "\r" ? 4 : 2));
      for (const line of event.split(/\r?\n/)) {
        if (line.startsWith("data:")) {
          const data = line.slice(5).trim();
          if (data) yield data;
        }
      }
    }
  }
}
