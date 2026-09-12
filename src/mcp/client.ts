export class MeetgridClient {
  constructor(private baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    const data = (await res.json()) as T & { error?: string };
    if (!res.ok) {
      throw new Error(data.error ?? `HTTP ${res.status}`);
    }
    return data;
  }

  createPoll(body: {
    title: string;
    notes?: string;
    slug?: string;
    poll_id?: string;
    name?: string;
    timezone: string;
    slots?: Array<{
      date?: string;
      start_time?: string;
      duration_minutes?: number;
      start_utc?: string;
      end_utc?: string;
    }>;
    duration_minutes?: number;
    start_date?: string;
    end_date?: string;
    daily_start?: string;
    daily_end?: string;
    weekdays?: number[];
  }) {
    return this.request('/api/polls', { method: 'POST', body: JSON.stringify(body) });
  }

  getPoll(pollId: string) {
    return this.request(`/api/polls/${pollId}`);
  }

  respond(
    pollId: string,
    body: {
      name: string;
      edit_token?: string;
      votes: Array<{ slot_id: string; yes: boolean }>;
    }
  ) {
    return this.request(`/api/polls/${pollId}/respond`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  setDecision(pollId: string, organizerSecret: string, slotId: string) {
    return this.request(`/api/polls/${pollId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ organizer_secret: organizerSecret, slot_id: slotId }),
    });
  }

  closePoll(pollId: string, organizerSecret: string) {
    return this.request(`/api/polls/${pollId}/close`, {
      method: 'POST',
      body: JSON.stringify({ organizer_secret: organizerSecret }),
    });
  }
}
