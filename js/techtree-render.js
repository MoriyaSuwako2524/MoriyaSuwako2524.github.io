/**
 * 科技树渲染引擎
 * 依赖: D3.js v7+
 */
class TechtreeRenderer {
  constructor(config) {
    this.container = document.querySelector(config.container);
    this.nodes = config.data.nodes || [];
    this.config = config.data.config || {};
    
    this.progressText = config.progressText ? document.querySelector(config.progressText) : null;
    this.progressFill = config.progressFill ? document.querySelector(config.progressFill) : null;
    this.tooltip = config.tooltip ? document.querySelector(config.tooltip) : null;
    this.tooltipElements = config.tooltipElements || {};
    
    // 节点尺寸
    this.nodeWidth = this.config.nodeWidth || 136;
    this.nodeHeight = this.config.nodeHeight || 44;
    this.nodeGap = this.config.nodeGap || 30;
    this.layerPadding = this.config.layerPadding || 34;
    
    // 构建映射表
    this.nodeMap = {};
    this.nodes.forEach(n => this.nodeMap[n.id] = n);
    
    // 计算层级
    this.computeLayers();
    
    // 完成状态
    this.completed = new Set();
    
    // 初始渲染
    this.render();
    
    // 窗口大小变化时重新渲染
    window.addEventListener('resize', () => this.render());
  }
  
  // 计算每个节点的层级（最长路径深度）
  computeLayers() {
    const cache = {};
    const computeLayer = (id) => {
      if (cache[id] !== undefined) return cache[id];
      const node = this.nodeMap[id];
      if (!node.prereqs || node.prereqs.length === 0) return cache[id] = 0;
      return cache[id] = Math.max(...node.prereqs.map(p => computeLayer(p) + 1));
    };
    
    this.nodes.forEach(n => n.layer = computeLayer(n.id));
  }
  
  // 检查节点是否已解锁
  isUnlocked(node) {
    if (!node.prereqs || node.prereqs.length === 0) return true;
    return node.prereqs.every(p => this.completed.has(p));
  }
  
  // 切换节点完成状态
  toggle(node) {
    const isDone = this.completed.has(node.id);
    const isUnlocked = this.isUnlocked(node);
    
    // 未解锁且未完成 → 不允许操作
    if (!isUnlocked && !isDone) return;
    
    if (isDone) {
      // 级联取消：取消节点时，下游已完成的节点也跟着取消
      const cascadeRemove = (id) => {
        this.nodes.forEach(n => {
          if (n.prereqs && n.prereqs.includes(id) && this.completed.has(n.id)) {
            this.completed.delete(n.id);
            cascadeRemove(n.id);
          }
        });
      };
      cascadeRemove(node.id);
      this.completed.delete(node.id);
    } else {
      this.completed.add(node.id);
    }
    
    this.updateProgress();
    this.render();
  }
  
  // 重置所有状态
  reset() {
    this.completed.clear();
    this.updateProgress();
    this.render();
  }
  
  // 更新进度条
  updateProgress() {
    if (!this.progressText || !this.progressFill) return;
    
    const required = this.nodes.filter(n => n.type === 'required');
    const completedRequired = required.filter(n => this.completed.has(n.id)).length;
    
    this.progressText.textContent = `${completedRequired} / ${required.length} 必修`;
    this.progressFill.style.width = (completedRequired / required.length * 100) + '%';
  }
  
  // 渲染科技树
  render() {
    const W = this.container.clientWidth;
    const H = this.container.clientHeight;
    
    // 清空容器
    this.container.innerHTML = '';
    
    // 创建 SVG
    const svg = d3.select(this.container)
      .append('svg')
      .attr('width', W)
      .attr('height', H)
      .attr('viewBox', `0 0 ${W} ${H}`);
    
    const g = svg.append('g');
    
    // 按层分组并排序
    const layers = {};
    this.nodes.forEach(n => (layers[n.layer] = layers[n.layer] || []).push(n));
    const maxLayer = Math.max(...Object.keys(layers).map(Number));
    
    // 计算每个节点的位置
    for (let L = 0; L <= maxLayer; L++) {
      const group = layers[L] || [];
      
      // 按父节点平均 X 坐标排序（减少连线交叉）
      if (L > 0) {
        group.sort((a, b) => {
          const ax = a.prereqs.reduce((s, p) => s + (this.nodeMap[p].x || 0), 0) / (a.prereqs.length || 1);
          const bx = b.prereqs.reduce((s, p) => s + (this.nodeMap[p].x || 0), 0) / (b.prereqs.length || 1);
          return ax - bx;
        });
      }
      
      const count = group.length;
      const totalWidth = count * this.nodeWidth + (count - 1) * this.nodeGap;
      const startX = (W - totalWidth) / 2 + this.nodeWidth / 2;
      
      group.forEach((n, i) => {
        n.x = startX + i * (this.nodeWidth + this.nodeGap);
        n.y = this.layerPadding + (L / maxLayer) * (H - this.layerPadding * 2);
      });
    }
    
    // 定义 SVG 元素（箭头、滤镜）
    this.defineSVGElements(g);
    
    // 渲染连线
    this.renderEdges(g);
    
    // 渲染节点
    this.renderNodes(g);
  }
  
  // 定义 SVG 元素（箭头标记、发光滤镜）
  defineSVGElements(g) {
    const defs = g.append('defs');
    
    // 箭头标记 - 浅色主题配色
    const arrowColors = {
      req: '#4a90e2',
      opt: '#9b59b6',
      done: '#27ae60',
      dim: '#d0d4d8'
    };
    
    Object.entries(arrowColors).forEach(([key, color]) => {
      defs.append('marker')
        .attr('id', `arrow-${key}`)
        .attr('viewBox', '0 0 8 8')
        .attr('refX', 7)
        .attr('refY', 4)
        .attr('markerWidth', 5)
        .attr('markerHeight', 5)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,.5 L0,7.5 L7,4Z')
        .attr('fill', color);
    });
    
    // 发光滤镜
    const glow = defs.append('filter')
      .attr('id', 'glow')
      .attr('x', '-40%')
      .attr('y', '-40%')
      .attr('width', '180%')
      .attr('height', '180%');
    
    glow.append('feGaussianBlur')
      .attr('in', 'SourceGraphic')
      .attr('stdDeviation', '5')
      .attr('result', 'blur');
    
    const merge = glow.append('feMerge');
    merge.append('feMergeNode').attr('in', 'blur');
    merge.append('feMergeNode').attr('in', 'SourceGraphic');
  }
  
  // 渲染连线
  renderEdges(g) {
    this.nodes.forEach(node => {
      if (!node.prereqs) return;
      
      node.prereqs.forEach(pid => {
        const from = this.nodeMap[pid];
        const to = node;
        
        const bothDone = this.completed.has(from.id) && this.completed.has(to.id);
        const isLocked = (!this.completed.has(from.id) && !this.isUnlocked(from)) || 
                         (!this.completed.has(to.id) && !this.isUnlocked(to));
        
        let color, marker, dash, opacity, strokeWidth;
        
        if (bothDone) {
          color = '#27ae60';
          marker = 'arrow-done';
          dash = null;
          opacity = 0.7;
          strokeWidth = 2.2;
        } else if (isLocked) {
          color = '#d0d4d8';
          marker = 'arrow-dim';
          dash = null;
          opacity = 0.3;
          strokeWidth = 1.3;
        } else if (to.type === 'optional') {
          color = '#9b59b6';
          marker = 'arrow-opt';
          dash = '5,3';
          opacity = 0.5;
          strokeWidth = 1.5;
        } else {
          color = '#4a90e2';
          marker = 'arrow-req';
          dash = null;
          opacity = 0.5;
          strokeWidth = 1.5;
        }
        
        // 贝塞尔曲线：从上层底部到下层顶部
        const x1 = from.x, y1 = from.y + this.nodeHeight;
        const x2 = to.x, y2 = to.y;
        const midY = (y1 + y2) / 2;
        
        const path = g.append('path')
          .attr('d', `M${x1},${y1} C${x1},${midY} ${x2},${midY} ${x2},${y2}`)
          .attr('fill', 'none')
          .attr('stroke', color)
          .attr('stroke-width', strokeWidth)
          .attr('stroke-opacity', opacity)
          .attr('marker-end', `url(#${marker})`);
        
        if (dash) path.attr('stroke-dasharray', dash);
      });
    });
  }
  
  // 渲染节点
  renderNodes(g) {
    this.nodes.forEach(node => {
      const isDone = this.completed.has(node.id);
      const isUnlocked = this.isUnlocked(node);
      const isLocked = !isDone && !isUnlocked;
      
      const ng = g.append('g')
        .attr('transform', `translate(${node.x - this.nodeWidth / 2},${node.y})`)
        .style('cursor', isLocked ? 'not-allowed' : 'pointer');
      
      // 节点样式 - 浅色主题配色
      let bg, border, borderWidth, borderDash, textColor;
      
      if (isDone) {
        bg = '#e8f8f0';
        border = '#27ae60';
        borderWidth = 2.5;
        borderDash = null;
        textColor = '#1e8449';
      } else if (isLocked) {
        bg = '#f5f6f7';
        border = '#d0d4d8';
        borderWidth = 1.5;
        borderDash = null;
        textColor = '#95999e';
      } else if (node.type === 'goal') {
        bg = '#fff8e6';
        border = '#f39c12';
        borderWidth = 2.5;
        borderDash = null;
        textColor = '#d68910';
      } else if (node.type === 'optional') {
        bg = '#f3e8ff';
        border = '#9b59b6';
        borderWidth = 2;
        borderDash = '5,2.5';
        textColor = '#7d3c98';
      } else {
        bg = '#e8f4fd';
        border = '#4a90e2';
        borderWidth = 2;
        borderDash = null;
        textColor = '#3a7bc8';
      }
      
      // 目标节点发光效果
      if (node.type === 'goal' && isUnlocked && !isDone) {
        ng.append('rect')
          .attr('width', this.nodeWidth)
          .attr('height', this.nodeHeight)
          .attr('rx', 7)
          .attr('fill', '#f39c12')
          .attr('opacity', 0.08)
          .attr('filter', 'url(#glow)');
      }
      
      // 主矩形
      const rect = ng.append('rect')
        .attr('width', this.nodeWidth)
        .attr('height', this.nodeHeight)
        .attr('rx', 7)
        .attr('fill', bg)
        .attr('stroke', border)
        .attr('stroke-width', borderWidth);
      
      if (borderDash) rect.attr('stroke-dasharray', borderDash);
      
      // 文本标签
      ng.append('text')
        .attr('x', this.nodeWidth / 2)
        .attr('y', this.nodeHeight / 2)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('fill', textColor)
        .attr('font-size', '12.5px')
        .attr('font-weight', '600')
        .text(node.label);
      
      // 支线角标
      if (node.type === 'optional' && !isDone && !isLocked) {
        ng.append('rect')
          .attr('x', 3).attr('y', 2)
          .attr('width', 17).attr('height', 9)
          .attr('rx', 3)
          .attr('fill', 'rgba(155, 89, 182, 0.15)');
        ng.append('text')
          .attr('x', 11.5).attr('y', 6.5)
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle')
          .attr('fill', '#9b59b6')
          .attr('font-size', '7px')
          .attr('font-weight', '600')
          .text('支线');
      }
      
      // 状态图标
      if (isDone) {
        ng.append('text')
          .attr('x', this.nodeWidth - 11)
          .attr('y', this.nodeHeight / 2)
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle')
          .attr('fill', '#27ae60')
          .attr('font-size', '15px')
          .text('✓');
      } else if (isLocked) {
        ng.append('text')
          .attr('x', this.nodeWidth - 12)
          .attr('y', this.nodeHeight / 2 + 1)
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle')
          .attr('font-size', '11px')
          .text('🔒');
      }
      
      // 绑定事件
      this.bindNodeEvents(ng, node, isDone, isLocked);
    });
  }
  
  // 绑定节点交互事件
  bindNodeEvents(ng, node, isDone, isLocked) {
    const typeLabels = {
      required: 'Main Quest',
      optional: 'Side Quest',
      goal: 'Goal of Chapter'
    };
    
    ng.on('mouseenter', (event) => {
      d3.select(ng.node()).style('filter', 'brightness(1.12)');
      
      if (!this.tooltip) return;
      
      // 更新提示框内容
      const els = this.tooltipElements;
      if (els.title) document.querySelector(els.title).textContent = node.label;
      if (els.badge) {
        const badge = document.querySelector(els.badge);
        badge.className = `tooltip-badge ${node.type}`;
        badge.textContent = typeLabels[node.type];
      }
      if (els.desc) document.querySelector(els.desc).textContent = node.desc || '';
      
      if (els.prereq) {
        const prereqs = (node.prereqs || []).map(p => this.nodeMap[p].label);
        document.querySelector(els.prereq).innerHTML = prereqs.length
          ? `Requirements：${prereqs.map(n => `<em>${n}</em>`).join(' + ')}`
          : 'No Requirements！';
      }
      
      if (els.hint) {
        document.querySelector(els.hint).textContent = isLocked
          ? '🔒 Please complete all requirements'
          : isDone ? 'Click to complete' : '👆 Click to complete';
      }
      
      this.tooltip.style.opacity = '1';
    })
    .on('mousemove', (event) => {
      if (!this.tooltip) return;
      
      let left = event.clientX + 14;
      let top = event.clientY - 20;
      
      if (left + 210 > window.innerWidth) left = event.clientX - 215;
      if (top + 160 > window.innerHeight) top = event.clientY - 170;
      if (top < 0) top = 5;
      
      this.tooltip.style.left = left + 'px';
      this.tooltip.style.top = top + 'px';
    })
    .on('mouseleave', () => {
      d3.select(ng.node()).style('filter', null);
      if (this.tooltip) this.tooltip.style.opacity = '0';
    })
    .on('click', () => {
      this.toggle(node);
    });
  }
}

// 导出到全局
if (typeof window !== 'undefined') {
  window.TechtreeRenderer = TechtreeRenderer;
}
