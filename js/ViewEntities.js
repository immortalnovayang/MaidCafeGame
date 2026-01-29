/**
 * ViewEntities.js - Rendering logic for game entities (customers, maids, trash)
 * Extends the View class with entity rendering methods.
 */

// Add entity rendering methods to View prototype
View.prototype.renderQueue = function (queue) {
    const currentIds = new Set();

    queue.forEach((c, index) => {
        currentIds.add(c.id);
        let el = this.customerElements[c.id];

        if (!el) {
            el = document.createElement('div');
            el.className = 'customer-entity queueing';
            el.innerHTML = `
                <div class="bar-container"><div class="bar-fill patience-bar"></div></div>
                <div class="emoji"></div>
                <div class="queue-number"></div>
            `;
            this.dom.gameArea.appendChild(el);
            this.customerElements[c.id] = el;
        }

        el.style.left = `${c.x}px`;
        el.style.top = `${c.y}px`;
        el.querySelector('.emoji').innerText = c.emoji;

        const bar = el.querySelector('.bar-fill');
        if (bar) {
            const pct = Math.max(0, (c.patience / c.maxPatience) * 100);
            bar.style.width = `${pct}%`;
            bar.style.backgroundColor = pct < 30 ? '#e74c3c' : '#3498db';
        }

        const queueNum = el.querySelector('.queue-number');
        if (queueNum) {
            queueNum.innerText = `#${index + 1}`;
        }
    });
};

View.prototype.renderCustomers = function (customers) {
    const currentIds = new Set();

    customers.forEach(c => {
        currentIds.add(c.id);
        let el = this.customerElements[c.id];

        if (!el || !el.querySelector('.status-icon')) {
            if (el) el.remove();
            el = document.createElement('div');
            el.className = 'customer-entity';
            el.innerHTML = `
                <div class="bar-container"><div class="bar-fill"></div></div>
                <div class="emoji"></div>
                <div class="status-icon"></div>
                <div class="status-text"></div>
            `;
            this.dom.gameArea.appendChild(el);
            this.customerElements[c.id] = el;
        }

        el.style.left = `${c.x}px`;
        el.style.top = `${c.y}px`;

        const emojiEl = el.querySelector('.emoji');
        const statusIconEl = el.querySelector('.status-icon');
        const statusTextEl = el.querySelector('.status-text');
        const barEl = el.querySelector('.bar-fill');

        if (emojiEl) emojiEl.innerText = c.emoji;
        if (statusIconEl) statusIconEl.innerText = this.getStatusIcon(c.state);
        if (statusTextEl) statusTextEl.innerText = c.state;

        if (barEl) {
            const pct = Math.max(0, (c.patience / c.maxPatience) * 100);
            barEl.style.width = `${pct}%`;
            barEl.style.backgroundColor = pct < 30 ? '#e74c3c' : '#3498db';
            barEl.parentElement.style.visibility = (c.state === 'ENTERING' || c.state === 'LEAVING') ? 'hidden' : 'visible';
        }
    });

    Object.keys(this.customerElements).forEach(id => {
        if (!currentIds.has(Number(id)) && !currentIds.has(String(id))) {
            this.customerElements[id].remove();
            delete this.customerElements[id];
        }
    });
};

View.prototype.renderMaidsEntities = function (maids) {
    const currentIds = new Set();

    maids.forEach(m => {
        currentIds.add(m.id);
        let el = this.maidElements[m.id];

        if (!el) {
            el = document.createElement('div');
            el.className = 'maid-entity';
            el.innerHTML = `
                <div class="bar-container"><div class="bar-fill"></div></div>
                <div class="emoji"></div>
                <div class="maid-name-tag"></div>
            `;
            this.dom.gameArea.appendChild(el);
            this.maidElements[m.id] = el;
        }

        el.style.left = `${m.x}px`;
        el.style.top = `${m.y}px`;
        el.querySelector('.emoji').innerText = m.emoji;
        const nameTag = el.querySelector('.maid-name-tag');
        if (nameTag) nameTag.innerText = m.name;

        const bar = el.querySelector('.bar-fill');
        const pct = Math.max(0, (m.stamina / m.maxStamina) * 100);
        bar.style.width = `${pct}%`;
        bar.style.backgroundColor = m.stamina <= 0 ? '#95a5a6' : '#f1c40f';
    });

    Object.keys(this.maidElements).forEach(id => {
        if (!currentIds.has(Number(id)) && !currentIds.has(String(id))) {
            if (this.maidElements[id]) this.maidElements[id].remove();
            delete this.maidElements[id];
        }
    });
};

View.prototype.renderTrash = function (trashList) {
    const currentIds = new Set();

    trashList.forEach(t => {
        currentIds.add(t.id);
        let el = this.trashElements[t.id];

        if (!el) {
            el = document.createElement('div');
            el.className = 'trash-entity';
            el.innerText = t.emoji;
            el.style.position = 'absolute';
            el.style.fontSize = '24px';
            el.style.zIndex = '5';
            this.dom.gameArea.appendChild(el);
            this.trashElements[t.id] = el;
        }

        el.style.left = `${t.x}px`;
        el.style.top = `${t.y}px`;
    });

    Object.keys(this.trashElements).forEach(id => {
        if (!currentIds.has(Number(id)) && !currentIds.has(String(id))) {
            if (this.trashElements[id]) this.trashElements[id].remove();
            delete this.trashElements[id];
        }
    });
};

View.prototype.getStatusIcon = function (state) {
    switch (state) {
        case 'SEATED': return '';
        case 'ORDERING': return '❕';
        case 'WAITING_FOOD': return '';
        case 'EATING': return '';
        case 'PAYING': return '💵';
        default: return '';
    }
};
