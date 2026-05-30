// ==UserScript==
// @name         IP纯净度实时监测
// @name:zh-CN   IP纯净度实时监测
// @name:en      IP Pure Monitor
// @namespace    http://tampermonkey.net/
// @version      1.6.0
// @description  IP纯净度实时监测：紧凑圆点常驻显示地区，双击展开详情、按住即可拖动，毛玻璃自适应主题、可调透明度（可至全透明仅留边框）与整体缩放，支持黑/白名单与关闭，页面内 GUI 设置。
// @description:zh-CN IP纯净度实时监测：紧凑圆点常驻显示地区，双击展开详情、按住即可拖动，毛玻璃自适应主题、可调透明度（可至全透明仅留边框）与整体缩放，支持黑/白名单与关闭，页面内 GUI 设置。
// @description:en Real-time IP purity and fraud-score monitor with a compact pill, double-click to expand, press-and-drag to move, adaptive frosted theme, adjustable opacity down to fully transparent, scale control, and an in-page settings panel.
// @author       lwow
// @license      MIT
// @match        *://*/*
// @noframes
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      my.ippure.com
// @downloadURL https://update.greasyfork.org/scripts/574961/IP%E7%BA%AF%E5%87%80%E5%BA%A6%E5%AE%9E%E6%97%B6%E7%9B%91%E6%B5%8B.user.js
// @updateURL https://update.greasyfork.org/scripts/574961/IP%E7%BA%AF%E5%87%80%E5%BA%A6%E5%AE%9E%E6%97%B6%E7%9B%91%E6%B5%8B.meta.js
// ==/UserScript==

(function () {
    'use strict';

    const CACHE_MINUTES = 5;
    const API_URL = 'https://my.ippure.com/v1/info';
    const MOVE_TOL = 6;
    const DBL_TAP = 300;

    function gv(key, def) { const v = GM_getValue(key, def); return v === undefined || v === null ? def : v; }
    function getList(key) { try { const a = JSON.parse(gv(key, '[]')); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
    function setList(key, arr) { GM_setValue(key, JSON.stringify(arr)); }

    function getMode() { return gv('ip_monitor_mode', 'blacklist'); }
    function getOpacity() { return parseFloat(gv('ip_monitor_opacity', '0.85')); }
    function getScale() { return parseFloat(gv('ip_monitor_scale', '1')); }
    function getTheme() { return gv('ip_monitor_theme', 'auto'); }

    function isVisibleHere() {
        const mode = getMode();
        if (mode === 'off') return false;
        const host = location.hostname;
        if (mode === 'blacklist') return !getList('ip_monitor_disabled').includes(host);
        if (mode === 'whitelist') return getList('ip_monitor_enabled').includes(host);
        return true;
    }

    function setMode(m) { GM_setValue('ip_monitor_mode', m); location.reload(); }

    function toggleThisSite() {
        const mode = getMode();
        const host = location.hostname;
        if (mode === 'blacklist') {
            const s = new Set(getList('ip_monitor_disabled'));
            s.has(host) ? s.delete(host) : s.add(host);
            setList('ip_monitor_disabled', [...s]);
        } else if (mode === 'whitelist') {
            const s = new Set(getList('ip_monitor_enabled'));
            s.has(host) ? s.delete(host) : s.add(host);
            setList('ip_monitor_enabled', [...s]);
        }
        location.reload();
    }

    function status(score) {
        if (score >= 75) return { color: '#ff4444', label: '高危' };
        if (score >= 40) return { color: '#ffbb33', label: '中等' };
        return { color: '#00C851', label: '极佳' };
    }

    function el(tag, props) {
        const n = document.createElement(tag);
        if (props) {
            for (const k in props) {
                if (k === 'class') n.className = props[k];
                else if (k === 'text') n.textContent = props[k];
                else if (k === 'style') n.style.cssText = props[k];
                else if (k.length > 2 && k.slice(0, 2) === 'on') n.addEventListener(k.slice(2).toLowerCase(), props[k]);
                else n.setAttribute(k, props[k]);
            }
        }
        for (let i = 2; i < arguments.length; i++) {
            const c = arguments[i];
            if (c == null) continue;
            n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
        }
        return n;
    }

    const host = document.createElement('div');
    host.id = 'ip-pure-monitor-host';
    host.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;pointer-events:none;';
    document.documentElement.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
        .monitor {
            all: initial;
            position: fixed;
            z-index: 2147483647;
            --ui-scale: 1;
            --bg-rgb: 18,18,20;
            --bg-alpha: 0.85;
            --fg: #f2f2f2;
            --dim: #c2c2c2;
            --aux: #8c8c8c;
            --border: rgba(255,255,255,0.12);
            --halo: rgba(0,0,0,0.85);
            box-sizing: border-box;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
            font-size: calc(13px * var(--ui-scale));
            line-height: 1.5;
            color: var(--fg);
            background: rgba(var(--bg-rgb), var(--bg-alpha));
            -webkit-backdrop-filter: blur(calc(12px * var(--bg-alpha))) saturate(calc(1 + 0.25 * var(--bg-alpha)));
            backdrop-filter: blur(calc(12px * var(--bg-alpha))) saturate(calc(1 + 0.25 * var(--bg-alpha)));
            border: 1px solid rgba(128,128,128,0.5);
            border-radius: 0.65em;
            box-shadow: 0 1px 4px rgba(0,0,0,0.18);
            text-shadow: 0 0 2px var(--halo), 0 0 3px var(--halo);
            overflow: hidden;
            display: flex;
            flex-direction: column;
            pointer-events: auto;
            -webkit-touch-callout: none;
            user-select: none;
            transition: background-color 0.2s ease, box-shadow 0.2s ease;
        }
        .monitor:not(.adjusting):hover { --bg-alpha: 1 !important; }
        .monitor.adjusting { transition: none; }
        .monitor.open { box-shadow: 0 4px 14px rgba(0,0,0,0.28); }
        .monitor.dragging { box-shadow: 0 6px 18px rgba(0,0,0,0.40); }
        .summary {
            display: flex;
            align-items: center;
            gap: 0.5em;
            padding: 0.45em 0.7em;
            white-space: nowrap;
            cursor: grab;
            touch-action: none;
        }
        .monitor.dragging .summary { cursor: grabbing; }
        .dot { width: 0.7em; height: 0.7em; border-radius: 50%; flex: 0 0 auto; box-shadow: 0 0 0.25em currentColor; }
        .score { font-weight: 700; }
        .country { color: var(--dim); }
        .panel { display: none; border-top: 1px solid var(--border); padding: 0.6em 0.75em; min-width: 13em; }
        .detailView, .settingsView { display: none; }
        .d-row { display: flex; align-items: center; gap: 0.4em; margin: 0.15em 0; }
        .d-dim { color: var(--dim); font-size: 0.92em; }
        .d-title { font-weight: 700; }
        .d-sub { color: var(--dim); font-size: 0.88em; margin-top: 0.2em; }
        .actions { display: flex; gap: 0.4em; margin-top: 0.6em; }
        .btn {
            font: inherit;
            text-shadow: none;
            color: var(--fg);
            background: rgba(127,127,127,0.18);
            border: 1px solid var(--border);
            border-radius: 0.4em;
            padding: 0.3em 0.6em;
            cursor: pointer;
        }
        .s-head {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin: -0.6em -0.75em 0.5em;
            padding: 0.45em 0.75em;
            background: rgba(127,127,127,0.15);
            cursor: grab;
            touch-action: none;
        }
        .monitor.dragging .s-head { cursor: grabbing; }
        .s-title { font-weight: 700; }
        .s-close { cursor: pointer; padding: 0 0.3em; }
        .s-label { font-size: 0.85em; color: var(--dim); margin: 0.6em 0 0.25em; }
        .s-val { color: var(--aux); }
        .s-modes { display: flex; gap: 0.3em; }
        .s-mode {
            flex: 1;
            font: inherit;
            text-shadow: none;
            color: var(--fg);
            background: rgba(127,127,127,0.18);
            border: 1px solid var(--border);
            border-radius: 0.4em;
            padding: 0.3em 0;
            cursor: pointer;
        }
        .s-mode.active { background: #2d7ff9; border-color: #2d7ff9; color: #fff; }
        .s-site { display: flex; align-items: center; gap: 0.35em; font-size: 0.9em; margin-top: 0.45em; cursor: pointer; }
        input[type=range] { width: 100%; margin: 0.2em 0; }
    `;
    shadow.appendChild(style);

    const preventDarkReader = new MutationObserver((mutations) => {
        for (const m of mutations) {
            for (const node of m.addedNodes) {
                if (node.tagName === 'STYLE' && node !== style) node.remove();
            }
        }
    });
    preventDarkReader.observe(shadow, { childList: true });

    const monitorEl = el('div', { class: 'monitor' });
    const summaryEl = el('div', { class: 'summary' });
    const dotEl = el('span', { class: 'dot' });
    const scoreEl = el('span', { class: 'score' });
    const countryEl = el('span', { class: 'country' });
    summaryEl.append(dotEl, scoreEl, countryEl);
    const panelEl = el('div', { class: 'panel' });
    const detailEl = el('div', { class: 'detailView' });
    const settingsEl = el('div', { class: 'settingsView' });
    panelEl.append(detailEl, settingsEl);
    monitorEl.append(summaryEl, panelEl);
    shadow.appendChild(monitorEl);

    const shouldShow = isVisibleHere();
    let expanded = false;
    let settingsOpen = false;

    const darkMq = window.matchMedia('(prefers-color-scheme: dark)');

    function resolveTheme() {
        const t = getTheme();
        if (t === 'dark' || t === 'light') return t;
        return darkMq.matches ? 'dark' : 'light';
    }

    function applyAppearance() {
        const theme = resolveTheme();
        const c = theme === 'dark'
            ? { rgb: '18,18,20', fg: '#f2f2f2', dim: '#c2c2c2', aux: '#8c8c8c', border: 'rgba(255,255,255,0.14)', halo: 'rgba(0,0,0,0.85)' }
            : { rgb: '248,249,251', fg: '#1b1b1d', dim: '#3c3c3c', aux: '#6c6c6c', border: 'rgba(0,0,0,0.14)', halo: 'rgba(255,255,255,0.92)' };
        const s = monitorEl.style;
        s.setProperty('--bg-rgb', c.rgb);
        s.setProperty('--bg-alpha', String(getOpacity()));
        s.setProperty('--fg', c.fg);
        s.setProperty('--dim', c.dim);
        s.setProperty('--aux', c.aux);
        s.setProperty('--border', c.border);
        s.setProperty('--halo', c.halo);
    }

    function applyScale() {
        monitorEl.style.setProperty('--ui-scale', String(getScale()));
        requestAnimationFrame(clampIntoView);
    }

    function applyPosition() {
        const l = gv('ip_monitor_left', '');
        const t = gv('ip_monitor_top', '');
        if (l && t) {
            monitorEl.style.left = l;
            monitorEl.style.top = t;
            monitorEl.style.right = 'auto';
            monitorEl.style.bottom = 'auto';
        } else {
            monitorEl.style.right = '16px';
            monitorEl.style.bottom = '16px';
        }
    }

    function clampIntoView() {
        const r = monitorEl.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        const x = Math.max(0, Math.min(r.left, window.innerWidth - r.width));
        const y = Math.max(0, Math.min(r.top, window.innerHeight - r.height));
        monitorEl.style.left = x + 'px';
        monitorEl.style.top = y + 'px';
        monitorEl.style.right = 'auto';
        monitorEl.style.bottom = 'auto';
    }

    function render() {
        summaryEl.style.display = shouldShow ? 'flex' : 'none';
        const showDetail = shouldShow && expanded && !settingsOpen;
        const showSettings = settingsOpen;
        panelEl.style.display = (showDetail || showSettings) ? 'block' : 'none';
        detailEl.style.display = showDetail ? 'block' : 'none';
        settingsEl.style.display = showSettings ? 'block' : 'none';
        monitorEl.classList.toggle('open', showDetail || showSettings);
        requestAnimationFrame(clampIntoView);
    }

    function toggleExpand() {
        if (!shouldShow) return;
        if (settingsOpen) { settingsOpen = false; render(); return; }
        expanded = !expanded;
        render();
    }

    function openSettings() {
        buildSettings();
        settingsOpen = true;
        expanded = true;
        render();
    }

    function closeSettings() {
        settingsOpen = false;
        render();
    }

    function bindGestures(target, onDoubleTap) {
        let sx = 0, sy = 0, ox = 0, oy = 0;
        let dragging = false, moved = false, pid = null, lastTap = 0;

        target.addEventListener('pointerdown', (e) => {
            if (e.target.closest && e.target.closest('button,input,select,a,label,.s-close')) return;
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            pid = e.pointerId;
            sx = e.clientX; sy = e.clientY; moved = false; dragging = false;
            const r = monitorEl.getBoundingClientRect();
            ox = e.clientX - r.left; oy = e.clientY - r.top;
            try { target.setPointerCapture(pid); } catch (_) {}
        });

        target.addEventListener('pointermove', (e) => {
            if (pid === null || e.pointerId !== pid) return;
            if (!dragging) {
                if (Math.hypot(e.clientX - sx, e.clientY - sy) > MOVE_TOL) {
                    dragging = true; moved = true;
                    monitorEl.classList.add('dragging');
                } else { return; }
            }
            e.preventDefault();
            const r = monitorEl.getBoundingClientRect();
            let nx = e.clientX - ox;
            let ny = e.clientY - oy;
            nx = Math.max(0, Math.min(nx, window.innerWidth - r.width));
            ny = Math.max(0, Math.min(ny, window.innerHeight - r.height));
            monitorEl.style.left = nx + 'px';
            monitorEl.style.top = ny + 'px';
            monitorEl.style.right = 'auto';
            monitorEl.style.bottom = 'auto';
        });

        const end = (e) => {
            if (pid === null || e.pointerId !== pid) return;
            try { target.releasePointerCapture(pid); } catch (_) {}
            if (dragging) {
                dragging = false;
                monitorEl.classList.remove('dragging');
                GM_setValue('ip_monitor_left', monitorEl.style.left);
                GM_setValue('ip_monitor_top', monitorEl.style.top);
            } else if (!moved) {
                const now = Date.now();
                if (now - lastTap < DBL_TAP) { lastTap = 0; if (onDoubleTap) onDoubleTap(); }
                else lastTap = now;
            }
            pid = null;
        };
        target.addEventListener('pointerup', end);
        target.addEventListener('pointercancel', end);
        target.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    bindGestures(summaryEl, toggleExpand);

    function setLoading() {
        dotEl.style.background = '#999';
        dotEl.style.color = '#999';
        scoreEl.textContent = '…';
        countryEl.textContent = '检测中';
    }

    function updateSummary(data, isError) {
        if (isError) {
            dotEl.style.background = '#ff4444';
            dotEl.style.color = '#ff4444';
            scoreEl.textContent = '!';
            countryEl.textContent = 'ERR';
            return;
        }
        const st = status(data.fraudScore);
        dotEl.style.background = st.color;
        dotEl.style.color = st.color;
        scoreEl.textContent = data.fraudScore;
        countryEl.textContent = data.countryCode || '--';
    }

    function renderDetail(data, isError) {
        detailEl.replaceChildren();
        if (isError) {
            detailEl.appendChild(el('div', { class: 'd-title', text: '❌ 检测失败' }));
            detailEl.appendChild(el('div', { class: 'd-sub', text: '点击下方刷新重试' }));
        } else if (data) {
            const st = status(data.fraudScore);
            detailEl.appendChild(el('div', { class: 'd-row' },
                el('span', { class: 'dot', style: `background:${st.color};color:${st.color};` }),
                el('span', { text: `IP ${data.ip}` })));
            detailEl.appendChild(el('div', { class: 'd-row d-dim', text: `${data.countryCode || '--'} · ${data.city || '-'}` }));
            detailEl.appendChild(el('div', { class: 'd-row' }, '分数 ',
                el('b', { style: `color:${st.color};`, text: `${data.fraudScore} (${st.label})` })));
            detailEl.appendChild(el('div', { class: 'd-row d-dim', text: `${data.isResidential ? '🏠 住宅' : '🏢 机房'} · ${data.asOrganization || '未知 ISP'}` }));
        }
        detailEl.appendChild(el('div', { class: 'actions' },
            el('button', { class: 'btn', text: '🔄 刷新', onClick: (e) => { e.stopPropagation(); fetchIPInfo(); } }),
            el('button', { class: 'btn', text: '⚙️ 设置', onClick: (e) => { e.stopPropagation(); openSettings(); } })));
    }

    function updateUI(data) { updateSummary(data, false); renderDetail(data, false); }
    function updateError() { updateSummary(null, true); renderDetail(null, true); }

    function fetchIPInfo() {
        setLoading();
        GM_xmlhttpRequest({
            method: 'GET',
            url: API_URL,
            timeout: 10000,
            headers: { 'Accept': 'application/json', 'Cache-Control': 'no-cache' },
            onload: (resp) => {
                if (resp.status === 200) {
                    try {
                        const data = JSON.parse(resp.responseText);
                        GM_setValue('ip_cache_data', resp.responseText);
                        GM_setValue('ip_cache_time', Date.now());
                        updateUI(data);
                    } catch (e) { updateError(); }
                } else { updateError(); }
            },
            onerror: () => updateError(),
            ontimeout: () => updateError()
        });
    }

    function buildSettings() {
        settingsEl.replaceChildren();
        const mode = getMode();
        const theme = getTheme();
        const opacity = getOpacity();
        const scale = getScale();

        const header = el('div', { class: 's-head' },
            el('span', { class: 's-title', text: '设置' }),
            el('span', { class: 's-close', text: '✕', onClick: (e) => { e.stopPropagation(); closeSettings(); } }));
        bindGestures(header, null);
        settingsEl.appendChild(header);

        settingsEl.appendChild(el('div', { class: 's-label', text: '显示模式' }));
        const modeRow = el('div', { class: 's-modes' });
        [['off', '关闭'], ['blacklist', '黑名单'], ['whitelist', '白名单']].forEach(([v, t]) => {
            modeRow.appendChild(el('button', { class: 's-mode' + (mode === v ? ' active' : ''), text: t, onClick: (e) => { e.stopPropagation(); setMode(v); } }));
        });
        settingsEl.appendChild(modeRow);

        if (mode !== 'off') {
            const cb = el('input', { type: 'checkbox' });
            cb.checked = isVisibleHere();
            cb.addEventListener('change', (e) => { e.stopPropagation(); toggleThisSite(); });
            settingsEl.appendChild(el('label', { class: 's-site' }, cb, el('span', { text: `在 ${location.hostname} 显示` })));
        }

        const opVal = el('span', { class: 's-val', text: Math.round(opacity * 100) + '%' });
        settingsEl.appendChild(el('div', { class: 's-label' }, '透明度 ', opVal));
        const opIn = el('input', { type: 'range', min: '0', max: '1', step: '0.05' });
        opIn.value = opacity;
        const startAdjust = () => monitorEl.classList.add('adjusting');
        const endAdjust = () => monitorEl.classList.remove('adjusting');
        opIn.addEventListener('pointerdown', startAdjust);
        opIn.addEventListener('pointerup', endAdjust);
        opIn.addEventListener('pointercancel', endAdjust);
        opIn.addEventListener('change', endAdjust);
        opIn.addEventListener('input', (e) => {
            e.stopPropagation();
            const v = parseFloat(opIn.value);
            GM_setValue('ip_monitor_opacity', String(v));
            applyAppearance();
            opVal.textContent = Math.round(v * 100) + '%';
        });
        settingsEl.appendChild(opIn);

        const scVal = el('span', { class: 's-val', text: Math.round(scale * 100) + '%' });
        settingsEl.appendChild(el('div', { class: 's-label' }, '缩放 ', scVal));
        const scIn = el('input', { type: 'range', min: '0.7', max: '1.8', step: '0.05' });
        scIn.value = scale;
        scIn.addEventListener('input', (e) => {
            e.stopPropagation();
            const v = parseFloat(scIn.value);
            GM_setValue('ip_monitor_scale', String(v));
            applyScale();
            scVal.textContent = Math.round(v * 100) + '%';
        });
        settingsEl.appendChild(scIn);

        settingsEl.appendChild(el('div', { class: 's-label', text: '主题' }));
        const themeRow = el('div', { class: 's-modes' });
        [['auto', '跟随系统'], ['dark', '深色'], ['light', '浅色']].forEach(([v, t]) => {
            themeRow.appendChild(el('button', { class: 's-mode' + (theme === v ? ' active' : ''), text: t, onClick: (e) => { e.stopPropagation(); GM_setValue('ip_monitor_theme', v); buildSettings(); applyAppearance(); } }));
        });
        settingsEl.appendChild(themeRow);
    }

    applyAppearance();
    applyScale();
    applyPosition();
    render();

    darkMq.addEventListener('change', () => { if (getTheme() === 'auto') applyAppearance(); });
    window.addEventListener('resize', clampIntoView);

    GM_registerMenuCommand('⚙️ 打开设置 / Settings', () => openSettings());
    if (getMode() !== 'off') {
        GM_registerMenuCommand(isVisibleHere() ? '🚫 在本站隐藏' : '✅ 在本站显示', () => toggleThisSite());
    }

    if (shouldShow) {
        renderDetail(null, false);
        const cd = gv('ip_cache_data', '');
        const ct = gv('ip_cache_time', 0);
        if (cd && ct && (Date.now() - ct < CACHE_MINUTES * 60 * 1000)) {
            try { updateUI(JSON.parse(cd)); } catch (e) { fetchIPInfo(); }
        } else {
            fetchIPInfo();
        }
    }
})();
