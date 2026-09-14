export interface ReviveSession {
  id: string;
  owner: string;
  expiresAt: number;
  scanURL: string;
  size: number;
  modules: number[];
}

export class ReviveClient {
  private base: string;
  constructor() {
    const configured = typeof window !== 'undefined' && (window as any).WXSTACK_REVIVE_SERVICE;
    this.base = configured || (typeof location !== 'undefined' && /^https?:$/.test(location.protocol)
      ? `${location.protocol}//${location.hostname}:7461` : 'http://127.0.0.1:7461');
    this.base = this.base.replace(/\/$/, '');
  }
  async create(): Promise<ReviveSession> {
    const session = await this.request('POST', '/api/revive');
    if (!session || typeof session.id !== 'string' || !/^[A-Za-z0-9_-]{32}$/.test(session.id)
      || typeof session.owner !== 'string' || !/^[A-Za-z0-9_-]{32}$/.test(session.owner)
      || !Number.isFinite(session.expiresAt) || !Number.isInteger(session.size)
      || session.size < 21 || session.size > 177 || !Array.isArray(session.modules)
      || session.modules.length !== session.size * session.size
      || session.modules.some(value => value !== 0 && value !== 1)) throw new Error('二维码数据无效，请返回重试');
    return session;
  }
  status(session: ReviveSession): Promise<{ state: string }> {
    return this.request('GET', `/api/revive/${session.id}`, session.owner);
  }
  consume(session: ReviveSession): Promise<{ state: string }> {
    return this.request('POST', `/api/revive/${session.id}/consume`, session.owner);
  }
  cancel(session: ReviveSession): Promise<unknown> {
    return this.request('DELETE', `/api/revive/${session.id}`, session.owner);
  }
  private request(method: string, path: string, owner?: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(method, this.base + path, true);
      xhr.timeout = 8000;
      if (owner) xhr.setRequestHeader('Authorization', `Bearer ${owner}`);
      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) resolve(data);
          else reject(new Error(data.error || '复活服务暂不可用'));
        } catch { reject(new Error('复活服务返回异常，请返回重试')); }
      };
      xhr.onerror = xhr.ontimeout = () => reject(new Error('无法连接复活服务，请检查网络后重试'));
      xhr.send();
    });
  }
}
