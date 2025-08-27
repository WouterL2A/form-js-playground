export type Http = (url: string, init?: RequestInit) => Promise<Response>;
const toJson = (r: Response) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))));

type FindLatestOpts = { apiBase: string; fetchImpl?: Http };

async function getLatestByFormId(
  { apiBase, fetchImpl = fetch }: FindLatestOpts,
  resource: string,
  formId: string,
  jsonField: string,      // "content_json"
): Promise<any | null> {
  const tryFiltered = async () => {
    const url = `${apiBase}/${resource}?filter=form_id==${encodeURIComponent(formId)}&sort=-valid_from&limit=1`;
    const arr = await toJson(await fetchImpl(url));
    if (Array.isArray(arr) && arr.length) {
      const row = arr[0];
      return row[jsonField] ?? row;
    }
    return null;
  };

  const tryFallback = async () => {
    const url = `${apiBase}/${resource}?limit=100&offset=0`;
    const arr = await toJson(await fetchImpl(url));
    if (!Array.isArray(arr)) return null;
    const rows = arr.filter((r: any) => r.form_id === formId);
    rows.sort((a, b) => new Date(b.valid_from || 0).getTime() - new Date(a.valid_from || 0).getTime());
    const row = rows[0];
    return row ? (row[jsonField] ?? row) : null;
  };

  try { return await tryFiltered(); } catch { return await tryFallback(); }
}

export class GeneratedCrudProvider {
  constructor(private apiBase: string, private http: Http = fetch) {}

  async fetchSchema(formId: string): Promise<any | null> {
    return getLatestByFormId({ apiBase: this.apiBase, fetchImpl: this.http }, 'form_definition', formId, 'content_json');
  }

  async publishSchema(formId: string, schemaJson: any): Promise<void> {
    const body = {
      form_id: formId,
      content_profile: 'formjs@1',
      content_json: schemaJson,
    };
    const res = await this.http(`${this.apiBase}/form_definition`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(String(res.status));
  }

  async fetchBehaviors(formId: string): Promise<any | null> {
    return getLatestByFormId({ apiBase: this.apiBase, fetchImpl: this.http }, 'form_behavior', formId, 'content_json');
  }

  async publishBehaviors(formId: string, payloadJson: any): Promise<void> {
    const body = {
      form_id: formId,
      content_profile: 'behavior.matrix@1',
      content_json: payloadJson,
    };
    const res = await this.http(`${this.apiBase}/form_behavior`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(String(res.status));
  }

  async saveEntry(formId: string, data: any, state: string): Promise<void> {
    const body = {
      form_id: formId,
      content_profile: 'entry@1',
      content_json: data,
      state
    };
    const res = await this.http(`${this.apiBase}/form_entry`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(String(res.status));
  }
}
