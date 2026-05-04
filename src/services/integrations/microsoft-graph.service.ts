export interface MicrosoftTokensResponse {
  token_type: string;
  scope: string;
  expires_in: number;
  access_token: string;
  refresh_token?: string;
}

export class MicrosoftGraphService {
  private baseUrl = "https://graph.microsoft.com/v1.0";

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly tenantId: string,
    private readonly redirectUri: string
  ) {}

  getAuthorizationUrl(state: string, orgId: number) {
    const redirectUrl = new URL(this.redirectUri);
    redirectUrl.searchParams.set("org", String(orgId));
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: "code",
      redirect_uri: redirectUrl.toString(),
      response_mode: "query",
      scope: "offline_access openid profile email Calendars.Read",
      state,
    });
    return `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/authorize?${params.toString()}`;
  }

  async exchangeCode(code: string) {
    const tokenUrl = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: this.redirectUri,
      grant_type: "authorization_code",
      code,
    });
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!response.ok) {
      throw new Error("Failed to exchange Microsoft OAuth code");
    }
    return (await response.json()) as MicrosoftTokensResponse;
  }

  async refreshToken(refreshToken: string) {
    const tokenUrl = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: this.redirectUri,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: "offline_access openid profile email Calendars.Read",
    });
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!response.ok) {
      throw new Error("Failed to refresh Microsoft OAuth token");
    }
    return (await response.json()) as MicrosoftTokensResponse;
  }

  async listCalendarEvents(accessToken: string) {
    const response = await fetch(`${this.baseUrl}/me/events?$top=50`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      throw new Error("Failed to fetch Microsoft calendar events");
    }
    return response.json() as Promise<{ value: Array<Record<string, unknown>> }>;
  }
}
