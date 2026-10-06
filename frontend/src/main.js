import { LitElement, css, html } from "lit";

const TOKEN_KEY = "tanpit_token";
const LABELS = { fill: "注液", tanning: "鞣制中", drained: "已放液" };
// 水缸示意满缸刻度（升），仅用于水位可视化，不约束真实水位
const TANK_FULL_LITERS = 10;

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body) headers["Content-Type"] = "application/json";
  const t = localStorage.getItem(TOKEN_KEY);
  if (t) headers.Authorization = `Bearer ${t}`;
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || "请求失败");
  return data;
}

class TanYard extends LitElement {
  static properties = {
    ready: { type: Boolean },
    route: { type: String },
    role: { type: String },
    board: { type: Object },
    yards: { type: Array },
    buckets: { type: Array },
    yardFilter: { type: String },
    picked: { type: Object },
    ph: { type: String },
    drafts: { type: Object },
    msg: { type: String },
    msgKind: { type: String },
    username: { type: String },
    password: { type: String },
  };

  static styles = css`
    :host { display: block; font-family: "KaiTi", serif; color: #2b2118; }
    .topbar {
      display: flex; align-items: center; gap: 18px;
      background: #3a2c1e; color: #f3e9d8; padding: 10px 18px;
      position: sticky; top: 0; z-index: 5;
    }
    .topbar .brand { font-size: 1.15em; font-weight: bold; margin-right: auto; }
    .topbar a { color: #e8d3a8; text-decoration: none; padding: 4px 10px; border-radius: 6px; }
    .topbar a.active { background: #6b4e2e; color: #fff; }
    .topbar .who { font-size: 0.9em; color: #cbb894; }
    .topbar button { background: none; border: 1px solid #cbb894; color: #e8d3a8; padding: 3px 10px; }
    .wrap { max-width: 880px; margin: 0 auto; padding: 24px 16px 50px; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
    .pit { min-height: 110px; border-radius: 8px; color: #fff; cursor: pointer; border: 0; font: inherit; }
    .fill { background: #6d8f9e; }
    .tanning { background: #8a5a2b; }
    .drained { background: #5f6f4a; }
    .msg { color: #9b1c1c; white-space: pre-line; }
    .msg.ok { color: #2f6b34; }
    .hint { color: #6b5a48; font-size: 0.92em; }
    label { display: block; margin: 8px 0; }
    input, select, button { font: inherit; padding: 8px 10px; margin: 4px 6px 4px 0; }
    .bucket-card {
      display: flex; gap: 22px; align-items: center;
      border: 1px solid #d8c7ad; border-radius: 10px; padding: 18px 20px; margin: 14px 0;
      background: #fbf6ec;
    }
    .bucket-card.retired { opacity: 0.55; background: #f1ede4; }
    .tank {
      position: relative; width: 110px; height: 170px; flex: none;
      border: 4px solid #46657a; border-top: 0; border-radius: 0 0 16px 16px;
      overflow: hidden; background: #eef3f6;
    }
    .tank .water {
      position: absolute; left: 0; right: 0; bottom: 0;
      background: linear-gradient(180deg, #69b7d6 0%, #3d88b0 100%);
      transition: height 0.5s ease;
    }
    .tank .readout {
      position: absolute; inset: 0; display: flex; flex-direction: column;
      align-items: center; justify-content: center; font-weight: bold;
      color: #23323d; text-shadow: 0 0 3px #eaf6fb;
    }
    .tank .readout .num { font-size: 1.5em; }
    .tank.low .readout { color: #9b1c1c; text-shadow: 0 0 3px #fdecec; }
    .tag { display: inline-block; font-size: 0.8em; padding: 2px 8px; border-radius: 10px; }
    .tag.active { background: #2f6b34; color: #fff; }
    .tag.retired { background: #8a7d68; color: #fff; }
  `;

  constructor() {
    super();
    this.ready = false;
    this.route = "board";
    this.role = "";
    this.board = null;
    this.yards = [];
    this.buckets = [];
    this.yardFilter = "";
    this.picked = null;
    this.ph = "4.2";
    this.drafts = {};
    this.msg = "";
    this.msgKind = "err";
    this.username = "admin";
    this.password = "123456";
    this._onHash = () => this.loadRoute();
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("hashchange", this._onHash);
    if (localStorage.getItem(TOKEN_KEY)) this.bootstrap();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("hashchange", this._onHash);
  }

  currentRoute() {
    return location.hash.replace(/^#/, "").startsWith("/buckets") ? "buckets" : "board";
  }

  async bootstrap() {
    try {
      const me = await api("/api/auth/me");
      this.role = me.role;
      this.ready = true;
      this.loadRoute();
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      this.ready = false;
    }
  }

  loadRoute() {
    this.route = this.currentRoute();
    this.msg = "";
    if (!this.ready) return;
    if (this.route === "buckets") this.loadBuckets();
    else this.refreshBoard();
  }

  async refreshBoard() {
    try {
      this.board = await api("/api/board");
      if (this.picked) {
        this.picked = this.board.pits.find((p) => p.id === this.picked.id) || this.board.pits[0];
      }
    } catch (e) {
      this.fail(e.message);
    }
  }

  async loadBuckets() {
    try {
      if (!this.yards.length) this.yards = await api("/api/yards");
      const qs = this.yardFilter ? `?yard_id=${encodeURIComponent(this.yardFilter)}` : "";
      this.buckets = await api(`/api/buckets${qs}`);
    } catch (e) {
      this.fail(e.message);
    }
  }

  fail(message) {
    this.msg = message;
    this.msgKind = "err";
  }

  ok(message) {
    this.msg = message;
    this.msgKind = "ok";
  }

  async login(e) {
    e.preventDefault();
    this.msg = "";
    try {
      const data = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: this.username, password: this.password }),
      });
      localStorage.setItem(TOKEN_KEY, data.access_token);
      this.role = data.user.role;
      this.ready = true;
      location.hash = "";
      this.loadRoute();
    } catch (ex) {
      this.fail(ex.message);
    }
  }

  logout() {
    localStorage.removeItem(TOKEN_KEY);
    this.ready = false;
    this.board = null;
    this.buckets = [];
    this.picked = null;
  }

  async writePh() {
    this.msg = "";
    try {
      this.picked = await api(`/api/pits/${this.picked.id}/samples`, {
        method: "POST",
        body: JSON.stringify({ ph: Number(this.ph) }),
      });
      this.ok("酸碱度已登记，已从本场取样桶扣 0.2 升");
      await this.refreshBoard();
    } catch (ex) {
      this.fail(ex.message);
    }
  }

  async setStatus(status) {
    this.msg = "";
    try {
      this.picked = await api(`/api/pits/${this.picked.id}/status`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      await this.refreshBoard();
    } catch (ex) {
      this.fail(ex.message);
    }
  }

  async refill(bucket) {
    this.msg = "";
    const raw = this.drafts[bucket.id];
    const amount = Number(raw);
    if (!raw || !Number.isFinite(amount) || amount < 0) {
      this.fail("补水量必须是不小于 0 的数");
      return;
    }
    try {
      await api(`/api/buckets/${bucket.id}/refill`, {
        method: "POST",
        body: JSON.stringify({ amount }),
      });
      this.drafts = { ...this.drafts, [bucket.id]: "" };
      this.ok(`已补水 ${amount} 升`);
      await this.loadBuckets();
    } catch (ex) {
      this.fail(ex.message);
    }
  }

  renderTopbar() {
    return html`<nav class="topbar">
      <span class="brand">南冈鞣场</span>
      <a href="#/" class=${this.route === "board" ? "active" : ""}>坑位场地图</a>
      <a href="#/buckets" class=${this.route === "buckets" ? "active" : ""}>取样桶</a>
      <span class="who">${this.role === "admin" ? "管理员" : "操作工"}</span>
      <button @click=${this.logout}>退出</button>
    </nav>`;
  }

  renderLogin() {
    return html`<div class="wrap">
      <h1>南冈鞣场</h1>
      <form @submit=${this.login} autocomplete="off">
        <label>用户名
          <input autocomplete="off" .value=${this.username} @input=${(e) => (this.username = e.target.value)} />
        </label>
        <label>密码
          <input type="password" autocomplete="off" .value=${this.password} @input=${(e) => (this.password = e.target.value)} />
        </label>
        <p class="hint">已预填 admin / 123456，另有 worker / 123456</p>
        <button>登录</button>
      </form>
      ${this.msg ? html`<p class="msg">${this.msg}</p>` : ""}
    </div>`;
  }

  renderBoard() {
    if (!this.board) return html`<div class="wrap">${this.msg || "装载坑位…"}</div>`;
    return html`${this.renderTopbar()}<div class="wrap">
      <p>点坑登记浸液酸碱度（每登记一条扣取样桶 0.2 升）；放液仍只认最近读数 3.5～5.0</p>
      <div class="grid">
        ${this.board.pits.map(
          (p) => html`<button class="pit ${p.status}" @click=${() => (this.picked = p)}>
            <strong>${p.code}</strong><br />${LABELS[p.status]}
          </button>`
        )}
      </div>
      ${this.picked
        ? html`<section>
            <h3>${this.picked.code} · ${LABELS[this.picked.status]}</h3>
            <p>最近酸碱度：${this.picked.latestPh ?? "无"} · ${this.picked.sampleCount} 次</p>
            <input .value=${this.ph} @input=${(e) => (this.ph = e.target.value)} />
            <button @click=${this.writePh}>登记酸碱度</button>
            <div>
              <button @click=${() => this.setStatus("fill")}>注液</button>
              <button @click=${() => this.setStatus("tanning")}>鞣制中</button>
              <button @click=${() => this.setStatus("drained")}>已放液</button>
            </div>
          </section>`
        : ""}
      ${this.msg ? html`<p class="msg ${this.msgKind === "ok" ? "ok" : ""}">${this.msg}</p>` : ""}
    </div>`;
  }

  renderTank(level) {
    const pct = Math.max(0, Math.min(1, level / TANK_FULL_LITERS)) * 100;
    const low = level < 0.2;
    return html`<div class="tank ${low ? "low" : ""}">
      <div class="water" style="height:${pct}%"></div>
      <div class="readout">
        ${low ? html`<span>已见底</span>` : ""}
        <span class="num">${level.toFixed(1)}</span><span>升</span>
      </div>
    </div>`;
  }

  renderBucket(b) {
    const isAdmin = this.role === "admin";
    return html`<div class="bucket-card ${b.isActive ? "" : "retired"}">
      ${this.renderTank(b.level)}
      <div>
        <h3 style="margin:0 0 6px">${b.yardName} 取样桶
          <span class="tag ${b.isActive ? "active" : "retired"}">${b.isActive ? "现行桶" : "已停用"}</span>
        </h3>
        <p class="hint" style="margin:4px 0">现行水位 <strong>${b.level.toFixed(1)} 升</strong>${
          b.level < 0.2 ? " · 不足 0.2 升，无法登记酸碱度" : ""
        }</p>
        ${isAdmin && b.isActive
          ? html`<div>
              <input type="number" min="0" step="0.1" placeholder="补水升数"
                .value=${this.drafts[b.id] ?? ""}
                @input=${(e) => (this.drafts = { ...this.drafts, [b.id]: e.target.value })} />
              <button @click=${() => this.refill(b)}>管理员补水</button>
            </div>`
          : html`<p class="hint">操作工可查看水位，补水请联系管理员</p>`}
      </div>
    </div>`;
  }

  renderBuckets() {
    return html`${this.renderTopbar()}<div class="wrap">
      <h2>取样桶</h2>
      <label>按场筛选
        <select .value=${this.yardFilter} @change=${(e) => { this.yardFilter = e.target.value; this.loadBuckets(); }}>
          <option value="">全部场</option>
          ${this.yards.map((y) => html`<option value=${y.id}>${y.name}</option>`)}
        </select>
      </label>
      ${this.buckets.length === 0
        ? html`<p class="hint">暂无取样桶</p>`
        : this.buckets.map((b) => this.renderBucket(b))}
      ${this.msg ? html`<p class="msg ${this.msgKind === "ok" ? "ok" : ""}">${this.msg}</p>` : ""}
    </div>`;
  }

  render() {
    if (!this.ready) return this.renderLogin();
    return this.route === "buckets" ? this.renderBuckets() : this.renderBoard();
  }
}

customElements.define("tan-yard", TanYard);
