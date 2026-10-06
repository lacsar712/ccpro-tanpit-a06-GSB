import { LitElement, css, html } from "lit";

const TOKEN_KEY = "tanpit_token";
const ROLE_KEY = "tanpit_role";
const LABELS = { fill: "注液", tanning: "鞣制中", drained: "已放液" };
// 桶形水位的满刻度（升）：每 0.2 升一格，超出按满格显示，数字仍为真实水位
const BUCKET_SCALE = 2.0;

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
    board: { type: Object },
    picked: { type: Object },
    ph: { type: String },
    err: { type: String },
    username: { type: String },
    password: { type: String },
    role: { type: String },
    yards: { type: Object },
    buckets: { type: Object },
    yardFilter: { type: String },
    refillAmount: { type: String },
    bucketMsg: { type: String },
    bucketErr: { type: String },
  };

  static styles = css`
    :host { display: block; font-family: "KaiTi", serif; color: #2b2118; }
    .wrap { max-width: 880px; margin: 0 auto; padding: 20px 16px 50px; }
    .topbar { display: flex; align-items: center; justify-content: space-between;
      border-bottom: 2px solid #8a5a2b; padding-bottom: 10px; margin-bottom: 18px; }
    .topbar .brand { font-size: 1.25em; font-weight: bold; }
    .nav button { font: inherit; padding: 6px 16px; margin-left: 8px; cursor: pointer;
      background: #f3ead9; color: #5a3d20; border: 1px solid #8a5a2b; border-radius: 6px; }
    .nav button.active { background: #8a5a2b; color: #fff; }
    .nav button.logout { background: none; border-color: #b0987c; color: #6b5a48; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
    .pit { min-height: 110px; border-radius: 8px; color: #fff; cursor: pointer; border: 0; font: inherit; }
    .fill { background: #6d8f9e; }
    .tanning { background: #8a5a2b; }
    .drained { background: #5f6f4a; }
    .err { color: #9b1c1c; }
    .ok { color: #2f6b3a; }
    .hint { color: #6b5a48; font-size: 0.92em; }
    label { display: block; margin: 8px 0; }
    input, select, button { font: inherit; padding: 8px 10px; margin: 4px 6px 4px 0; }
    .level-line { display: inline-flex; align-items: center; gap: 8px; font-size: 1.05em; }
    .level-pill { padding: 3px 12px; border-radius: 999px; background: #e3eff5; color: #245064; font-weight: bold; }
    .level-pill.low { background: #f7e2e0; color: #9b1c1c; }
    /* 取样桶 */
    .bucket-list { display: flex; flex-wrap: wrap; gap: 22px; margin-top: 14px; }
    .bucket-card { width: 230px; border: 1px solid #d8c7ac; border-radius: 10px; padding: 14px 16px;
      background: #fbf7ee; text-align: center; }
    .bucket-card h3 { margin: 4px 0 2px; }
    .bucket-visual { position: relative; width: 120px; height: 150px; margin: 10px auto 6px;
      border: 3px solid #7a6348; border-top: none; border-radius: 0 0 16px 16px;
      background: repeating-linear-gradient(180deg, #f3ead9 0 14px, #e9dcc2 14px 15px);
      overflow: hidden; }
    .bucket-water { position: absolute; left: 0; right: 0; bottom: 0;
      background: linear-gradient(180deg, #7fb6d4 0%, #3f7fa0 100%);
      transition: height .4s ease; }
    .bucket-water::before { content: ""; position: absolute; top: -7px; left: -12px; right: -12px; height: 14px;
      background: radial-gradient(circle at 6px 7px, transparent 5px, #7fb6d4 6px) repeat-x;
      background-size: 12px 14px; }
    .bucket-number { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      font-size: 1.35em; font-weight: bold; color: #243842; text-shadow: 0 1px 2px rgba(255,255,255,.7); z-index: 2; }
    .bucket-tag { font-size: .9em; color: #6b5a48; }
    .toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  `;

  constructor() {
    super();
    this.ready = Boolean(localStorage.getItem(TOKEN_KEY));
    this.route = (location.hash || "#/board").slice(1);
    this.board = null;
    this.picked = null;
    this.ph = "4.2";
    this.err = "";
    this.username = "admin";
    this.password = "123456";
    this.role = localStorage.getItem(ROLE_KEY) || "worker";
    this.yards = [];
    this.buckets = [];
    this.yardFilter = "";
    this.refillAmount = "0.2";
    this.bucketMsg = "";
    this.bucketErr = "";
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("hashchange", this.onHash);
    if (this.ready) this.loadRoute();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("hashchange", this.onHash);
  }

  onHash = () => {
    this.route = (location.hash || "#/board").slice(1);
    this.err = "";
    this.bucketErr = "";
    this.bucketMsg = "";
    if (this.ready) this.loadRoute();
  };

  goto(route) {
    location.hash = route;
  }

  async loadRoute() {
    if (this.route.startsWith("/buckets")) {
      await this.loadBuckets();
    } else {
      await this.refreshBoard();
    }
  }

  async refreshBoard() {
    try {
      this.board = await api("/api/board");
      if (this.picked) {
        this.picked = this.board.pits.find((p) => p.id === this.picked.id) || this.board.pits[0];
      }
    } catch (e) {
      this.err = e.message;
    }
  }

  async loadBuckets() {
    try {
      if (!this.yards.length) this.yards = await api("/api/yards");
      const qs = this.yardFilter ? `?yard_id=${encodeURIComponent(this.yardFilter)}` : "";
      this.buckets = await api(`/api/buckets${qs}`);
    } catch (e) {
      this.bucketErr = e.message;
    }
  }

  async login(e) {
    e.preventDefault();
    this.err = "";
    try {
      const data = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: this.username, password: this.password }),
      });
      localStorage.setItem(TOKEN_KEY, data.access_token);
      localStorage.setItem(ROLE_KEY, data.user.role);
      this.role = data.user.role;
      this.ready = true;
      await this.loadRoute();
    } catch (ex) {
      this.err = ex.message;
    }
  }

  logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ROLE_KEY);
    this.ready = false;
    this.board = null;
    this.buckets = [];
  }

  async writePh() {
    this.err = "";
    try {
      this.picked = await api(`/api/pits/${this.picked.id}/samples`, {
        method: "POST",
        body: JSON.stringify({ ph: Number(this.ph) }),
      });
      await this.refreshBoard();
    } catch (ex) {
      // 抽屉见底等中文拦截：提示出来，酸碱未入库
      this.err = ex.message;
      await this.refreshBoard();
    }
  }

  async setStatus(status) {
    this.err = "";
    try {
      this.picked = await api(`/api/pits/${this.picked.id}/status`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      await this.refreshBoard();
    } catch (ex) {
      this.err = ex.message;
    }
  }

  async onYardFilter(e) {
    this.yardFilter = e.target.value;
    await this.loadBuckets();
  }

  async refill(bucket) {
    this.bucketErr = "";
    this.bucketMsg = "";
    const amount = Number(this.refillAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      this.bucketErr = "补水量须为不小于 0 的数";
      return;
    }
    try {
      await api(`/api/buckets/${bucket.id}/refill`, {
        method: "POST",
        body: JSON.stringify({ amount }),
      });
      this.bucketMsg = `${bucket.yard.name}取样桶已补水 ${amount.toFixed(1)} 升`;
      await this.loadBuckets();
    } catch (ex) {
      this.bucketErr = ex.message;
    }
  }

  renderLogin() {
    return html`<div class="wrap">
      <h1>南冈鞣场</h1>
      <form @submit=${this.login} autocomplete="off">
        <label>用户名
          <input name="username" autocomplete="off" .value=${this.username} @input=${(e) => (this.username = e.target.value)} />
        </label>
        <label>密码
          <input name="password" type="password" autocomplete="off" .value=${this.password} @input=${(e) => (this.password = e.target.value)} />
        </label>
        <p class="hint">已预填 admin / 123456，另有 worker / 123456</p>
        <button>登录</button>
      </form>
      ${this.err ? html`<p class="err">${this.err}</p>` : ""}
    </div>`;
  }

  renderTopbar() {
    const onBoard = !this.route.startsWith("/buckets");
    return html`<header class="topbar">
      <span class="brand">南冈鞣场 · 作业台</span>
      <nav class="nav">
        <button class=${onBoard ? "active" : ""} @click=${() => this.goto("/board")}>坑位场地图</button>
        <button class=${!onBoard ? "active" : ""} @click=${() => this.goto("/buckets")}>取样桶</button>
        <button class="logout" @click=${this.logout}>退出</button>
      </nav>
    </header>`;
  }

  renderBoard() {
    if (!this.board) return html`${this.err || "装载坑位…"}`;
    const level = this.board.bucketLevel;
    const low = level === null || level < 0.2;
    return html`
      <h1>${this.board.yard}</h1>
      <p>${this.board.village} · 点坑登记浸液酸碱度；放液须最近读数 3.5～5.0</p>
      <p class="level-line">本场现行取样桶水位：
        ${level === null
          ? html`<span class="level-pill low">无桶</span>`
          : html`<span class="level-pill ${low ? "low" : ""}">${level.toFixed(1)} 升</span>`}
        ${low ? html`<span class="hint">（不足 0.2 升，请联系管理员补水）</span>` : ""}
      </p>
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
            <button @click=${this.writePh}>登记酸碱度（扣 0.2 升）</button>
            <div>
              <button @click=${() => this.setStatus("fill")}>注液</button>
              <button @click=${() => this.setStatus("tanning")}>鞣制中</button>
              <button @click=${() => this.setStatus("drained")}>已放液</button>
            </div>
          </section>`
        : ""}
      ${this.err ? html`<p class="err">${this.err}</p>` : ""}
    `;
  }

  renderBucket(bucket) {
    const pct = Math.max(0, Math.min(100, (bucket.level / BUCKET_SCALE) * 100));
    const low = bucket.level < 0.2;
    return html`<div class="bucket-card">
      <h3>${bucket.yard.name}</h3>
      <div class="bucket-tag">${bucket.yard.village || "—"}</div>
      <div class="bucket-visual" role="img" aria-label=${`现行水位 ${bucket.level.toFixed(1)} 升`}>
        <div class="bucket-water" style="height:${pct}%"></div>
        <div class="bucket-number">${bucket.level.toFixed(1)}<small> 升</small></div>
      </div>
      <div class="bucket-tag ${low ? "err" : ""}">${low ? "水位不足，无法登记酸碱度" : "现行水位（每条酸碱扣 0.2 升）"}</div>
      ${this.role === "admin"
        ? html`<div>
            <input style="width:86px" type="number" min="0" step="0.1" .value=${this.refillAmount}
              @input=${(e) => (this.refillAmount = e.target.value)} />
            <button @click=${() => this.refill(bucket)}>补水</button>
          </div>`
        : html`<p class="hint">操作工只读，补水请联系管理员</p>`}
    </div>`;
  }

  renderBuckets() {
    return html`
      <h1>取样桶</h1>
      <p class="hint">整场共用一只桶，同一场现行桶最多一只；登记每条酸碱度扣 0.2 升。</p>
      <div class="toolbar">
        <label style="margin:0">按场筛选：
          <select .value=${this.yardFilter} @change=${this.onYardFilter}>
            <option value="">全部场</option>
            ${this.yards.map((y) => html`<option value=${y.id}>${y.name}</option>`)}
          </select>
        </label>
      </div>
      ${this.bucketErr ? html`<p class="err">${this.bucketErr}</p>` : ""}
      ${this.bucketMsg ? html`<p class="ok">${this.bucketMsg}</p>` : ""}
      <div class="bucket-list">
        ${this.buckets.map((b) => this.renderBucket(b))}
      </div>
      ${!this.bucketErr && this.buckets.length === 0 ? html`<p class="hint">该场暂无取样桶</p>` : ""}
    `;
  }

  render() {
    if (!this.ready) return this.renderLogin();
    return html`<div class="wrap">
      ${this.renderTopbar()}
      ${this.route.startsWith("/buckets") ? this.renderBuckets() : this.renderBoard()}
    </div>`;
  }
}

customElements.define("tan-yard", TanYard);
