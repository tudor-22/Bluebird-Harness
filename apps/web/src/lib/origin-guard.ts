/**
 * Keeps other websites from driving the local app. Anything on the web can ask
 * the browser to send a request to localhost, so the app checks where each
 * request to its API really comes from, and which name it was sent to.
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** Extra host names allowed on purpose, such as a machine name on a home network. */
function extraHosts(): Set<string> {
  return new Set(
    (process.env.BLUEBIRD_ALLOWED_HOSTS ?? "")
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
  );
}

function hostnameOf(hostHeader: string): string {
  const value = hostHeader.trim().toLowerCase();
  // [::1]:3000 keeps its brackets; name:3000 loses the port.
  if (value.startsWith("[")) return value.slice(0, value.indexOf("]") + 1);
  return value.split(":")[0];
}

export type GuardVerdict = { ok: true } | { ok: false; reason: string };

export function checkApiRequest(input: {
  method: string;
  host: string | null;
  origin: string | null;
  fetchSite: string | null;
  fetchMode: string | null;
}): GuardVerdict {
  // DNS rebinding: a page on evil.example can resolve that name to 127.0.0.1.
  // The browser still sends the evil name as Host, so unknown names are refused.
  const name = hostnameOf(input.host ?? "");
  if (!LOCAL_HOSTS.has(name) && !extraHosts().has(name)) {
    return { ok: false, reason: "This address is not allowed." };
  }
  if (input.fetchSite === "cross-site" || input.fetchSite === "same-site") {
    // Opening a link to a page is fine; a script on another site is not.
    if (input.fetchMode !== "navigate" || input.method !== "GET") {
      return { ok: false, reason: "Requests from other sites are not allowed." };
    }
  }
  if (input.origin && input.origin !== "null") {
    let originHost = "";
    try {
      originHost = new URL(input.origin).host.toLowerCase();
    } catch {
      return { ok: false, reason: "Bad origin." };
    }
    if (originHost !== (input.host ?? "").trim().toLowerCase()) {
      return { ok: false, reason: "Requests from other sites are not allowed." };
    }
  } else if (input.origin === "null") {
    return { ok: false, reason: "Requests from other sites are not allowed." };
  }
  // A change needs proof it came from this app: an Origin that matched, or a
  // browser that says the request is same-origin.
  const changes = !["GET", "HEAD", "OPTIONS"].includes(input.method.toUpperCase());
  if (changes && !input.origin && input.fetchSite !== "same-origin" && input.fetchSite !== null) {
    return { ok: false, reason: "Requests from other sites are not allowed." };
  }
  return { ok: true };
}
