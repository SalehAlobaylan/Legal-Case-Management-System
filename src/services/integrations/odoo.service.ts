export interface OdooAuthResponse {
  jsonrpc: string;
  id: number;
  result: number;
  error?: { code: number; message: string; data?: unknown };
}

export class OdooService {
  async authenticate(baseUrl: string, database: string, username: string, apiKey: string) {
    const payload = {
      jsonrpc: "2.0",
      method: "call",
      params: {
        service: "common",
        method: "authenticate",
        args: [database, username, apiKey, {}],
      },
      id: Date.now(),
    };
    const response = await fetch(`${baseUrl}/jsonrpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error("Failed to authenticate with Odoo");
    }
    const data = (await response.json()) as OdooAuthResponse;
    if (data.error || !data.result) {
      throw new Error(data.error?.message || "Odoo authentication failed");
    }
    return data.result;
  }

  async listPartners(baseUrl: string, database: string, uid: number, apiKey: string) {
    const payload = {
      jsonrpc: "2.0",
      method: "call",
      params: {
        service: "object",
        method: "execute_kw",
        args: [database, uid, apiKey, "res.partner", "search_read", [], {
          fields: ["name", "email", "phone", "mobile", "city", "country_id"],
          limit: 50,
        }],
      },
      id: Date.now(),
    };
    const response = await fetch(`${baseUrl}/jsonrpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error("Failed to fetch Odoo partners");
    }
    const data = (await response.json()) as { result?: Array<Record<string, unknown>>; error?: { message: string } };
    if (data.error) {
      throw new Error(data.error.message || "Odoo partner fetch failed");
    }
    return data.result || [];
  }
}
