const GameStateCustomers = {
    spawnCustomer() {
        const balance = this.balance.queue;
        const maxQueue = (balance.maxSize || 10) + (this.maxQueueSizeBonus || 0);

        // Don't spawn if queue is full
        if (this.queue.length >= maxQueue) {
            console.log("Queue is full! Customer left.");
            return;
        }

        const id = Date.now();
        const customer = new Customer(id);

        // Set exit position (below door, for leaving)
        customer.exitPos = {
            x: this.doorPos.x,
            y: this.doorPos.y + 120
        };

        // Set initial spawn position
        customer.x = this.doorPos.x;
        customer.y = this.doorPos.y + 120;
        customer.targetX = this.doorPos.x;
        customer.targetY = this.doorPos.y;

        // Find empty table or add to queue
        const table = this.tables.find(t => t.isAvailable());
        if (table && this.queue.length === 0) {
            if (table.occupy(customer)) {
                customer.assignTable(table);
                this.customers.push(customer);
                console.log(`Customer ${id} spawned at Table ${table.id}`);
            }
        } else {
            // Add to queue
            customer.state = 'QUEUEING';
            customer.queueIndex = this.queue.length;

            const queueSpacing = balance.spacing || 45;
            const queueCenterX = this.doorPos.x;

            // Two rows layout
            const row = Math.floor(customer.queueIndex / 5);
            const col = customer.queueIndex % 5;

            customer.x = queueCenterX + (col - 2) * queueSpacing;
            customer.y = this.queueStartPos.y + (row * 40);

            customer.targetX = customer.x;
            customer.targetY = customer.y;
            customer.emoji = "🧍";
            this.queue.push(customer);
            console.log(`Customer ${id} added to Queue at index ${customer.queueIndex}`);
        }
        this.notify('customer_spawned', { customer });
    },

    updateQueuePositions() {
        const balance = this.balance.queue;
        const queueSpacing = balance.spacing || 45;
        const queueCenterX = this.doorPos.x;

        this.queue.forEach((customer, index) => {
            customer.queueIndex = index;
            const row = Math.floor(index / 5);
            const col = index % 5;

            customer.targetX = queueCenterX + (col - 2) * queueSpacing;
            customer.targetY = this.queueStartPos.y + (row * 40);
            customer.state = 'QUEUEING';
        });
    },

    checkQueue() {
        if (this.queue.length === 0) return;

        // Find available tables
        const availableTables = this.tables.filter(t => t.isAvailable());
        if (availableTables.length === 0) return;

        // Move customers from queue to tables
        let tableIdx = 0;
        while (this.queue.length > 0 && tableIdx < availableTables.length) {
            const customer = this.queue[0];
            const table = availableTables[tableIdx];

            if (table.occupy(customer)) {
                this.queue.shift(); // Remove from queue
                customer.assignTable(table);
                this.customers.push(customer);

                // [VIP Couch] If active (queuePatienceMod < 1.0), grant +1 Reputation per seated queue customer
                if (this.queuePatienceMod && this.queuePatienceMod < 1.0) {
                    // Check daily cap? No, let it flow.
                    this.reputation += 1;
                    this.notify('special_event', { text: `VIP入座! 名聲 +1`, x: customer.x, y: customer.y, color: '#e67e22' });
                }

                tableIdx++;
            } else {
                break;
            }
        }

        if (tableIdx > 0) {
            this.updateQueuePositions();
        }
    },

    healAllCustomers(amount) {
        const healAmt = amount || this.balance.queue.patienceHeal || 20;
        this.customers.forEach(c => {
            c.patience = Math.min(c.maxPatience, c.patience + healAmt);
            c.emoji = "💖";
        });
        this.queue.forEach(c => {
            c.patience = Math.min(c.maxPatience, c.patience + healAmt);
            c.emoji = "💖";
        });
        console.log(`Healed all customers by ${healAmt}`);
    },

    spawnTrash(x, y) {
        const id = Date.now() + Math.random();
        const t = new Trash(id, x, y);
        this.trash.push(t);
        this.notify('entities_update', { trash: this.trash });
        return t;
    },

    removeTrash(id) {
        const index = this.trash.findIndex(t => t.id === id);
        if (index !== -1) {
            this.trash.splice(index, 1);
            this.notify('entities_update', { trash: this.trash });
        }
    },

    getAutomationEfficiency() {
        let efficiency = 1.0;
        const potBonus = this.balance.automation.potEfficiencyBonus || 0.5;
        if (this.maids.some(m => m.skillId === 'skill_pot')) {
            efficiency += potBonus;
        }
        return efficiency;
    }
};
