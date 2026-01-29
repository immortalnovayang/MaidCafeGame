/**
 * ViewOverlays.js - Overlay and modal rendering logic
 * Extends the View class with overlay/modal methods.
 */

View.prototype.showOverlay = function (title, contentHTML, btnText, btnCallback) {
    if (this.dom.overlay.style.display !== 'flex') {
        this.gameState.setPaused(true);
        this.dom.overlay.style.display = 'flex';
    }

    const h2 = this.dom.modalContent.querySelector('h2');
    const p = this.dom.modalContent.querySelector('p');
    const btn = document.getElementById('start-btn');
    const contentDiv = this.dom.modalContent;

    h2.innerText = title;
    p.innerHTML = contentHTML;

    const specials = contentDiv.querySelectorAll('.special-content');
    specials.forEach(el => el.remove());

    if (btnText) {
        btn.style.display = 'block';
        btn.innerText = btnText;
        // Direct assignment to avoid closure wrapping issues
        btn.onclick = btnCallback;
        console.log(`[View] showOverlay: Bound button "${btnText}"`);
    } else {
        btn.style.display = 'none';
        btn.onclick = null; // Clear handler
    }
};

View.prototype.showEventModal = function (event, onNext) {
    // Decision Events need special handling
    const isDecision = event.type === 'DECISION';
    const btnText = isDecision ? null : "開始營業";

    // Color coding
    let color = "#3498db"; // Default Blue
    let icon = "📢";
    if (event.type === 'ENVIRONMENT') { color = "#2ecc71"; icon = "🌤️"; }
    if (event.type === 'MARKET') { color = "#f1c40f"; icon = "📈"; }
    if (event.type === 'CRISIS') { color = "#e74c3c"; icon = "⚠️"; }
    if (event.type === 'DECISION') { color = "#9b59b6"; icon = "🤔"; }

    let html = `
        <div style="text-align:center; padding:10px;">
            <div style="font-size:3em; margin-bottom:10px;">${icon}</div>
            <h3 style="color:${color}; margin:0 0 10px 0;">${event.title}</h3>
            <p style="font-size:1.1em; line-height:1.5;">${event.desc}</p>
    `;

    // Show effects summary if not a decision (Decisions are hidden until choice)
    if (!isDecision && event.effects) {
        html += `<div style="background:rgba(0,0,0,0.05); padding:10px; border-radius:8px; margin-top:15px; font-size:0.9em; text-align:left;">
            <strong>影響：</strong><ul style="margin:5px 0 0 20px; padding:0;">`;

        if (event.effects.spawnRateMod) html += `<li>客流量: ${event.effects.spawnRateMod > 0 ? '+' : ''}${event.effects.spawnRateMod * 100}%</li>`;
        if (event.effects.incomeMod) html += `<li>收入: ${event.effects.incomeMod * 100}%</li>`;
        if (event.effects.patienceDecayMod) html += `<li>耐心下降: ${event.effects.patienceDecayMod * 100}%</li>`;
        if (event.effects.checkTrash) html += `<li><span style="color:#e74c3c">垃圾過多將罰款！</span></li>`;

        if (event.effects.specialGoal) {
            const goals = {
                'NO_ANGRY_LEAVE': '無人憤怒離開'
            };
            const text = goals[event.effects.specialGoal] || event.effects.specialGoal;
            html += `<li><span style="color:#e67e22">特殊目標: ${text}</span></li>`;
        }
        if (event.effects.tipMod) html += `<li>小費倍率: x${event.effects.tipMod}</li>`;

        html += `</ul></div>`;
    }

    html += `</div>`;

    if (isDecision) {
        // Render Choice Buttons
        html += `<div style="display:flex; justify-content:center; gap:15px; margin-top:20px;">`;
        event.choices.forEach((choice, idx) => {
            // Need unique IDs for binding
            html += `<button id="evt-choice-${idx}" class="btn" style="min-width:120px; font-size:1em;">${choice.text}</button>`;
        });
        html += `</div>`;

        this.showOverlay("突發事件", html, null);

        // Bind clicks
        event.choices.forEach((choice, idx) => {
            const btn = document.getElementById(`evt-choice-${idx}`);
            if (btn) {
                btn.onclick = () => {
                    const result = this.gameState.handleDecision(choice.action, this.gameState);
                    // Show Result Overlay
                    const resHtml = `<div style="text-align:center;">
                        <div style="font-size:3em; margin-bottom:10px;">${result.success ? '✅' : '❌'}</div>
                        <p>${result.message}</p>
                    </div>`;
                    this.showOverlay("事件結果", resHtml, "開始營業", onNext);
                };
            }
        });

    } else {
        this.showOverlay("突發事件", html, btnText, onNext);
    }
};

View.prototype.showDayReport = function (data, onNext) {
    // [SAFEGUARD] If gold is negative (bankruptcy), do not show report, trigger Game Over logic
    if (data.gold < 0) {
        console.warn("Bankruptcy detected in View DayReport! Triggering Game Over.");
        this.gameState.notify('game_over', {
            reason: 'BANKRUPTCY',
            rent: data.isRentDay ? data.rentDue : 0,
            totalSalaries: data.salaryTotal,
            eventFine: data.eventFine,
            eventFineReason: data.eventFineReason,
            facilityCost: data.facilityCost,
            finalGold: data.gold
        });
        return;
    }

    let reportMsg = `<div style="text-align:left; margin-bottom:10px;">
        <h3 style="margin:0 0 10px 0; color:#333;">📅 第 ${data.day} 天營業報表</h3>
        
        <div style="background:#f9f9f9; padding:10px; border-radius:8px; margin-bottom:15px; font-size:0.95em;">
            <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                <span>營業收入</span>
                <span style="color:var(--color-success-green);">+$${data.income}</span>
            </div>`;

    if (data.trashIncome > 0) {
        reportMsg += `
            <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                <span>資源回收獎勵</span>
                <span style="color:var(--color-success-green);">+$${data.trashIncome}</span>
            </div>`;
    }

    if (data.interestIncome > 0) {
        reportMsg += `
            <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                <span>萌萌基金利息</span>
                <span style="color:var(--color-success-green);">+$${data.interestIncome}</span>
            </div>`;
    }

    reportMsg += `
            <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                <span>女僕薪資</span>
                <span style="color:var(--color-accent-pink);">-$${data.salaryTotal}</span>
            </div>`;

    if (data.eventFine > 0) {
        reportMsg += `
            <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                <span>${data.eventFineReason || '活動罰款'}</span>
                <span style="color:var(--color-accent-pink);">-$${data.eventFine}</span>
            </div>`;
    }

    if (data.facilityCost > 0) {
        reportMsg += `
            <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                <span>設施維護費</span>
                <span style="color:var(--color-accent-pink);">-$${data.facilityCost}</span>
            </div>`;
    }

    const profitColor = data.netProfit >= 0 ? 'var(--color-success-green)' : 'var(--color-accent-pink)';
    reportMsg += `
            <div style="border-top:1px dashed #ccc; margin:5px 0;"></div>
            <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:1.1em;">
                <span>本日淨利</span>
                <span style="color:${profitColor};">${data.netProfit >= 0 ? '+' : ''}$${data.netProfit}</span>
            </div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; background:var(--color-primary-purple); color:black; padding:8px 12px; border-radius:8px;">
            <span>💰 總資產</span>
            <span style="font-size:1.2em; font-weight:bold;">$${data.gold}</span>
        </div>
        
        <div style="margin-top:10px; font-size:0.9em; text-align:right; color:#666;">
            當前名聲: <strong style="color:var(--color-primary-purple);">${data.reputation}</strong>
            ${data.repInterest > 0 ? `<span style="font-size:0.85em; color:var(--color-success-green);"> (+${data.repInterest} 口碑發酵)</span>` : ''}
        </div>
    </div>`;

    // Social Feed UI
    let feedHtml = `<div class="social-feed" style="max-height:150px; overflow-y:auto;">`;
    if (data.socialFeed && data.socialFeed.length > 0) {
        data.socialFeed.forEach(item => {
            feedHtml += `
                <div class="social-item">
                    <div class="social-avatar">${item.avatar}</div>
                    <div class="social-content">
                        <div class="social-header">
                            <span class="social-name">${item.name}</span>
                            <span class="social-time">${item.time}</span>
                        </div>
                        <div class="social-text">${item.comment}</div>
                    </div>
                </div>
            `;
        });
    }
    feedHtml += `</div>`;

    reportMsg += feedHtml;

    if (data.isRentDay) {
        reportMsg += `<div style="margin-top:15px; padding:10px; background:#fff0f0; border-radius:8px; border:2px dashed var(--color-accent-pink);">
            <strong>⚠️ 租金結算日</strong><br>
            準備好面對房東了嗎？
        </div>`;
    }

    const btnText = data.isRentDay ? "前往租金談判" : "前往獎勵";
    const callback = data.isRentDay ? () => this.showRentNegotiation(data, onNext) : onNext;

    this.showOverlay("今日營業總結", reportMsg, btnText, callback);
};

View.prototype.showRentNegotiation = function (data, onNext) {
    this.showOverlay("租金談判 (Rent Negotiation)", "房東正在等著你...", null);

    const container = document.createElement('div');
    container.className = 'special-content negotiation-container';

    container.innerHTML = `
        <div class="landlord-area">
            👴
            <div class="speech-bubble">這週賺了不少吧？租金該漲一下了...</div>
        </div>
        <div style="text-align:center; margin-bottom:10px;">
            <p>本週基礎租金: <strong>$${this.gameState.currentRent}</strong></p>
            <p style="font-size:0.9em; color:#666;">根據你的表現，選擇一個談判策略：</p>
        </div>
        <div class="strategy-row">
            <div class="strategy-card" data-strategy="MERCY">
                <h4>懇求減免</h4>
                <p>訴諸苦勞，安全但回報低。</p>
                <span class="risk-tag risk-low">風險: 低</span>
            </div>
            <div class="strategy-card" data-strategy="RESULTS">
                <h4>成果展示</h4>
                <p>用高評價說服房東。</p>
                <span class="risk-tag risk-med">風險: 中</span>
            </div>
            <div class="strategy-card" data-strategy="THREAT">
                <h4>以退為進</h4>
                <p>威脅搬走，高回報高風險。</p>
                <span class="risk-tag risk-high">風險: 高</span>
            </div>
        </div>
    `;

    container.querySelectorAll('.strategy-card').forEach(card => {
        card.onclick = async () => {
            const strategy = card.getAttribute('data-strategy');
            const result = await this.gameState.handleRentNegotiation(strategy);

            if (!result.success && result.reason === 'BANKRUPTCY') {
                this.gameState.notify('game_over', {
                    reason: 'BANKRUPTCY',
                    rent: result.rent,
                    totalSalaries: 0, // already deducted
                    finalGold: this.gameState.gold
                });
            } else {
                this.showNegotiationResult(result.report, () => {
                    this.hideOverlay();
                    this.showUpgradeSelection(result.upgrades);
                });
            }
        };
    });

    this.dom.modalContent.appendChild(container);
};

View.prototype.showNegotiationResult = function (report, onNext) {
    const color = report.success ? 'var(--color-success-green)' : 'var(--color-accent-pink)';
    const resultHtml = `
        <div style="text-align:center; padding:20px;">
            <h1 style="font-size:3em;">${report.success ? '🎊' : '😨'}</h1>
            <p style="font-size:1.2em; font-weight:bold; color:${color};">${report.message}</p>
            <div style="margin-top:20px; font-size:1.1em; background:rgba(0,0,0,0.05); padding:15px; border-radius:10px;">
                最終支付租金: <strong style="color:var(--color-accent-pink);">$${report.rentPaid}</strong><br>
                帳戶餘額: $${this.gameState.gold}
            </div>
        </div>
    `;

    this.showOverlay("談判結果", resultHtml, "繼續", onNext);
};

View.prototype.hideOverlay = function () {
    if (this.dom.overlay.style.display === 'none') return;
    this.dom.overlay.style.display = 'none';
    const specials = this.dom.modalContent.querySelectorAll('.special-content');
    specials.forEach(el => el.remove());
    this.gameState.setPaused(false);
};

View.prototype.hideMaidList = function () {
    if (this.dom.maidOverlay.style.display === 'none') return;
    this.dom.maidOverlay.style.display = 'none';
    this.gameState.setPaused(false);
};

View.prototype.showMaidList = function () {
    if (this.dom.maidOverlay.style.display !== 'flex') {
        this.gameState.setPaused(true);
        this.dom.maidOverlay.style.display = 'flex';
    }

    this.dom.maidListContent.innerHTML = '';
    window.renderMaidListRef = this.showMaidList.bind(this);

    const table = document.createElement('table');
    table.className = 'maid-mgmt-table';
    table.innerHTML = `
        <thead>
            <tr>
                <th>女僕</th>
                <th>屬性</th>
                <th>能力描述</th>
                <th>薪資/日</th>
                <th>狀態</th>
                <th>操作</th>
            </tr>
        </thead>
        <tbody></tbody>
    `;

    const tbody = table.querySelector('tbody');
    this.gameState.maids.forEach(m => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td style="padding: 10px;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-size:1.5em; background:${m.color}; border-radius:50%; width:35px; height:35px; display:flex; align-items:center; justify-content:center;">${m.emoji}</span>
                    <strong>${m.name}</strong>
                </div>
            </td>
            <td style="padding: 10px;">
                <div style="font-size:0.85em;">
                    <span title="當前移動速度：${Math.round(m.baseSpeed)} px/s。影響場上移動效率，數值越高移動越快。">速: ${Math.round(m.baseSpeed)}</span><br>
                    <span title="當前體力：${Math.round(m.stamina)} / ${m.maxStamina}。體力歸零時速度會減半，購買商店補給可恢復。">體: ${Math.round(m.stamina)} / ${m.maxStamina}</span>
                </div>
            </td>
            <td style="text-align:left; font-size:0.85em; max-width:200px; padding: 10px;">
                <div style="color:var(--color-primary-purple); font-weight:bold; margin-bottom:4px;">${m.skillName}</div>
                ${m.desc}
            </td>
            <td style="padding: 10px;">$${m.salary}</td>
            <td style="padding: 10px;">
                <div style="font-weight:bold; color:${m.employmentStatus === 'REST' ? '#888' : '#2ecc71'}">
                    ${m.employmentStatus === 'REST' ? '休息中 💤' : '上工中 ✅'}
                </div>
            </td>
        `;

        // Create Actions Cell Manually to support closures
        const actionsTd = document.createElement('td');
        actionsTd.style.padding = '10px';

        // 1. Shift Toggle Button
        const shiftBtn = document.createElement('button');
        shiftBtn.className = 'btn-small';
        shiftBtn.style.marginRight = '5px';
        shiftBtn.style.background = m.employmentStatus === 'REST' ? '#2ecc71' : '#f39c12';
        shiftBtn.innerText = m.employmentStatus === 'REST' ? '排班上工' : '安排休息';

        shiftBtn.onclick = () => {
            if (m.employmentStatus === 'ACTIVE') {
                // Check if this is the last active maid
                const activeCount = this.gameState.maids.filter(x => x.employmentStatus !== 'REST').length;
                if (activeCount <= 1) {
                    alert("至少需要一位女僕值班！無法全部休息。");
                    return;
                }
            }
            m.employmentStatus = m.employmentStatus === 'ACTIVE' ? 'REST' : 'ACTIVE';
            this.showMaidList(); // Re-render immediately
        };
        actionsTd.appendChild(shiftBtn);

        // 2. Fire Button
        const fireBtn = document.createElement('button');
        fireBtn.className = 'btn-fire';
        fireBtn.innerText = '解雇';

        // Conditions to disable firing
        const isOneMaid = this.gameState.maids.length <= 1;
        const isBusy = this.gameState.isBusinessHours;

        if (isOneMaid || isBusy) {
            fireBtn.disabled = true;
            fireBtn.style.opacity = '0.5';
            fireBtn.style.cursor = 'not-allowed';
            if (isBusy) fireBtn.title = "營業期間不可解雇";
            else if (isOneMaid) fireBtn.title = "至少需保留一位女僕";
        }

        fireBtn.onclick = () => {
            if (fireBtn.disabled) return;
            if (confirm(`確定要解雇 ${m.name} 嗎？`)) {
                const res = this.gameState.fireMaid(m.id);
                if (res.success) {
                    this.showMaidList();
                } else {
                    alert("無法解雇: " + res.reason);
                }
            }
        };
        actionsTd.appendChild(fireBtn);

        row.appendChild(actionsTd);
        tbody.appendChild(row);
    });

    this.dom.maidListContent.appendChild(table);
};

View.prototype.toggleDebugPanel = function () {
    let panel = document.getElementById('debug-panel');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'debug-panel';
        document.body.appendChild(panel);

        const h3 = document.createElement('h3');
        h3.innerText = "🔧 Debug Panel";
        panel.appendChild(h3);

        const list = document.createElement('div');
        this.gameState.upgradesList.forEach(u => {
            const btn = document.createElement('button');
            btn.className = 'debug-btn';
            btn.innerText = `[${u.id}] ${u.name}`;
            btn.title = u.desc;
            btn.onclick = () => {
                this.gameState.applyUpgrade(u.id);
                console.log(`Debug applied: ${u.id}`);
                // Visual feedback
                btn.style.background = '#005500';
                setTimeout(() => btn.style.background = '#333', 200);
            };
            list.appendChild(btn);
        });
        panel.appendChild(list);
    }

    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
};

View.prototype.showCafeStatus = function () {
    // Ensure Maid List is closed
    this.hideMaidList();

    // Only pause if this specific overlay isn't open
    if (this.dom.statusOverlay.style.display !== 'flex') {
        this.gameState.setPaused(true);
        this.dom.statusOverlay.style.display = 'flex';
    }

    const contentDiv = this.dom.statusOverlay.querySelector('#status-content');

    contentDiv.innerHTML = "";

    const container = document.createElement('div');
    container.style.textAlign = 'left';
    container.style.marginTop = '15px';

    // 1. Current Stats Summary
    const statsHtml = `
        <h4 style="margin:5px 0; border-bottom:1px solid #ccc;">當前加成 (Current Stats)</h4>
        <ul style="padding-left:20px; font-size:1em;">
            <li data-tooltip="核心名聲值。每 10 點名聲可顯著縮短客人進店的間隔。">名聲 (Reputation): ${this.gameState.reputation}</li>
            <li data-tooltip="當前受事件或技能影響的客流量加成。">生成速度加成: ${this.gameState.spawnRateMod || 0}</li>
            <li data-tooltip="影響客人滿意度與最終小費的加成比率。">小費加成: ${((this.gameState.incomeMod || 1.0) - 1).toFixed(2) * 100}%</li>
            <li data-tooltip="已啟用的自動化設備，可減輕女僕工作壓力並穩定營運。">自動化設施: ${this.gameState.conveyorBelt ? '✅磁浮輸送帶 ' : ''}${this.gameState.roomba ? '✅掃地機器人 ' : ''}</li>
            <li data-tooltip="當前可用的桌位總數，直接影響最高客容量。">房間桌數: ${this.gameState.tables.length} (Max: 10)</li>
        </ul>
    `;

    // 2. Upgrades List
    let upgradesHtml = `<h4 style="margin:15px 0 5px; border-bottom:1px solid #ccc;">已啟用強化 (Active Upgrades)</h4>`;

    if (this.gameState.appliedUpgradeIds.length === 0) {
        upgradesHtml += `<p style="color:#888;">尚無強化項目。</p>`;
    } else {
        upgradesHtml += `<div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">`;

        // Count duplicates
        const counts = {};
        this.gameState.appliedUpgradeIds.forEach(id => {
            counts[id] = (counts[id] || 0) + 1;
        });

        const uniqueIds = Object.keys(counts);
        uniqueIds.forEach(id => {
            const u = this.gameState.upgradesList.find(x => x.id === id);
            if (u) {
                const countStr = counts[id] > 1 ? ` <span style="font-weight:bold; color:var(--color-primary-purple);">x${counts[id]}</span>` : '';
                upgradesHtml += `<div style="background:#fff; padding:8px; border:1px solid #eee; border-radius:5px;">
                    <strong>${u.name}</strong>${countStr}<br>
                    <span style="color:#666; font-size:0.85em;">${u.desc}</span>
                </div>`;
            }
        });
        upgradesHtml += `</div>`;
    }

    container.innerHTML = statsHtml + upgradesHtml;
    contentDiv.appendChild(container);
};

View.prototype.hideCafeStatus = function () {
    if (this.dom.statusOverlay.style.display === 'none') return;
    this.dom.statusOverlay.style.display = 'none';
    this.gameState.setPaused(false);
};
