class View {
    constructor() {
        this.dom = {
            day: document.getElementById('day-display'),
            time: document.getElementById('timer-display'),
            gold: document.getElementById('gold-display'),
            gameArea: document.getElementById('game-area'),
            maidContainer: document.getElementById('ui-footer'),
            overlay: document.getElementById('overlay-layer'),
            modalContent: document.getElementById('modal-content'),
            startBtn: document.getElementById('start-btn'),
            header: document.getElementById('ui-header'),
            rep: document.getElementById('rep-display'),
            rating: document.getElementById('rating-display'),
            rentDay: document.getElementById('rent-day-display'),
            rentAmount: document.getElementById('rent-amount-display'),
            victoryGoal: document.getElementById('victory-goal'),
            maidListBtn: document.getElementById('maid-list-btn'),
            maidOverlay: document.getElementById('maid-list-layer'),
            maidListContent: document.getElementById('maid-list-content'),
            maidCloseBtn: document.getElementById('close-maid-list'),
            statusOverlay: null // Will be created dynamically or ensure exists
        };

        // Create Status Overlay dynamically if not in HTML
        this.createStatusOverlay();

        this.tables = [];
        this.customerElements = {};
        this.maidElements = {};
        this.trashElements = {};
    }

    init(gameState, gameLoop) {
        this.gameState = gameState;
        this.gameLoop = gameLoop;

        // Create Speed Controls
        this.renderSpeedControls();

        // Setup initial UI
        // Handled by showOverlay call below

        // Initial Render
        this.renderTables(gameState.tables);
        this.renderMaids(gameState.maids);
        this.updateHUD({
            day: gameState.day,
            gold: gameState.gold,
            rentDay: Math.ceil(gameState.day / 7) * 7,
            rentAmount: gameState.currentRent,
            victoryGoal: gameState.victoryGoldGoal
        });

        // Setup initial state as paused for the main menu
        this.gameState.setPaused(true);

        // Maid List Button
        if (this.dom.maidListBtn) {
            this.dom.maidListBtn.onclick = () => {
                this.showMaidList();
            };
        }

        if (this.dom.maidCloseBtn) {
            this.dom.maidCloseBtn.onclick = () => {
                this.hideMaidList();
            };
        }

        // Debug Key Listener
        window.addEventListener('keydown', (e) => {
            if (e.key === 'F2') {
                this.toggleDebugPanel();
            }
        });

        // Auto-Clean Toggle
        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'toggle-clean-btn';
        toggleBtn.className = 'btn-small';
        toggleBtn.style.marginLeft = '10px';
        toggleBtn.innerText = '🧹 ON';
        toggleBtn.setAttribute('data-tooltip', '自動清理: 開啟時 女僕會自動去清理客人產生的垃圾🗑️');
        toggleBtn.onclick = () => {
            const newState = this.gameState.toggleAutoClean();
            toggleBtn.innerText = `🧹 ${newState ? 'ON' : 'OFF'}`;
            toggleBtn.style.opacity = newState ? '1' : '0.6';
        };
        this.dom.header.appendChild(toggleBtn);

        // Cafe Info Button
        const infoBtn = document.createElement('button');
        infoBtn.className = 'btn-small';
        infoBtn.style.marginLeft = '10px';
        infoBtn.innerText = '📋 咖啡廳狀態';
        infoBtn.onclick = () => {
            this.showCafeStatus();
        };
        this.dom.header.appendChild(infoBtn);
    }

    renderSpeedControls() {
        const container = document.createElement('div');
        container.style.display = 'flex';
        container.style.gap = '5px';
        container.style.alignItems = 'center';
        container.style.marginLeft = 'auto';

        const speeds = this.gameState.config.gameSpeeds || [1, 2, 5];
        speeds.forEach(speed => {
            const btn = document.createElement('button');
            btn.innerText = `x${speed}`;
            btn.style.padding = '5px 10px';
            btn.style.cursor = 'pointer';
            btn.style.fontWeight = 'bold';
            btn.style.border = '2px solid var(--color-text-dark)';
            btn.style.borderRadius = '5px';
            btn.style.background = '#fff';

            btn.setAttribute('data-tooltip', `切換遊戲速度 ${speed} 倍`);

            btn.onclick = () => {
                this.gameLoop.setTimeScale(speed);
                Array.from(container.children).forEach(b => b.style.background = '#fff');
                btn.style.background = '#ADD8E6';
            };

            if (speed === 1) btn.style.background = '#ADD8E6';
            container.appendChild(btn);
        });

        this.dom.header.appendChild(container);
    }

    createStatusOverlay() {
        if (document.getElementById('status-overlay')) {
            this.dom.statusOverlay = document.getElementById('status-overlay');
            return;
        }

        const el = document.createElement('div');
        el.id = 'status-overlay';
        el.className = 'overlay-secondary'; // Same as Maid List
        el.style.display = 'none';

        el.innerHTML = `
            <div class="modal-large">
                <div class="modal-header">
                    <h2>📋 咖啡廳經營狀態</h2>
                    <button class="close-btn" id="close-status-btn">&times;</button>
                </div>
                <div id="status-content"></div>
            </div>
        `;

        // Append to the same container as the maid list (usually #app)
        if (this.dom.maidOverlay && this.dom.maidOverlay.parentElement) {
            this.dom.maidOverlay.parentElement.appendChild(el);
        } else {
            document.getElementById('app').appendChild(el);
        }

        this.dom.statusOverlay = el;

        // Setup Close Handler
        el.querySelector('#close-status-btn').onclick = () => {
            this.hideCafeStatus();
        };
    }

    updateEntities(data) {
        // Update table styles without rebuilding (for performance)
        if (data.tables && data.forceRebuildTables) {
            // Only rebuild tables when explicitly requested (e.g., after upgrade)
            this.renderTables(data.tables);
        } else if (data.tables) {
            // Just update table styles without clearing the game area
            this.updateTableStyles(data.tables);
        }
        if (data.customers) {
            this.renderCustomers(data.customers);
        }
        if (data.queue) {
            this.renderQueue(data.queue);
        }
        if (data.trash) {
            this.renderTrash(data.trash);
        }
        if (data.maids) {
            this.renderMaidsEntities(data.maids);

            // If a new maid was hired, rebuild cards
            const currentCards = this.dom.maidContainer.querySelectorAll('.maid-card');
            if (currentCards.length !== data.maids.length) {
                this.renderMaids(data.maids);
            }

            // Update UI cooldowns
            const cards = this.dom.maidContainer.querySelectorAll('.maid-card');
            data.maids.forEach((m, idx) => {
                if (cards[idx]) {
                    const overlay = cards[idx].querySelector('.cd-overlay');
                    if (overlay) {
                        const pct = Math.max(0, (m.cooldown / m.maxCooldown) * 100);
                        overlay.style.height = `${pct}%`;
                    }

                    // Skill Ready Glow
                    if (m.cooldown <= 0 && m.stamina > 0) {
                        cards[idx].classList.add('ready');
                    } else {
                        cards[idx].classList.remove('ready');
                    }

                    // Also update card color just in case (e.g. fatigue state handled differently?)
                    cards[idx].style.opacity = m.stamina <= 0 ? '0.7' : '1';

                    // Update Stamina Bar
                    const staminaBar = cards[idx].querySelector('.stamina-bar-fill');
                    if (staminaBar) {
                        const stamPct = Math.max(0, (m.stamina / m.maxStamina) * 100);
                        staminaBar.style.width = `${stamPct}%`;
                        // Color color based on health: green > orange > red
                        if (stamPct > 50) staminaBar.style.backgroundColor = '#2ecc71';
                        else if (stamPct > 20) staminaBar.style.backgroundColor = '#f1c40f';
                        else staminaBar.style.backgroundColor = '#e74c3c';
                    }
                }
            });
        }
    }

    updateTableStyles(tables) {
        // Update existing table elements without rebuilding
        tables.forEach((t, i) => {
            if (this.tables[i]) {
                const tableEl = this.tables[i];
                if (t.unlocked) {
                    tableEl.classList.remove('locked');
                    tableEl.style.backgroundColor = '';
                    tableEl.style.opacity = '1';
                    tableEl.innerText = `T${i + 1}`;
                } else {
                    tableEl.classList.add('locked');
                    tableEl.style.backgroundColor = '#999';
                    tableEl.style.opacity = '0.5';
                    tableEl.innerText = '🔒';
                }
            }
        });
    }

    // NOTE: Entity rendering methods (renderQueue, renderCustomers, renderMaidsEntities,
    // getStatusIcon, renderTrash) are now in ViewEntities.js

    updateHUD(data) {
        if (data.day !== undefined) this.dom.day.innerText = data.day;
        if (data.rep !== undefined) this.dom.rep.innerText = data.rep;
        if (data.avgRating !== undefined) this.dom.rating.innerText = data.avgRating;
        if (data.time !== undefined) {
            const t = Number(data.time);
            this.dom.time.innerText = isNaN(t) ? data.time : t.toFixed(1);
        }
        if (data.gold !== undefined) this.dom.gold.innerText = data.gold;
        if (data.rentDay !== undefined) this.dom.rentDay.innerText = data.rentDay;
        if (data.rentAmount !== undefined) this.dom.rentAmount.innerText = data.rentAmount;
        if (data.victoryGoal !== undefined && this.dom.victoryGoal) {
            this.dom.victoryGoal.innerText = data.victoryGoal.toLocaleString();
        }
    }

    renderTables(tables) {
        // Clear game area except ui-footer (maid controls)
        const footer = this.dom.gameArea.querySelector('#ui-footer');
        this.dom.gameArea.innerHTML = '';
        if (footer) {
            this.dom.gameArea.appendChild(footer);
        }

        this.tables = [];
        // Clear entity references since we cleared the DOM
        this.customerElements = {};
        this.maidElements = {};
        this.trashElements = {};

        // Get game area dimensions for relative positioning
        const gameAreaRect = this.dom.gameArea.getBoundingClientRect();

        // === DOOR (Base Reference Point) ===
        // Door positioned above the wait area
        const entrance = document.createElement('div');
        entrance.className = 'entrance';
        entrance.innerText = '🚪';
        entrance.style.position = 'absolute';
        entrance.style.bottom = '110px'; // Above wait area (100px height + 5px margin)
        entrance.style.left = '50%';
        entrance.style.transform = 'translateX(-50%)';
        entrance.title = '入口';
        this.dom.gameArea.appendChild(entrance);

        // Store door position for reference (will be used by GameState)
        // Door is at bottom, so Y coord = gameArea.height - doorOffset
        const doorOffset = 130; // Distance from bottom for door center
        this.doorPosition = {
            x: gameAreaRect.width / 2,
            y: gameAreaRect.height - doorOffset
        };

        // === WAIT AREA (Inside game area, doubled height) ===
        const waitArea = document.createElement('div');
        waitArea.id = 'wait-area-overlay';
        waitArea.className = 'wait-area';
        const maxQ = (this.gameState.balance.queue.maxSize || 10) + (this.gameState.maxQueueSizeBonus || 0);
        waitArea.innerText = `🧍 等候區 (上限 ${maxQ} 人)`;
        waitArea.style.position = 'absolute';
        waitArea.style.bottom = '5px';
        waitArea.style.left = '10px'; // Leave space for maid controls on right
        waitArea.style.width = 'calc(100% - 90px)'; // Leave space for maid controls
        waitArea.style.height = '100px'; // Doubled height
        this.dom.gameArea.appendChild(waitArea);

        // === COUNTER/KITCHEN (Top Right) ===
        const counter = document.createElement('div');
        counter.className = 'counter';
        counter.innerText = '🍳';
        counter.style.position = 'absolute';
        counter.style.top = '20px';
        counter.style.right = '20px';
        counter.title = '櫃檯/廚房';
        this.dom.gameArea.appendChild(counter);

        // Render Tables
        tables.forEach((t, i) => {
            const table = document.createElement('div');
            table.className = 'table';
            table.innerText = `T${i + 1}`;

            table.style.top = `${t.y}px`;
            table.style.left = `${t.x}px`;

            // Style based on unlocked status
            if (!t.unlocked) {
                table.classList.add('locked');
                table.style.backgroundColor = '#999';
                table.style.opacity = '0.5';
                table.innerText = '🔒';
            }

            this.dom.gameArea.appendChild(table);
            this.tables.push(table);
        });

        // Tell GameState the actual door position (after DOM is ready)
        if (this.gameState && this.gameState.setDoorPosition) {
            const doorY = gameAreaRect.height - doorOffset;
            const doorX = gameAreaRect.width / 2;

            // Kitchen is at top: 20px, right: 20px
            // Counter width is 120, height 60
            const kitchenX = gameAreaRect.width - 20 - 60; // Center of counter
            const kitchenY = 20 + 30; // Center of counter

            this.gameState.setDoorPosition(doorX, doorY, gameAreaRect.height, kitchenX, kitchenY);
        }
    }

    showFloatingText(text, x, y, color) {
        const ft = document.createElement('div');
        ft.className = 'floating-text';
        ft.innerText = text;
        ft.style.left = `${x}px`;
        ft.style.top = `${y}px`;
        if (color) ft.style.color = color;

        this.dom.gameArea.appendChild(ft);

        // Remove element after animation ends
        setTimeout(() => {
            if (ft.parentNode) ft.parentNode.removeChild(ft);
        }, 1200);
    }

    renderMaids(maids) {
        this.dom.maidContainer.innerHTML = '';
        maids.forEach(maid => {
            const card = document.createElement('div');
            card.className = 'maid-card';
            card.style.backgroundColor = maid.color;

            if (maid.skillType === 'PASSIVE') {
                card.classList.add('passive');
            } else {
                card.onclick = () => {
                    this.gameState.triggerMaidSkill(maid.id);
                };
            }

            // Create Tooltip
            const tooltip = document.createElement('div');
            tooltip.className = 'maid-tooltip';
            tooltip.innerHTML = `
                <h4>${maid.name}</h4>
                <div class="skill-type-tag">${maid.skillType === 'PASSIVE' ? '被動技能' : '主動技能'}</div>
                <div style="font-weight:bold; color:var(--color-highlight-mint); margin-bottom:4px;">${maid.skillName}</div>
                <div>${maid.skillDesc || '暫無描述'}</div>
            `;
            card.appendChild(tooltip);

            const nameLabel = document.createElement('div');
            nameLabel.innerText = maid.name;
            card.appendChild(nameLabel);

            if (maid.skillName) {
                const skillLabel = document.createElement('div');
                skillLabel.className = 'skill-label';
                skillLabel.innerText = maid.skillName;
                card.appendChild(skillLabel);
            }

            // Stamina Bar
            const stamContainer = document.createElement('div');
            stamContainer.className = 'maid-card-stamina-container';
            stamContainer.style.cssText = 'width:80%; height:4px; background:rgba(255,255,255,0.3); border-radius:3px; margin-top:5px; overflow:hidden;';
            const stamBar = document.createElement('div');
            stamBar.className = 'stamina-bar-fill';
            const stamPct = (maid.stamina / maid.maxStamina) * 100;
            stamBar.style.cssText = `width:${stamPct}%; height:100%; background:#2ecc71; transition: width 0.3s;`;
            stamContainer.appendChild(stamBar);
            card.appendChild(stamContainer);

            // Cooldown Overlay (Only for ACTIVES)
            if (maid.skillType === 'ACTIVE') {
                const overlay = document.createElement('div');
                overlay.className = 'cd-overlay';
                const pct = (maid.cooldown / maid.maxCooldown) * 100;
                overlay.style.height = `${pct}%`;
                card.appendChild(overlay);
            }

            this.dom.maidContainer.appendChild(card);
        });
    }

    // NOTE: showOverlay and showDayReport are now in ViewOverlays.js

    showUpgradeSelection(upgrades) {
        const title = "選擇獎勵";
        const contentHTML = `請選擇一項永久強化。`;
        this.showOverlay(title, contentHTML, null);

        const container = document.createElement('div');
        container.className = 'special-content';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.alignItems = 'center';

        const cardsDiv = document.createElement('div');
        cardsDiv.style.display = 'flex';
        cardsDiv.style.gap = '15px';
        cardsDiv.style.marginTop = '20px';

        // Reroll & Banish Footer
        const footerDiv = document.createElement('div');
        footerDiv.className = 'reroll-section';
        footerDiv.style.cssText = 'display:flex; justify-content:center; gap:20px; align-items:center; margin-top:20px;';

        const banishInfo = document.createElement('span');
        banishInfo.style.fontSize = '0.9em';
        banishInfo.style.color = '#666';
        banishInfo.innerText = `剩餘移除: ${this.gameState.banishCurrent}`;

        const rrBtn = document.createElement('button');
        rrBtn.className = 'secondary-btn';
        rrBtn.innerText = `重骰 (剩餘 ${this.gameState.rerollCurrent})`;
        rrBtn.disabled = this.gameState.rerollCurrent <= 0;

        const renderCards = (list) => {
            cardsDiv.innerHTML = '';
            if (!list) return;
            list.forEach(u => {
                const card = document.createElement('div');
                card.className = 'upgrade-card-ui';
                const currentCount = this.gameState.appliedUpgradeIds.filter(id => id === u.id).length;
                const stackLabel = u.maxStack ? `${currentCount} / ${u.maxStack}` : `${currentCount} / ∞`;

                card.innerHTML = `
                    <div style="flex:1;">
                        <span style="font-size: 0.75em; color: #888; float: right;">持有: ${stackLabel}</span>
                        <h3 style="margin-top:0; color:var(--color-primary-purple); font-size:1.1em;">${u.name}</h3>
                        <p style="font-size:0.9em; color:#666; margin-bottom: 0;">${u.desc}</p>
                    </div>
                `;

                // Banish Button
                if (this.gameState.banishCurrent > 0) {
                    const bBtn = document.createElement('button');
                    bBtn.className = 'banish-btn';
                    bBtn.innerHTML = '×';
                    bBtn.title = `移除此卡 (剩餘 ${this.gameState.banishCurrent})`;
                    bBtn.onclick = (e) => {
                        e.stopPropagation();
                        const oldBanishCount = this.gameState.banishCurrent;
                        if (this.gameState.banishUpgrade(u.id)) {
                            card.style.opacity = '0.3';
                            card.style.pointerEvents = 'none';
                            bBtn.remove();

                            // Update UI counter
                            banishInfo.innerText = `剩餘移除: ${this.gameState.banishCurrent}`;

                            // If charges reached 0, remove other cards' banish buttons
                            if (this.gameState.banishCurrent <= 0) {
                                cardsDiv.querySelectorAll('.banish-btn').forEach(b => b.remove());
                            } else {
                                // Update title for others
                                cardsDiv.querySelectorAll('.banish-btn').forEach(b => {
                                    b.title = `移除此卡 (剩餘 ${this.gameState.banishCurrent})`;
                                });
                            }
                        }
                    };
                    card.appendChild(bBtn);
                }

                card.onclick = () => {
                    this.gameState.applyUpgrade(u.id);
                    this.showStore();
                };

                cardsDiv.appendChild(card);
            });
        };

        rrBtn.onclick = () => {
            const nextList = this.gameState.rerollUpgrades();
            if (nextList) {
                renderCards(nextList);
                rrBtn.innerText = `重骰 (剩餘 ${this.gameState.rerollCurrent})`;
                banishInfo.innerText = `剩餘移除: ${this.gameState.banishCurrent}`;
                if (this.gameState.rerollCurrent <= 0) rrBtn.disabled = true;
            }
        };

        renderCards(upgrades);

        footerDiv.appendChild(banishInfo);
        footerDiv.appendChild(rrBtn);
        container.appendChild(cardsDiv);

        // Skip Button Logic (Scheme C: $200 * Day)
        const skipDiv = document.createElement('div');
        skipDiv.style.marginTop = '20px';
        skipDiv.style.width = '100%';
        skipDiv.style.textAlign = 'center';

        const skipReward = 50 * (this.gameState.day - 1 || 1);

        const skipBtn = document.createElement('button');
        skipBtn.id = 'skip-reward-btn';
        skipBtn.className = 'btn-secondary';
        skipBtn.innerHTML = `⏩ 跳過獎勵並獲得 <span style="color:gold; font-weight:bold;">$${skipReward}</span> 補償`;
        skipBtn.title = `當前補償金 = $50 * 當前天數 (${this.gameState.day - 1})`;

        let confirmState = false;
        let resetTimer = null;

        skipBtn.onclick = () => {
            if (!confirmState) {
                // First Click: Enter Confirm State
                confirmState = true;
                skipBtn.innerHTML = `⚠️ 確定放棄強化？ (再次點擊領取 $${skipReward})`;
                skipBtn.style.backgroundColor = '#e74c3c'; // Red warning color
                skipBtn.style.color = 'white';

                // Auto reset if not clicked within 3s
                resetTimer = setTimeout(() => {
                    confirmState = false;
                    skipBtn.innerHTML = `⏩ 跳過獎勵並獲得 <span style="color:gold; font-weight:bold;">$${skipReward}</span> 補償`;
                    skipBtn.style.backgroundColor = ''; // Revert to CSS default
                    skipBtn.style.color = '';
                }, 3000);
            } else {
                // Second Click: Execute
                if (resetTimer) clearTimeout(resetTimer);
                this.gameState.skipReward();

                // Force HUD update to show new gold
                this.updateHUD({
                    day: this.gameState.day,
                    gold: this.gameState.gold,
                    rentDay: Math.ceil(this.gameState.day / 7) * 7,
                    rentAmount: this.gameState.currentRent,
                    victoryGoal: this.gameState.victoryGoldGoal
                });

                // Redirect to Store instead of starting immediately
                this.showStore("已領取跳過補償。整備完成後請開始下一日。");
            }
        };

        skipDiv.appendChild(skipBtn);
        container.appendChild(skipDiv);

        container.appendChild(footerDiv);
        this.dom.modalContent.appendChild(container);
    }

    showStore(msg = "使用賺取的金幣進行擴建或準備。", isError = false) {
        this.showOverlay("整備商店", msg, "開始下一日營業", () => {
            this.hideOverlay();

            // Check for Daily Event
            let event = null;
            if (this.gameState.triggerDailyEvent) {
                event = this.gameState.triggerDailyEvent(this.gameState.day);
            }

            if (event) {
                this.showEventModal(event, () => {
                    this.hideOverlay();
                    this.gameState.startGame();
                });
            } else {
                this.gameState.startGame();
            }
        });

        // If it's an error, highlight it
        const msgEl = this.dom.modalContent.querySelector('#modal-message');
        if (msgEl) {
            if (isError) {
                msgEl.style.color = 'var(--color-accent-pink)';
                msgEl.style.fontWeight = 'bold';
            } else {
                msgEl.style.color = '';
                msgEl.style.fontWeight = '';
            }
        }

        const container = document.createElement('div');
        container.className = 'special-content store-container';

        this.gameState.storeItems.forEach(item => {
            const purchaseCount = this.gameState.purchasedStoreItems[item.id] || 0;
            if (item.limit && purchaseCount >= item.limit) return; // Skip if sold out

            // [FIX] Dynamic limit for tables: Skip if no more tables to unlock
            if (item.id === 'STORE_TABLE') {
                const hasLockedTables = this.gameState.tables.some(t => !t.unlocked);
                if (!hasLockedTables) return;
            }

            const price = item.priceMultiplier ?
                Math.floor(item.price * Math.pow(item.priceMultiplier, purchaseCount)) :
                item.price;

            const card = document.createElement('div');
            card.className = 'store-item-ui';

            // Show level if it's repeatable or infrastructure
            let levelLabel = '';
            if (item.type === 'MAID_TRAINING' || item.type === 'FIXED_FACILITY' || item.priceMultiplier) {
                levelLabel = `<span style="font-size:0.8em; color:var(--color-accent-pink); margin-left:5px;">[Lv. ${purchaseCount}]</span>`;
            }

            card.innerHTML = `
                <div>
                    <h3 style="margin-top:0; color:var(--color-primary-purple); font-size:1.1em;">${item.name}${levelLabel}</h3>
                    <p style="font-size:0.85em; color:#666; margin:5px 0;">${item.desc}</p>
                </div>
                <div class="price-tag">$${price}</div>
            `;


            card.onclick = () => {
                const result = this.gameState.buyFromStore(item.id);
                if (result.success) {
                    this.updateHUD({
                        gold: this.gameState.gold
                    });
                    this.showStore("購買成功！");
                } else {
                    const trans = {
                        'INSUFFICIENT_GOLD': '金幣不足！趕快去招呼客人賺錢吧。',
                        'LIMIT_REACHED': '已達到此項目的購買上限囉。',
                        'ITEM_NOT_FOUND': '找不到該商品。'
                    };
                    const msg = trans[result.reason] || `購買失敗: ${result.reason}`;
                    this.showStore(msg, true);
                }
            };

            container.appendChild(card);
        });

        this.dom.modalContent.appendChild(container);
    }

    // NOTE: hideOverlay, hideMaidList, showMaidList -> ViewOverlays.js
    // NOTE: renderTrash -> ViewEntities.js
}
