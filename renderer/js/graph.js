'use strict';

const Graph = {
  canvas: null, ctx: null, nodes: [], edges: [], raf: null,
  drag: null, hover: null, panX: 0, panY: 0, zoom: 1,

  show(centerId) {
    const data = KB.graphData(centerId);
    this.canvas = document.getElementById('graphCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.resize();

    const cx = this.canvas.width / 2, cy = this.canvas.height / 2;
    const n = data.nodes.length || 1;
    this.nodes = data.nodes.map((nd, i) => {
      const angle = (2 * Math.PI * i) / n;
      const r = 140 + (n > 12 ? 120 : 60) * Math.random();
      return {
        ...nd,
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r,
        vx: 0, vy: 0,
        fixed: nd.id === centerId
      };
    });
    this.edges = data.edges.map(e => ({
      ...e,
      a: this.nodes.find(x => x.id === e.a),
      b: this.nodes.find(x => x.id === e.b)
    })).filter(e => e.a && e.b);

    if (this.raf) cancelAnimationFrame(this.raf);
    this.tick();
  },

  resize() {
    const wrap = this.canvas.parentElement;
    this.canvas.width = wrap.clientWidth;
    this.canvas.height = wrap.clientHeight;
  },

  tick() {
    const nodes = this.nodes, edges = this.edges;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        if (dist < 220) {
          const f = (220 - dist) / dist * 0.02;
          a.vx -= dx * f; a.vy -= dy * f;
          b.vx += dx * f; b.vy += dy * f;
        }
      }
    }
    edges.forEach(e => {
      const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const f = (dist - 200) / dist * 0.005;
      e.a.vx += dx * f; e.a.vy += dy * f;
      e.b.vx -= dx * f; e.b.vy -= dy * f;
    });
    const cx = this.canvas.width / 2, cy = this.canvas.height / 2;
    nodes.forEach(nd => {
      if (nd.fixed) { nd.x = cx; nd.y = cy; nd.vx = nd.vy = 0; return; }
      nd.vx += (cx - nd.x) * 0.0008;
      nd.vy += (cy - nd.y) * 0.0008;
      nd.x += nd.vx; nd.y += nd.vy;
      nd.vx *= 0.85; nd.vy *= 0.85;
    });
    this.draw();
    this.raf = requestAnimationFrame(() => this.tick());
  },

  draw() {
    const ctx = this.ctx;
    const isDark = document.body.classList.contains('theme-dark');
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const palette = {
      law: '#e8b64c', regulation: '#5fb4d9', decision: '#c792ea',
      agreement: '#7ec98f', ruling: '#ef7d7d', principle: '#f0a35e', circular: '#9aa5b5'
    };

    ctx.strokeStyle = isDark ? 'rgba(140,160,190,.35)' : 'rgba(80,100,130,.35)';
    ctx.lineWidth = 1.4;
    this.edges.forEach(e => {
      ctx.beginPath();
      ctx.moveTo(e.a.x, e.a.y);
      ctx.lineTo(e.b.x, e.b.y);
      ctx.stroke();
    });

    this.nodes.forEach(nd => {
      const r = nd.fixed ? 26 : 16;
      ctx.beginPath();
      ctx.arc(nd.x, nd.y, r, 0, Math.PI * 2);
      ctx.fillStyle = palette[nd.type] || '#9aa5b5';
      ctx.fill();
      if (nd.fixed) { ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke(); }
      ctx.fillStyle = isDark ? '#e6edf7' : '#1a2230';
      ctx.font = '13px system-ui, "Segoe UI", Tahoma, sans-serif';
      ctx.textAlign = 'center';
      const label = nd.label.length > 34 ? nd.label.slice(0, 33) + '…' : nd.label;
      ctx.fillText(label, nd.x, nd.y + r + 16);
    });
  },

  nodeAt(x, y) {
    return this.nodes.find(nd => {
      const dx = x - nd.x, dy = y - nd.y;
      return dx * dx + dy * dy <= 20 * 20;
    });
  },

  stop() { if (this.raf) cancelAnimationFrame(this.raf); this.raf = null; }
};
