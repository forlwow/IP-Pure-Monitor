// ==UserScript==
// @name         IP纯净度实时监测
// @namespace    http://tampermonkey.net/
// @version      1.3
// @author       Gemini
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      my.ippure.com
// ==/UserScript==

(function() {
    'use strict';

    const CACHE_MINUTES = 5;
    const API_URL = "https://my.ippure.com/v1/info";

    let savedLeft = GM_getValue('ip_monitor_left', '');
    let savedTop = GM_getValue('ip_monitor_top', '');
    let isMinimized = GM_getValue('ip_monitor_minimized', false);
    let savedWidth = GM_getValue('ip_monitor_width', '');
    let savedHeight = GM_getValue('ip_monitor_height', '');

    const host = document.createElement('div');
    host.id = 'ip-pure-monitor-host';
    host.style.cssText = 'position: fixed; z-index: 2147483647; top: 0; left: 0; width: 0; height: 0; overflow: visible; pointer-events: none;';
    document.documentElement.appendChild(host);

    const shadow = host.attachShadow({mode: 'open'});

    const style = document.createElement('style');
    style.textContent = `
        #ip-pure-monitor {
            all: initial;
            position: absolute;
            ${savedLeft && savedTop ? `left: ${savedLeft}; top: ${savedTop};` : 'bottom: 20px; right: 20px;'}
            background: rgba(0, 0, 0, 0.85) !important;
            color: white !important;
            border-radius: 8px !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
            font-size: 13px !important;
            line-height: 1.5 !important;
            box-shadow: 0 4px 10px rgba(0,0,0,0.3) !important;
            user-select: none !important;
            border: 1px solid rgba(255,255,255,0.1) !important;
            pointer-events: auto;
            min-width: 160px;
            z-index: 2147483647;
            display: flex !important;
            flex-direction: column !important;
            overflow: hidden !important; /* 隐藏外层溢出，保持圆角 */
        }
        .header {
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            padding: 6px 12px !important;
            background: rgba(255, 255, 255, 0.1) !important;
            cursor: move !important;
            font-size: 12px !important;
            color: #ddd !important;
            flex-shrink: 0 !important; /* 防止标题栏被挤压 */
        }
        .content {
            padding: 10px 15px !important;
            cursor: pointer;
            display: ${isMinimized ? 'none' : 'block'} !important;
            box-sizing: border-box !important;

            /* ===== 核心缩放属性 ===== */
            resize: both;
            overflow: auto;
            min-width: 180px;
            min-height: 95px;
        }

        /* 滚动条与拉伸图标的美化 */
        .content::-webkit-scrollbar {
            width: 8px;
            height: 8px;
        }
        .content::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.3);
            border-radius: 4px;
        }
        .content::-webkit-scrollbar-corner {
            background: transparent;
        }

        .content::-webkit-resizer {
            background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12"><path d="M12 0L0 12h12V0z" fill="rgba(255,255,255,0.6)"/></svg>');
            background-repeat: no-repeat;
            background-position: bottom right;
        }
    `;
    shadow.appendChild(style);


    const monitorDiv = document.createElement('div');
    monitorDiv.id = 'ip-pure-monitor';

    const headerDiv = document.createElement('div');
    headerDiv.className = 'header';

    const titleSpan = document.createElement('span');
    titleSpan.innerText = '🛡️ IP 监测';
    titleSpan.style.fontWeight = 'bold';

    const minBtn = document.createElement('span');
    minBtn.innerText = isMinimized ? '[+]' : '[-]';
    minBtn.style.cssText = 'cursor: pointer; font-weight: bold; padding-left: 10px;';

    headerDiv.appendChild(titleSpan);
    headerDiv.appendChild(minBtn);

    const contentDiv = document.createElement('div');
    contentDiv.className = 'content';

    if (savedWidth) contentDiv.style.width = savedWidth;
    if (savedHeight) contentDiv.style.height = savedHeight;

    monitorDiv.appendChild(headerDiv);
    monitorDiv.appendChild(contentDiv);
    shadow.appendChild(monitorDiv);


    function updateUI(data, isError = false) {
        if (isError) {
            monitorDiv.style.borderLeft = "4px solid #ff4444";
            contentDiv.innerHTML = `<div>❌ 检测失败</div><div style="font-size:11px;color:#aaa;">点击此处重试</div>`;
            return;
        }

        const score = data.fraudScore;
        let statusColor = "#00C851";
        let statusText = "极佳";

        if (score >= 75) {
            statusColor = "#ff4444";
            statusText = "高危";
        } else if (score >= 40) {
            statusColor = "#ffbb33";
            statusText = "中等";
        }

        monitorDiv.style.borderLeft = `4px solid ${statusColor}`;

        if (isMinimized) {
            titleSpan.innerHTML = `<span style="color:${statusColor}">●</span> ${data.ip} (${score})`;
        } else {
            titleSpan.innerText = '🛡️ IP 监测';
        }

        contentDiv.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 4px;">
                <span style="color: ${statusColor};">●</span> IP: ${data.ip}
            </div>
            <div style="color: #ddd;">
                ${data.countryCode} - ${data.city} | 分数: <span style="color:${statusColor};font-weight:bold;">${score}</span> (${statusText})
            </div>
            <div style="font-size: 11px; color: #aaa; margin-top: 4px;">
                ${data.isResidential ? '🏠 住宅' : '🏢 机房'} | ${data.asOrganization || '未知ISP'}
            </div>
        `;
    }

    function fetchIPInfo() {
        contentDiv.innerHTML = `<div style="color:#aaa;">🔄 检测中...</div>`;
        GM_xmlhttpRequest({
            method: "GET",
            url: API_URL,
            timeout: 10000,
            headers: { "Accept": "application/json", "Cache-Control": "no-cache" },
            onload: function(response) {
                if (response.status === 200) {
                    try {
                        const data = JSON.parse(response.responseText);
                        GM_setValue('ip_cache_data', JSON.stringify(data));
                        GM_setValue('ip_cache_time', Date.now());
                        updateUI(data);
                    } catch (e) { updateUI(null, true); }
                } else { updateUI(null, true); }
            },
            onerror: () => updateUI(null, true),
            ontimeout: () => updateUI(null, true)
        });
    }


    minBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        isMinimized = !isMinimized;
        GM_setValue('ip_monitor_minimized', isMinimized);

        if (isMinimized) {
            contentDiv.style.setProperty('display', 'none', 'important');
            minBtn.innerText = '[+]';
            try {
                const cachedData = JSON.parse(GM_getValue('ip_cache_data'));
                if(cachedData) updateUI(cachedData);
            } catch(e) {}
        } else {
            contentDiv.style.setProperty('display', 'block', 'important');
            minBtn.innerText = '[-]';
            titleSpan.innerText = '🛡️ IP 监测';
        }
    });

    contentDiv.addEventListener('click', (e) => {
        const rect = contentDiv.getBoundingClientRect();

        const isClickOnResizer = (e.clientX > rect.right - 15) && (e.clientY > rect.bottom - 15);
        if (!isClickOnResizer) {
            fetchIPInfo();
        }
    });

    let isDragging = false;
    let offsetX, offsetY;

    headerDiv.addEventListener('mousedown', (e) => {
        if (e.target === minBtn) return;
        isDragging = true;
        const rect = monitorDiv.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
        monitorDiv.style.transition = 'none';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        e.stopPropagation();

        monitorDiv.style.bottom = 'auto';
        monitorDiv.style.right = 'auto';

        let newX = e.clientX - offsetX;
        let newY = e.clientY - offsetY;

        const maxX = window.innerWidth - monitorDiv.offsetWidth;
        const maxY = window.innerHeight - monitorDiv.offsetHeight;

        newX = Math.max(0, Math.min(newX, maxX));
        newY = Math.max(0, Math.min(newY, maxY));

        monitorDiv.style.left = newX + 'px';
        monitorDiv.style.top = newY + 'px';
    }, true);

    document.addEventListener('mouseup', (e) => {
        if (isDragging) {
            isDragging = false;
            e.stopPropagation();
            monitorDiv.style.transition = 'all 0.3s ease';
            GM_setValue('ip_monitor_left', monitorDiv.style.left);
            GM_setValue('ip_monitor_top', monitorDiv.style.top);
        }
    }, true);


    let resizeTimeout;
    const resizeObserver = new ResizeObserver(() => {
        if (isMinimized) return; 
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {

            if (contentDiv.style.width) GM_setValue('ip_monitor_width', contentDiv.style.width);
            if (contentDiv.style.height) GM_setValue('ip_monitor_height', contentDiv.style.height);
        }, 300); 
    });
    resizeObserver.observe(contentDiv);

    const cachedDataStr = GM_getValue('ip_cache_data');
    const cachedTime = GM_getValue('ip_cache_time');
    const now = Date.now();

    if (cachedDataStr && cachedTime && (now - cachedTime < CACHE_MINUTES * 60 * 1000)) {
        try { updateUI(JSON.parse(cachedDataStr)); } catch (e) { fetchIPInfo(); }
    } else {
        fetchIPInfo();
    }
})();
