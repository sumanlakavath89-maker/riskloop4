/**
 * DatabaseService
 * SQLite persistence layer using Node.js built-in node:sqlite (Node 22+).
 *
 * Stores: orders, trades (broker-confirmed executions only),
 *         positions, holdings.
 *
 * SECURITY:  No API keys, tokens, passwords or secrets are stored here.
 *            Only trading data is persisted.
 *
 * TRADE RULE: A row in `trades` represents a broker-confirmed fill only.
 *             An entry in `orders` is never automatically promoted to a trade.
 *             The UNIQUE constraint on (broker_id, broker_trade_id) in `trades`
 *             enforces duplicate-execution prevention at the database level.
 */

import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Database file lives at backend/data/riskloop.db
const DATA_DIR = join(__dirname, '..', '..', 'data');
const DB_PATH  = join(DATA_DIR, 'riskloop.db');

class DatabaseService {
  constructor() {
    this.db = null;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  /**
   * Open the database file and apply the full schema.
   * Safe to call multiple times (idempotent CREATE IF NOT EXISTS).
   */
  initialize() {
    if (this.db) return; // already open

    // Ensure the data directory exists
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }

    this.db = new DatabaseSync(DB_PATH);

    // WAL mode for better concurrent read performance
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');

    this._applySchema();

    console.log(`[DatabaseService] Opened database at ${DB_PATH}`);
  }

  /** Close the database (called on graceful shutdown). */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      console.log('[DatabaseService] Database closed.');
    }
  }

  // ── Schema ───────────────────────────────────────────────────────────────

  _applySchema() {
    // ── orders ──────────────────────────────────────────────────────────
    // An order is placed but NOT a trade until the broker confirms a fill.
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS orders (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        broker_id           TEXT    NOT NULL,
        broker_order_id     TEXT    NOT NULL,
        symbol              TEXT    NOT NULL,
        exchange            TEXT    NOT NULL DEFAULT '',
        segment             TEXT    NOT NULL DEFAULT '',
        product             TEXT    NOT NULL DEFAULT '',
        order_type          TEXT    NOT NULL DEFAULT '',
        transaction_type    TEXT    NOT NULL DEFAULT '',
        quantity            INTEGER NOT NULL DEFAULT 0,
        filled_quantity     INTEGER NOT NULL DEFAULT 0,
        pending_quantity    INTEGER NOT NULL DEFAULT 0,
        cancelled_quantity  INTEGER NOT NULL DEFAULT 0,
        price               REAL    NOT NULL DEFAULT 0,
        trigger_price       REAL    NOT NULL DEFAULT 0,
        average_price       REAL    NOT NULL DEFAULT 0,
        status              TEXT    NOT NULL DEFAULT 'PENDING',
        status_message      TEXT    NOT NULL DEFAULT '',
        validity            TEXT    NOT NULL DEFAULT 'DAY',
        variety             TEXT    NOT NULL DEFAULT 'NORMAL',
        order_timestamp     TEXT    NOT NULL DEFAULT '',
        update_timestamp    TEXT    NOT NULL DEFAULT '',
        raw_json            TEXT    NOT NULL DEFAULT '{}',
        created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
        updated_at          TEXT    NOT NULL DEFAULT (datetime('now')),

        -- One broker_order_id per broker — prevents double-insert
        UNIQUE (broker_id, broker_order_id)
      );
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_orders_broker
        ON orders (broker_id, status);
    `);

    // ── trades ───────────────────────────────────────────────────────────
    // A trade row = ONE broker-confirmed fill/execution.
    // Partial fills create multiple rows all referencing the same broker_order_id.
    // UNIQUE (broker_id, broker_trade_id) is the hard duplicate-prevention guard.
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS trades (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        broker_id           TEXT    NOT NULL,
        broker_trade_id     TEXT    NOT NULL,   -- broker's fill/execution ID
        broker_order_id     TEXT    NOT NULL,   -- parent order ID
        symbol              TEXT    NOT NULL,
        exchange            TEXT    NOT NULL DEFAULT '',
        segment             TEXT    NOT NULL DEFAULT '',
        product             TEXT    NOT NULL DEFAULT '',
        instrument_type     TEXT    NOT NULL DEFAULT '',
        transaction_type    TEXT    NOT NULL DEFAULT '',
        quantity            INTEGER NOT NULL DEFAULT 0,
        price               REAL    NOT NULL DEFAULT 0,
        trade_value         REAL    NOT NULL DEFAULT 0,
        is_partial_fill     INTEGER NOT NULL DEFAULT 0,  -- 0=false 1=true
        trade_date          TEXT    NOT NULL DEFAULT '',
        trade_time          TEXT    NOT NULL DEFAULT '',
        trade_timestamp     TEXT    NOT NULL DEFAULT '',
        raw_json            TEXT    NOT NULL DEFAULT '{}',
        created_at          TEXT    NOT NULL DEFAULT (datetime('now')),

        -- Core duplicate-prevention constraint
        UNIQUE (broker_id, broker_trade_id)
      );
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_trades_broker
        ON trades (broker_id, broker_order_id);
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_trades_date
        ON trades (broker_id, trade_date);
    `);

    // ── positions ────────────────────────────────────────────────────────
    // Snapshot from broker — refreshed on every sync.
    // One row per (broker_id, symbol, product).
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS positions (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        broker_id        TEXT    NOT NULL,
        symbol           TEXT    NOT NULL,
        exchange         TEXT    NOT NULL DEFAULT '',
        product          TEXT    NOT NULL DEFAULT '',
        quantity         INTEGER NOT NULL DEFAULT 0,
        overnight_qty    INTEGER NOT NULL DEFAULT 0,
        average_price    REAL    NOT NULL DEFAULT 0,
        ltp              REAL    NOT NULL DEFAULT 0,
        pnl              REAL    NOT NULL DEFAULT 0,
        realised_pnl     REAL    NOT NULL DEFAULT 0,
        unrealised_pnl   REAL    NOT NULL DEFAULT 0,
        raw_json         TEXT    NOT NULL DEFAULT '{}',
        updated_at       TEXT    NOT NULL DEFAULT (datetime('now')),

        UNIQUE (broker_id, symbol, product)
      );
    `);

    // ── holdings ─────────────────────────────────────────────────────────
    // Long-term delivery holdings — refreshed on every sync.
    // One row per (broker_id, symbol).
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS holdings (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        broker_id        TEXT    NOT NULL,
        symbol           TEXT    NOT NULL,
        exchange         TEXT    NOT NULL DEFAULT '',
        quantity         INTEGER NOT NULL DEFAULT 0,
        average_price    REAL    NOT NULL DEFAULT 0,
        ltp              REAL    NOT NULL DEFAULT 0,
        pnl              REAL    NOT NULL DEFAULT 0,
        raw_json         TEXT    NOT NULL DEFAULT '{}',
        updated_at       TEXT    NOT NULL DEFAULT (datetime('now')),

        UNIQUE (broker_id, symbol)
      );
    `);

    // ── market_comments ───────────────────────────────────────────────────
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS market_comments (
        id                TEXT PRIMARY KEY,
        user_id           TEXT NOT NULL,
        username          TEXT NOT NULL,
        user_avatar       TEXT NOT NULL DEFAULT '',
        is_pro            INTEGER NOT NULL DEFAULT 0,
        content           TEXT NOT NULL,
        sentiment         TEXT NOT NULL DEFAULT 'bullish',
        timestamp         TEXT NOT NULL,
        likes             INTEGER NOT NULL DEFAULT 0,
        dislikes          INTEGER NOT NULL DEFAULT 0,
        parent_id         TEXT DEFAULT NULL,
        is_edited         INTEGER NOT NULL DEFAULT 0,
        edited_at         TEXT DEFAULT NULL,
        is_reported       INTEGER NOT NULL DEFAULT 0,
        report_count      INTEGER NOT NULL DEFAULT 0,
        liked_by          TEXT NOT NULL DEFAULT '[]',
        disliked_by       TEXT NOT NULL DEFAULT '[]',
        created_at        TEXT NOT NULL DEFAULT (datetime('now')),
        
        FOREIGN KEY (parent_id) REFERENCES market_comments(id) ON DELETE CASCADE
      );
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_comments_timestamp
        ON market_comments (timestamp DESC);
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_comments_likes
        ON market_comments (likes DESC);
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_comments_parent
        ON market_comments (parent_id);
    `);

    // ── support_tickets ───────────────────────────────────────────────────
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS support_tickets (
        id               TEXT PRIMARY KEY,
        ticket_number    TEXT UNIQUE NOT NULL,
        user_id          TEXT DEFAULT NULL,
        email            TEXT NOT NULL,
        user_email       TEXT DEFAULT NULL,
        user_name        TEXT DEFAULT 'Trader',
        subject          TEXT DEFAULT 'Support Request',
        category         TEXT NOT NULL,
        description      TEXT NOT NULL,
        attachments      TEXT NOT NULL DEFAULT '[]',
        status           TEXT NOT NULL DEFAULT 'open',
        priority         TEXT NOT NULL DEFAULT 'medium',
        assigned_agent   TEXT DEFAULT 'RiskLoop Support Team',
        created_at       TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // Safe column migrations if table already existed
    const ticketCols = ['user_email', 'user_name', 'subject', 'assigned_agent'];
    for (const col of ticketCols) {
      try { this.db.exec(`ALTER TABLE support_tickets ADD COLUMN ${col} TEXT DEFAULT NULL;`); } catch (_) {}
    }

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id
        ON support_tickets (user_id);
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_support_tickets_ticket_number
        ON support_tickets (ticket_number);
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_support_tickets_status
        ON support_tickets (status);
    `);

    // ── support_ticket_messages ───────────────────────────────────────────
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS support_ticket_messages (
        id               TEXT PRIMARY KEY,
        ticket_id        TEXT NOT NULL,
        sender_id        TEXT DEFAULT NULL,
        sender_role      TEXT NOT NULL DEFAULT 'user',
        sender_type      TEXT NOT NULL DEFAULT 'user',
        sender_name      TEXT NOT NULL DEFAULT 'User',
        message          TEXT NOT NULL,
        attachments      TEXT NOT NULL DEFAULT '[]',
        created_at       TEXT NOT NULL DEFAULT (datetime('now')),

        FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE
      );
    `);

    const msgCols = ['sender_type', 'sender_name'];
    for (const col of msgCols) {
      try { this.db.exec(`ALTER TABLE support_ticket_messages ADD COLUMN ${col} TEXT DEFAULT NULL;`); } catch (_) {}
    }

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_support_messages_ticket_id
        ON support_ticket_messages (ticket_id);
    `);

    // ── ai_training_samples ───────────────────────────────────────────────
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ai_training_samples (
        id                     TEXT PRIMARY KEY,
        user_id                TEXT DEFAULT NULL,
        trade_id               TEXT DEFAULT NULL,
        market                 TEXT NOT NULL DEFAULT 'indian',
        source                 TEXT NOT NULL DEFAULT 'client_ocr',
        image_hash             TEXT DEFAULT NULL,
        image_name             TEXT DEFAULT NULL,
        raw_prediction         TEXT NOT NULL,
        confidence_scores      TEXT NOT NULL,
        user_corrected_values  TEXT NOT NULL,
        final_saved_values     TEXT NOT NULL,
        field_accuracy         TEXT NOT NULL,
        overall_accuracy_pct   REAL NOT NULL DEFAULT 100.0,
        verification_status    TEXT NOT NULL DEFAULT 'USER_EDITED',
        user_reviewed          INTEGER NOT NULL DEFAULT 1,
        edited_fields          TEXT NOT NULL DEFAULT '[]',
        is_training_ready      INTEGER NOT NULL DEFAULT 1,
        quality_score          REAL NOT NULL DEFAULT 100.0,
        inconsistency_flags    TEXT NOT NULL DEFAULT '[]',
        created_at             TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // Schema migrations for quality columns
    const qualityCols = [
      { name: 'verification_status', type: "TEXT NOT NULL DEFAULT 'USER_EDITED'" },
      { name: 'user_reviewed', type: 'INTEGER NOT NULL DEFAULT 1' },
      { name: 'edited_fields', type: "TEXT NOT NULL DEFAULT '[]'" },
      { name: 'is_training_ready', type: 'INTEGER NOT NULL DEFAULT 1' },
      { name: 'quality_score', type: 'REAL NOT NULL DEFAULT 100.0' },
      { name: 'inconsistency_flags', type: "TEXT NOT NULL DEFAULT '[]'" }
    ];
    for (const col of qualityCols) {
      try { this.db.exec(`ALTER TABLE ai_training_samples ADD COLUMN ${col.name} ${col.type};`); } catch (_) {}
    }

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_ai_samples_created_at
        ON ai_training_samples (created_at DESC);
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_ai_samples_market
        ON ai_training_samples (market);
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_ai_samples_training_ready
        ON ai_training_samples (is_training_ready);
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_ai_samples_verification
        ON ai_training_samples (verification_status);
    `);

    // Immutable AI Dataset Versions Table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ai_dataset_versions (
        id                     TEXT PRIMARY KEY,
        version_tag            TEXT NOT NULL UNIQUE,
        name                   TEXT NOT NULL,
        description            TEXT NOT NULL DEFAULT '',
        sample_count           INTEGER NOT NULL DEFAULT 0,
        training_ready_count   INTEGER NOT NULL DEFAULT 0,
        quality_score          REAL NOT NULL DEFAULT 100.0,
        market_distribution    TEXT NOT NULL DEFAULT '{}',
        platform_distribution  TEXT NOT NULL DEFAULT '{}',
        field_completeness     TEXT NOT NULL DEFAULT '{}',
        dataset_hash           TEXT NOT NULL,
        sample_ids             TEXT NOT NULL DEFAULT '[]',
        is_frozen              INTEGER NOT NULL DEFAULT 1,
        created_by             TEXT NOT NULL DEFAULT 'admin',
        created_at             TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // AI Model Experiments Table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ai_model_experiments (
        id                     TEXT PRIMARY KEY,
        name                   TEXT NOT NULL,
        dataset_version_id     TEXT NOT NULL,
        model_architecture     TEXT NOT NULL,
        hyperparameters        TEXT NOT NULL DEFAULT '{}',
        overall_accuracy_pct   REAL NOT NULL,
        field_accuracies       TEXT NOT NULL DEFAULT '{}',
        latency_ms             INTEGER NOT NULL DEFAULT 350,
        is_baseline            INTEGER NOT NULL DEFAULT 0,
        is_candidate           INTEGER NOT NULL DEFAULT 0,
        status                 TEXT NOT NULL DEFAULT 'COMPLETED',
        notes                  TEXT NOT NULL DEFAULT '',
        created_at             TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_ai_versions_created_at
        ON ai_dataset_versions (created_at DESC);
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_ai_experiments_version
        ON ai_model_experiments (dataset_version_id);
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_ai_experiments_created_at
        ON ai_model_experiments (created_at DESC);
    `);

    // AI Model Staged Rollout Table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ai_model_rollouts (
        id                     TEXT PRIMARY KEY,
        model_id               TEXT NOT NULL,
        baseline_model_id      TEXT NOT NULL,
        rollout_status         TEXT NOT NULL DEFAULT 'STAGED_CANARY',
        traffic_percentage     INTEGER NOT NULL DEFAULT 10,
        safety_gate_passed     INTEGER NOT NULL DEFAULT 1,
        safety_gate_report     TEXT NOT NULL DEFAULT '{}',
        auto_rollback_enabled  INTEGER NOT NULL DEFAULT 1,
        rollback_reason        TEXT NOT NULL DEFAULT '',
        created_at             TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // AI Production Telemetry & Regression Monitoring Table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ai_production_telemetry (
        id                                TEXT PRIMARY KEY,
        rollout_id                        TEXT NOT NULL,
        model_id                          TEXT NOT NULL,
        traffic_count                     INTEGER NOT NULL DEFAULT 0,
        production_accuracy_pct           REAL NOT NULL DEFAULT 95.0,
        user_correction_rate_pct          REAL NOT NULL DEFAULT 5.0,
        critical_price_correction_rate_pct REAL NOT NULL DEFAULT 2.0,
        error_rate_pct                    REAL NOT NULL DEFAULT 0.0,
        avg_latency_ms                    INTEGER NOT NULL DEFAULT 280,
        health_status                     TEXT NOT NULL DEFAULT 'HEALTHY',
        last_evaluated_at                 TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_ai_rollouts_status
        ON ai_model_rollouts (rollout_status);
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_ai_telemetry_rollout
        ON ai_production_telemetry (rollout_id);
    `);

    // ── profiles ──────────────────────────────────────────────────────────
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS profiles (
        id                 TEXT PRIMARY KEY,
        email              TEXT UNIQUE NOT NULL,
        full_name          TEXT DEFAULT '',
        avatar_url         TEXT DEFAULT NULL,
        avatar_public_id   TEXT DEFAULT NULL,
        created_at         TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    try { this.db.exec(`ALTER TABLE profiles ADD COLUMN avatar_public_id TEXT DEFAULT NULL;`); } catch (_) {}

    // ── journal_trades ────────────────────────────────────────────────────
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS journal_trades (
        id                 TEXT PRIMARY KEY,
        user_id            TEXT NOT NULL,
        trade_date         TEXT NOT NULL DEFAULT (date('now')),
        symbol             TEXT NOT NULL,
        instrument_type    TEXT NOT NULL DEFAULT 'EQUITY',
        side               TEXT NOT NULL DEFAULT 'BUY',
        quantity           REAL NOT NULL DEFAULT 0,
        entry_price        REAL NOT NULL DEFAULT 0,
        exit_price         REAL DEFAULT NULL,
        stop_loss          REAL DEFAULT NULL,
        target_price       REAL DEFAULT NULL,
        broker             TEXT DEFAULT '',
        pnl                REAL DEFAULT 0,
        pnl_percentage     REAL DEFAULT 0,
        strategy_tag       TEXT DEFAULT '',
        psychology_rating  INTEGER DEFAULT 3,
        notes              TEXT DEFAULT '',
        images             TEXT NOT NULL DEFAULT '[]',
        created_at         TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    try { this.db.exec(`ALTER TABLE journal_trades ADD COLUMN images TEXT NOT NULL DEFAULT '[]';`); } catch (_) {}

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_journal_trades_user_id
        ON journal_trades (user_id);
    `);

    console.log('[DatabaseService] Schema applied.');
  }

  // ── Orders ───────────────────────────────────────────────────────────────

  /**
   * Upsert an order row.
   * INSERT OR REPLACE semantics: safe to call on every broker sync.
   */
  upsertOrder(brokerId, order) {
    const stmt = this.db.prepare(`
      INSERT INTO orders (
        broker_id, broker_order_id, symbol, exchange, segment, product,
        order_type, transaction_type, quantity, filled_quantity,
        pending_quantity, cancelled_quantity, price, trigger_price,
        average_price, status, status_message, validity, variety,
        order_timestamp, update_timestamp, raw_json, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, datetime('now')
      )
      ON CONFLICT (broker_id, broker_order_id) DO UPDATE SET
        filled_quantity    = excluded.filled_quantity,
        pending_quantity   = excluded.pending_quantity,
        cancelled_quantity = excluded.cancelled_quantity,
        average_price      = excluded.average_price,
        status             = excluded.status,
        status_message     = excluded.status_message,
        update_timestamp   = excluded.update_timestamp,
        raw_json           = excluded.raw_json,
        updated_at         = datetime('now')
    `);

    stmt.run(
      brokerId,
      order.orderId       || order.broker_order_id || '',
      order.symbol        || '',
      order.exchange      || '',
      order.segment       || '',
      order.product       || '',
      order.orderType     || order.order_type || '',
      order.transactionType || order.transaction_type || '',
      order.quantity      || 0,
      order.filledQuantity   || order.filled_quantity   || 0,
      order.pendingQuantity  || order.pending_quantity  || 0,
      order.cancelledQuantity || order.cancelled_quantity || 0,
      order.price         || 0,
      order.triggerPrice  || order.trigger_price || 0,
      order.averagePrice  || order.average_price || 0,
      order.status        || 'PENDING',
      order.statusMessage || order.status_message || '',
      order.validity      || 'DAY',
      order.variety       || 'NORMAL',
      order.orderTimestamp  || order.order_timestamp  || '',
      order.updateTimestamp || order.update_timestamp || '',
      JSON.stringify(order.metadata || order.raw_json || {})
    );
  }

  /** Save a batch of orders (wraps in a transaction for speed). */
  upsertOrders(brokerId, orders) {
    const tx = this.db.prepare('BEGIN');
    const commit = this.db.prepare('COMMIT');
    tx.run();
    try {
      for (const o of orders) {
        this.upsertOrder(brokerId, o);
      }
      commit.run();
    } catch (err) {
      this.db.prepare('ROLLBACK').run();
      throw err;
    }
  }

  /** Return all orders for a broker, newest first. */
  getOrders(brokerId) {
    return this.db
      .prepare('SELECT * FROM orders WHERE broker_id = ? ORDER BY created_at DESC')
      .all(brokerId)
      .map(r => this._rowToOrder(r));
  }

  /** Return orders by status. */
  getOrdersByStatus(brokerId, status) {
    return this.db
      .prepare('SELECT * FROM orders WHERE broker_id = ? AND status = ? ORDER BY created_at DESC')
      .all(brokerId, status)
      .map(r => this._rowToOrder(r));
  }

  // ── Trades ───────────────────────────────────────────────────────────────

  /**
   * Insert a confirmed execution as a trade.
   * Returns true if inserted, false if duplicate (already existed).
   *
   * IMPORTANT: only call this when the broker has confirmed execution.
   */
  insertTrade(brokerId, trade) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO trades (
          broker_id, broker_trade_id, broker_order_id, symbol, exchange,
          segment, product, instrument_type, transaction_type,
          quantity, price, trade_value, is_partial_fill,
          trade_date, trade_time, trade_timestamp, raw_json
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?
        )
      `);

      const tradeId    = trade.tradeId     || trade.broker_trade_id || '';
      const orderId    = trade.orderId     || trade.broker_order_id || '';
      const qty        = trade.quantity    || 0;
      const price      = trade.price       || trade.averagePrice || 0;
      const tradeValue = trade.tradeValue  || (qty * price);

      stmt.run(
        brokerId,
        tradeId,
        orderId,
        trade.symbol          || '',
        trade.exchange        || '',
        trade.segment         || '',
        trade.product         || '',
        trade.instrumentType  || trade.instrument_type || '',
        trade.transactionType || trade.transaction_type || trade.side || '',
        qty,
        price,
        tradeValue,
        trade.isPartialFill   || trade.is_partial_fill ? 1 : 0,
        trade.tradeDate       || trade.trade_date  || new Date().toISOString().split('T')[0],
        trade.tradeTime       || trade.trade_time  || new Date().toISOString().split('T')[1],
        trade.timestamp       || trade.trade_timestamp || new Date().toISOString(),
        JSON.stringify(trade.metadata || {})
      );

      return true; // new row inserted

    } catch (err) {
      // UNIQUE constraint violation = duplicate — silently ignore
      if (err.message && err.message.includes('UNIQUE constraint failed')) {
        console.log(`[DatabaseService] Duplicate trade ignored: ${brokerId}:${trade.tradeId || trade.broker_trade_id}`);
        return false;
      }
      throw err;
    }
  }

  /** Insert a batch of trades, returns { inserted, duplicates } counts. */
  insertTrades(brokerId, trades) {
    let inserted = 0;
    let duplicates = 0;

    const beginStmt  = this.db.prepare('BEGIN');
    const commitStmt = this.db.prepare('COMMIT');
    beginStmt.run();
    try {
      for (const t of trades) {
        const ok = this.insertTrade(brokerId, t);
        ok ? inserted++ : duplicates++;
      }
      commitStmt.run();
    } catch (err) {
      this.db.prepare('ROLLBACK').run();
      throw err;
    }

    return { inserted, duplicates };
  }

  /** Return all trades for a broker, newest first. */
  getTrades(brokerId) {
    return this.db
      .prepare('SELECT * FROM trades WHERE broker_id = ? ORDER BY trade_timestamp DESC')
      .all(brokerId)
      .map(r => this._rowToTrade(r));
  }

  /** Return trades for a specific order. */
  getTradesByOrder(brokerId, brokerOrderId) {
    return this.db
      .prepare('SELECT * FROM trades WHERE broker_id = ? AND broker_order_id = ? ORDER BY trade_timestamp ASC')
      .all(brokerId, brokerOrderId)
      .map(r => this._rowToTrade(r));
  }

  /** Return trades for today only (trade_date = local YYYY-MM-DD). */
  getTradesToday(brokerId) {
    const today = new Date().toISOString().split('T')[0];
    return this.db
      .prepare('SELECT * FROM trades WHERE broker_id = ? AND trade_date = ? ORDER BY trade_timestamp ASC')
      .all(brokerId, today)
      .map(r => this._rowToTrade(r));
  }

  /** Check if a broker_trade_id already exists (fast duplicate check). */
  tradeExists(brokerId, brokerTradeId) {
    const row = this.db
      .prepare('SELECT 1 FROM trades WHERE broker_id = ? AND broker_trade_id = ? LIMIT 1')
      .get(brokerId, brokerTradeId);
    return row !== undefined;
  }

  // ── Positions ────────────────────────────────────────────────────────────

  /** Replace all positions for a broker in one transaction. */
  replacePositions(brokerId, positions) {
    const beginStmt  = this.db.prepare('BEGIN');
    const commitStmt = this.db.prepare('COMMIT');
    const deleteStmt = this.db.prepare('DELETE FROM positions WHERE broker_id = ?');

    beginStmt.run();
    try {
      deleteStmt.run(brokerId);
      for (const p of positions) {
        this._upsertPosition(brokerId, p);
      }
      commitStmt.run();
    } catch (err) {
      this.db.prepare('ROLLBACK').run();
      throw err;
    }
  }

  _upsertPosition(brokerId, pos) {
    this.db.prepare(`
      INSERT INTO positions (
        broker_id, symbol, exchange, product,
        quantity, overnight_qty, average_price, ltp,
        pnl, realised_pnl, unrealised_pnl, raw_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT (broker_id, symbol, product) DO UPDATE SET
        quantity        = excluded.quantity,
        overnight_qty   = excluded.overnight_qty,
        average_price   = excluded.average_price,
        ltp             = excluded.ltp,
        pnl             = excluded.pnl,
        realised_pnl    = excluded.realised_pnl,
        unrealised_pnl  = excluded.unrealised_pnl,
        raw_json        = excluded.raw_json,
        updated_at      = datetime('now')
    `).run(
      brokerId,
      pos.symbol        || '',
      pos.exchange      || '',
      pos.product       || '',
      pos.quantity      || 0,
      pos.overnightQuantity || pos.overnight_qty || 0,
      pos.averagePrice  || pos.average_price || 0,
      pos.ltp           || 0,
      pos.pnl           || 0,
      pos.realisedPnl   || pos.realised_pnl   || 0,
      pos.unrealisedPnl || pos.unrealised_pnl || 0,
      JSON.stringify(pos.metadata || {})
    );
  }

  getPositions(brokerId) {
    return this.db
      .prepare('SELECT * FROM positions WHERE broker_id = ? ORDER BY symbol ASC')
      .all(brokerId)
      .map(r => this._rowToPosition(r));
  }

  // ── Holdings ─────────────────────────────────────────────────────────────

  /** Replace all holdings for a broker in one transaction. */
  replaceHoldings(brokerId, holdings) {
    const beginStmt  = this.db.prepare('BEGIN');
    const commitStmt = this.db.prepare('COMMIT');
    const deleteStmt = this.db.prepare('DELETE FROM holdings WHERE broker_id = ?');

    beginStmt.run();
    try {
      deleteStmt.run(brokerId);
      for (const h of holdings) {
        this._upsertHolding(brokerId, h);
      }
      commitStmt.run();
    } catch (err) {
      this.db.prepare('ROLLBACK').run();
      throw err;
    }
  }

  _upsertHolding(brokerId, holding) {
    this.db.prepare(`
      INSERT INTO holdings (
        broker_id, symbol, exchange, quantity,
        average_price, ltp, pnl, raw_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT (broker_id, symbol) DO UPDATE SET
        quantity      = excluded.quantity,
        average_price = excluded.average_price,
        ltp           = excluded.ltp,
        pnl           = excluded.pnl,
        raw_json      = excluded.raw_json,
        updated_at    = datetime('now')
    `).run(
      brokerId,
      holding.symbol        || '',
      holding.exchange      || '',
      holding.quantity      || 0,
      holding.averagePrice  || holding.average_price || 0,
      holding.ltp           || 0,
      holding.pnl           || 0,
      JSON.stringify(holding.metadata || {})
    );
  }

  getHoldings(brokerId) {
    return this.db
      .prepare('SELECT * FROM holdings WHERE broker_id = ? ORDER BY symbol ASC')
      .all(brokerId)
      .map(r => this._rowToHolding(r));
  }

  // ── Row mappers ──────────────────────────────────────────────────────────

  _rowToOrder(r) {
    let meta = {};
    try { meta = JSON.parse(r.raw_json); } catch (_) {}
    return {
      orderId:           r.broker_order_id,
      symbol:            r.symbol,
      exchange:          r.exchange,
      segment:           r.segment,
      product:           r.product,
      orderType:         r.order_type,
      transactionType:   r.transaction_type,
      side:              r.transaction_type,
      quantity:          r.quantity,
      filledQuantity:    r.filled_quantity,
      pendingQuantity:   r.pending_quantity,
      cancelledQuantity: r.cancelled_quantity,
      price:             r.price,
      triggerPrice:      r.trigger_price,
      averagePrice:      r.average_price,
      status:            r.status,
      statusMessage:     r.status_message,
      validity:          r.validity,
      variety:           r.variety,
      orderTimestamp:    r.order_timestamp,
      updateTimestamp:   r.update_timestamp,
      metadata:          meta,
      _dbId:             r.id,
      _source:           'db',
    };
  }

  _rowToTrade(r) {
    let meta = {};
    try { meta = JSON.parse(r.raw_json); } catch (_) {}
    return {
      tradeId:         r.broker_trade_id,
      orderId:         r.broker_order_id,
      symbol:          r.symbol,
      exchange:        r.exchange,
      segment:         r.segment,
      product:         r.product,
      instrumentType:  r.instrument_type,
      transactionType: r.transaction_type,
      side:            r.transaction_type,
      quantity:        r.quantity,
      price:           r.price,
      tradeValue:      r.trade_value,
      isPartialFill:   r.is_partial_fill === 1,
      tradeDate:       r.trade_date,
      tradeTime:       r.trade_time,
      timestamp:       r.trade_timestamp,
      time:            r.trade_time,
      metadata:        meta,
      _dbId:           r.id,
      _source:         'db',
    };
  }

  _rowToPosition(r) {
    let meta = {};
    try { meta = JSON.parse(r.raw_json); } catch (_) {}
    return {
      symbol:           r.symbol,
      exchange:         r.exchange,
      product:          r.product,
      quantity:         r.quantity,
      overnightQuantity: r.overnight_qty,
      averagePrice:     r.average_price,
      ltp:              r.ltp,
      pnl:              r.pnl,
      realisedPnl:      r.realised_pnl,
      unrealisedPnl:    r.unrealised_pnl,
      metadata:         meta,
      _source:          'db',
    };
  }

  _rowToHolding(r) {
    let meta = {};
    try { meta = JSON.parse(r.raw_json); } catch (_) {}
    return {
      symbol:       r.symbol,
      exchange:     r.exchange,
      quantity:     r.quantity,
      averagePrice: r.average_price,
      ltp:          r.ltp,
      pnl:          r.pnl,
      metadata:     meta,
      _source:      'db',
    };
  }

  // ── Support Tickets ───────────────────────────────────────────────────────

  createSupportTicket(ticket) {
    const id = ticket.id || randomUUID();
    const attachmentsJson = typeof ticket.attachments === 'string' ? ticket.attachments : JSON.stringify(ticket.attachments || []);
    const email = ticket.user_email || ticket.email || 'trader@riskloop.io';
    const userName = ticket.user_name || 'Trader';
    const subject = ticket.subject || `${(ticket.category || 'General').toUpperCase()} Inquiry`;
    const agent = ticket.assigned_agent || 'RiskLoop Support Team';

    const stmt = this.db.prepare(`
      INSERT INTO support_tickets (
        id, ticket_number, user_id, email, user_email, user_name, subject,
        category, description, attachments, status, priority, assigned_agent,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);
    stmt.run(
      id,
      ticket.ticket_number,
      ticket.user_id || null,
      email,
      email,
      userName,
      subject,
      ticket.category,
      ticket.description,
      attachmentsJson,
      ticket.status || 'open',
      ticket.priority || 'medium',
      agent
    );
    return this.getSupportTicketById(id);
  }

  getSupportTicketById(id) {
    const stmt = this.db.prepare(`SELECT * FROM support_tickets WHERE id = ? OR ticket_number = ?`);
    const row = stmt.get(id, id);
    if (!row) return null;
    let attachments = [];
    try { attachments = JSON.parse(row.attachments); } catch (_) {}
    return { ...row, attachments };
  }

  getSupportTickets(userId = null) {
    const stmt = userId
      ? this.db.prepare(`SELECT * FROM support_tickets WHERE user_id = ? ORDER BY created_at DESC`)
      : this.db.prepare(`SELECT * FROM support_tickets ORDER BY created_at DESC`);
    const rows = stmt.all(...(userId ? [userId] : []));
    return rows.map(r => {
      let attachments = [];
      try { attachments = JSON.parse(r.attachments); } catch (_) {}
      return { ...r, attachments };
    });
  }

  addSupportTicketMessage(msg) {
    const id = msg.id || randomUUID();
    const attachmentsJson = typeof msg.attachments === 'string' ? msg.attachments : JSON.stringify(msg.attachments || []);
    const senderRole = msg.sender_role || msg.sender_type || 'user';
    const senderType = msg.sender_type || msg.sender_role || 'user';
    const senderName = msg.sender_name || (senderRole === 'agent' ? 'RiskLoop Support Specialist' : 'User');

    const stmt = this.db.prepare(`
      INSERT INTO support_ticket_messages (
        id, ticket_id, sender_id, sender_role, sender_type, sender_name, message, attachments, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);
    stmt.run(
      id,
      msg.ticket_id,
      msg.sender_id || null,
      senderRole,
      senderType,
      senderName,
      msg.message,
      attachmentsJson
    );
    return id;
  }

  getSupportTicketMessages(ticketId) {
    const stmt = this.db.prepare(`SELECT * FROM support_ticket_messages WHERE ticket_id = ? ORDER BY created_at ASC`);
    const rows = stmt.all(ticketId);
    return rows.map(r => {
      let attachments = [];
      try { attachments = JSON.parse(r.attachments); } catch (_) {}
      return { ...r, attachments };
    });
  }

  updateSupportTicketStatus(ticketId, status) {
    const stmt = this.db.prepare(`
      UPDATE support_tickets 
      SET status = ?, updated_at = datetime('now') 
      WHERE id = ? OR ticket_number = ?
    `);
    stmt.run(status, ticketId, ticketId);
    return this.getSupportTicketById(ticketId);
  }

  updateSupportTicketPriority(ticketId, priority) {
    const stmt = this.db.prepare(`
      UPDATE support_tickets 
      SET priority = ?, updated_at = datetime('now') 
      WHERE id = ? OR ticket_number = ?
    `);
    stmt.run(priority, ticketId, ticketId);
    return this.getSupportTicketById(ticketId);
  }

  // ── AI Training Samples ───────────────────────────────────────────────────

  /**
   * Ingest or update an AI training sample with quality metrics and deduplication
   */
  insertAiTrainingSample(sample) {
    const verificationStatus = sample.verificationStatus || 'USER_EDITED';
    const userReviewed = sample.userReviewed !== undefined ? (sample.userReviewed ? 1 : 0) : 1;
    const editedFields = typeof sample.editedFields === 'string' ? sample.editedFields : JSON.stringify(sample.editedFields || []);
    const isTrainingReady = sample.isTrainingReady !== undefined ? (sample.isTrainingReady ? 1 : 0) : (verificationStatus === 'INVALID' ? 0 : 1);
    const qualityScore = typeof sample.qualityScore === 'number' ? sample.qualityScore : 100.0;
    const inconsistencyFlags = typeof sample.inconsistencyFlags === 'string' ? sample.inconsistencyFlags : JSON.stringify(sample.inconsistencyFlags || []);

    // Deduplication check: If this trade was already recorded for this user, update it
    if (sample.tradeId && sample.userId) {
      const existing = this.db.prepare(
        `SELECT id FROM ai_training_samples WHERE trade_id = ? AND user_id = ?`
      ).get(sample.tradeId, sample.userId);

      if (existing) {
        const updateStmt = this.db.prepare(`
          UPDATE ai_training_samples SET
            market = ?,
            source = ?,
            image_hash = ?,
            image_name = ?,
            raw_prediction = ?,
            confidence_scores = ?,
            user_corrected_values = ?,
            final_saved_values = ?,
            field_accuracy = ?,
            overall_accuracy_pct = ?,
            verification_status = ?,
            user_reviewed = ?,
            edited_fields = ?,
            is_training_ready = ?,
            quality_score = ?,
            inconsistency_flags = ?,
            created_at = datetime('now')
          WHERE id = ?
        `);

        updateStmt.run(
          sample.market || 'indian',
          sample.source || 'client_ocr',
          sample.imageHash || null,
          sample.imageName || null,
          typeof sample.rawPrediction === 'string' ? sample.rawPrediction : JSON.stringify(sample.rawPrediction || {}),
          typeof sample.confidenceScores === 'string' ? sample.confidenceScores : JSON.stringify(sample.confidenceScores || {}),
          typeof sample.userCorrectedValues === 'string' ? sample.userCorrectedValues : JSON.stringify(sample.userCorrectedValues || {}),
          typeof sample.finalSavedValues === 'string' ? sample.finalSavedValues : JSON.stringify(sample.finalSavedValues || {}),
          typeof sample.fieldAccuracy === 'string' ? sample.fieldAccuracy : JSON.stringify(sample.fieldAccuracy || {}),
          typeof sample.overallAccuracyPct === 'number' ? sample.overallAccuracyPct : 100.0,
          verificationStatus,
          userReviewed,
          editedFields,
          isTrainingReady,
          qualityScore,
          inconsistencyFlags,
          existing.id
        );

        return existing.id;
      }
    }

    const id = sample.id || `ai_sample_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const stmt = this.db.prepare(`
      INSERT INTO ai_training_samples (
        id, user_id, trade_id, market, source, image_hash, image_name,
        raw_prediction, confidence_scores, user_corrected_values,
        final_saved_values, field_accuracy, overall_accuracy_pct,
        verification_status, user_reviewed, edited_fields,
        is_training_ready, quality_score, inconsistency_flags, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    stmt.run(
      id,
      sample.userId || null,
      sample.tradeId || null,
      sample.market || 'indian',
      sample.source || 'client_ocr',
      sample.imageHash || null,
      sample.imageName || null,
      typeof sample.rawPrediction === 'string' ? sample.rawPrediction : JSON.stringify(sample.rawPrediction || {}),
      typeof sample.confidenceScores === 'string' ? sample.confidenceScores : JSON.stringify(sample.confidenceScores || {}),
      typeof sample.userCorrectedValues === 'string' ? sample.userCorrectedValues : JSON.stringify(sample.userCorrectedValues || {}),
      typeof sample.finalSavedValues === 'string' ? sample.finalSavedValues : JSON.stringify(sample.finalSavedValues || {}),
      typeof sample.fieldAccuracy === 'string' ? sample.fieldAccuracy : JSON.stringify(sample.fieldAccuracy || {}),
      typeof sample.overallAccuracyPct === 'number' ? sample.overallAccuracyPct : 100.0,
      verificationStatus,
      userReviewed,
      editedFields,
      isTrainingReady,
      qualityScore,
      inconsistencyFlags
    );

    return id;
  }

  /**
   * Retrieve list of AI training samples scoped by user or global for admin, with quality filtering
   */
  getAiTrainingSamples({ userId = null, limit = 50, offset = 0, market = null, trainingReady = null, status = null } = {}) {
    let sql = `SELECT * FROM ai_training_samples WHERE 1=1`;
    const params = [];

    if (userId) {
      sql += ` AND user_id = ?`;
      params.push(userId);
    }

    if (market) {
      sql += ` AND market = ?`;
      params.push(market);
    }

    if (trainingReady !== null && trainingReady !== undefined) {
      sql += ` AND is_training_ready = ?`;
      params.push(trainingReady ? 1 : 0);
    }

    if (status) {
      sql += ` AND verification_status = ?`;
      params.push(status);
    }

    sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(Math.min(limit, 200), offset);

    const rows = this.db.prepare(sql).all(...params);
    return rows.map(r => ({
      id: r.id,
      userId: r.user_id,
      tradeId: r.trade_id,
      market: r.market,
      source: r.source,
      imageHash: r.image_hash,
      imageName: r.image_name,
      rawPrediction: JSON.parse(r.raw_prediction || '{}'),
      confidenceScores: JSON.parse(r.confidence_scores || '{}'),
      userCorrectedValues: JSON.parse(r.user_corrected_values || '{}'),
      finalSavedValues: JSON.parse(r.final_saved_values || '{}'),
      fieldAccuracy: JSON.parse(r.field_accuracy || '{}'),
      overallAccuracyPct: r.overall_accuracy_pct,
      verificationStatus: r.verification_status || 'USER_EDITED',
      userReviewed: Boolean(r.user_reviewed),
      editedFields: JSON.parse(r.edited_fields || '[]'),
      isTrainingReady: Boolean(r.is_training_ready),
      qualityScore: r.quality_score || 100.0,
      inconsistencyFlags: JSON.parse(r.inconsistency_flags || '[]'),
      createdAt: r.created_at
    }));
  }

  /**
   * Compute aggregated AI accuracy and dataset quality analytics
   */
  getAiTrainingStats(userId = null) {
    let baseWhere = '';
    const params = [];

    if (userId) {
      baseWhere = ' WHERE user_id = ?';
      params.push(userId);
    }

    const totalRow = this.db.prepare(`
      SELECT 
        COUNT(*) as total_samples,
        SUM(CASE WHEN is_training_ready = 1 THEN 1 ELSE 0 END) as training_ready_samples,
        AVG(overall_accuracy_pct) as avg_accuracy_pct,
        AVG(quality_score) as avg_quality_score
      FROM ai_training_samples${baseWhere}
    `).get(...params);

    const totalSamples = totalRow?.total_samples || 0;
    const trainingReadySamples = totalRow?.training_ready_samples || 0;
    const avgAccuracyPct = totalRow?.avg_accuracy_pct ? Number(totalRow.avg_accuracy_pct.toFixed(1)) : 94.2;
    const avgQualityScore = totalRow?.avg_quality_score ? Number(totalRow.avg_quality_score.toFixed(1)) : 96.5;

    // Quality breakdown by verification_status
    const statusRows = this.db.prepare(`
      SELECT 
        verification_status as status,
        COUNT(*) as count
      FROM ai_training_samples${baseWhere}
      GROUP BY verification_status
    `).all(...params);

    const statusCounts = {
      VERIFIED: 0,
      USER_EDITED: 0,
      NOT_REVIEWED: 0,
      INVALID: 0
    };
    statusRows.forEach(r => {
      if (r.status && statusCounts[r.status] !== undefined) {
        statusCounts[r.status] = r.count;
      }
    });

    // Per-market breakdown
    const marketRows = this.db.prepare(`
      SELECT 
        market,
        COUNT(*) as count,
        AVG(overall_accuracy_pct) as avg_accuracy
      FROM ai_training_samples${baseWhere}
      GROUP BY market
    `).all(...params);

    // Source breakdown
    const sourceRows = this.db.prepare(`
      SELECT 
        source,
        COUNT(*) as count,
        AVG(overall_accuracy_pct) as avg_accuracy
      FROM ai_training_samples${baseWhere}
      GROUP BY source
    `).all(...params);

    return {
      totalSamples,
      trainingReadySamples,
      avgAccuracyPct,
      avgQualityScore,
      qualityBreakdown: statusCounts,
      marketBreakdown: marketRows,
      sourceBreakdown: sourceRows
    };
  }

  /**
   * Comprehensive analytics for Admin AI Dataset Management Dashboard
   */
  getAdminAiDatasetAnalytics({ market = null, source = null } = {}) {
    let whereClauses = [];
    const params = [];

    if (market && market !== 'all') {
      whereClauses.push('market = ?');
      params.push(market);
    }

    if (source && source !== 'all') {
      whereClauses.push('source = ?');
      params.push(source);
    }

    const whereSql = whereClauses.length > 0 ? ` WHERE ${whereClauses.join(' AND ')}` : '';

    // Total KPIs
    const totalRow = this.db.prepare(`
      SELECT 
        COUNT(*) as total_samples,
        SUM(CASE WHEN is_training_ready = 1 THEN 1 ELSE 0 END) as training_ready_samples,
        AVG(overall_accuracy_pct) as avg_accuracy_pct,
        AVG(quality_score) as avg_quality_score
      FROM ai_training_samples${whereSql}
    `).get(...params);

    const totalSamples = totalRow?.total_samples || 0;
    const trainingReadySamples = totalRow?.training_ready_samples || 0;
    const avgAccuracyPct = totalRow?.avg_accuracy_pct ? Number(totalRow.avg_accuracy_pct.toFixed(1)) : 94.2;
    const avgQualityScore = totalRow?.avg_quality_score ? Number(totalRow.avg_quality_score.toFixed(1)) : 96.5;

    // Quality breakdown
    const statusRows = this.db.prepare(`
      SELECT 
        verification_status as status,
        COUNT(*) as count
      FROM ai_training_samples${whereSql}
      GROUP BY verification_status
    `).all(...params);

    const qualityBreakdown = {
      VERIFIED: 0,
      USER_EDITED: 0,
      NOT_REVIEWED: 0,
      INVALID: 0
    };
    statusRows.forEach(r => {
      if (r.status && qualityBreakdown[r.status] !== undefined) {
        qualityBreakdown[r.status] = r.count;
      }
    });

    // Growth Timeline (by date)
    const growthRows = this.db.prepare(`
      SELECT 
        strftime('%Y-%m-%d', created_at) as date,
        COUNT(*) as count,
        SUM(CASE WHEN is_training_ready = 1 THEN 1 ELSE 0 END) as training_ready
      FROM ai_training_samples${whereSql}
      GROUP BY strftime('%Y-%m-%d', created_at)
      ORDER BY date ASC
      LIMIT 30
    `).all(...params);

    // Fetch all samples under filter to compute accurate field & invalid breakdowns
    const allMatchingSamples = this.db.prepare(`
      SELECT 
        field_accuracy,
        edited_fields,
        inconsistency_flags,
        raw_prediction,
        final_saved_values
      FROM ai_training_samples${whereSql}
      LIMIT 1000
    `).all(...params);

    // Field accuracy rates & Correction frequencies
    const fieldCounts = {
      symbol: { total: 0, passed: 0, corrections: 0 },
      direction: { total: 0, passed: 0, corrections: 0 },
      setup: { total: 0, passed: 0, corrections: 0 },
      entry: { total: 0, passed: 0, corrections: 0 },
      stop_loss: { total: 0, passed: 0, corrections: 0 },
      take_profit: { total: 0, passed: 0, corrections: 0 },
      outcome: { total: 0, passed: 0, corrections: 0 }
    };

    const invalidReasonsMap = {};

    allMatchingSamples.forEach(s => {
      // 1. Field accuracy
      let fa = {};
      try { fa = JSON.parse(s.field_accuracy || '{}'); } catch (_) {}
      for (const [f, passed] of Object.entries(fa)) {
        if (fieldCounts[f]) {
          fieldCounts[f].total++;
          if (passed) fieldCounts[f].passed++;
          else fieldCounts[f].corrections++;
        }
      }

      // 2. Edited fields
      let ef = [];
      try { ef = JSON.parse(s.edited_fields || '[]'); } catch (_) {}
      ef.forEach(f => {
        const normKey = f === 'sl' ? 'stop_loss' : (f === 'tp' ? 'take_profit' : f);
        if (fieldCounts[normKey]) {
          fieldCounts[normKey].corrections++;
        }
      });

      // 3. Inconsistency reasons
      let flags = [];
      try { flags = JSON.parse(s.inconsistency_flags || '[]'); } catch (_) {}
      flags.forEach(flag => {
        invalidReasonsMap[flag] = (invalidReasonsMap[flag] || 0) + 1;
      });
    });

    const fieldAccuracyRates = {};
    const correctedFieldsRank = [];

    for (const [field, data] of Object.entries(fieldCounts)) {
      fieldAccuracyRates[field] = data.total > 0
        ? Number(((data.passed / data.total) * 100).toFixed(1))
        : 95.0;

      correctedFieldsRank.push({
        field,
        correctionsCount: data.corrections,
        accuracyPct: fieldAccuracyRates[field]
      });
    }

    correctedFieldsRank.sort((a, b) => b.correctionsCount - a.correctionsCount);

    const invalidReasonsList = Object.entries(invalidReasonsMap).map(([reason, count]) => ({
      reason,
      count
    })).sort((a, b) => b.count - a.count);

    // Market Breakdown
    const marketRows = this.db.prepare(`
      SELECT 
        market,
        COUNT(*) as count,
        AVG(overall_accuracy_pct) as avg_accuracy
      FROM ai_training_samples${whereSql}
      GROUP BY market
    `).all(...params);

    // Source / Platform Breakdown
    const sourceRows = this.db.prepare(`
      SELECT 
        source,
        COUNT(*) as count,
        AVG(overall_accuracy_pct) as avg_accuracy
      FROM ai_training_samples${whereSql}
      GROUP BY source
    `).all(...params);

    // Directional Breakdown (BUY vs SELL)
    let buyCount = 0;
    let sellCount = 0;
    let completeCoreFieldsCount = 0;
    let setupFieldPresentCount = 0;

    allMatchingSamples.forEach(s => {
      let gt = {};
      try { gt = JSON.parse(s.final_saved_values || '{}'); } catch (_) {}
      const dir = (gt.direction || '').toUpperCase();
      if (dir === 'SELL' || dir.includes('SHORT')) {
        sellCount++;
      } else {
        buyCount++;
      }

      // Check core fields completeness
      const hasCore = Boolean(gt.symbol && gt.direction && gt.entry !== undefined && gt.sl !== undefined && gt.tp !== undefined && gt.outcome);
      if (hasCore) completeCoreFieldsCount++;
      if (gt.setup && String(gt.setup).trim().length > 0) setupFieldPresentCount++;
    });

    const totalCalculated = allMatchingSamples.length || 1;
    const directionBreakdown = {
      BUY: buyCount,
      SELL: sellCount,
      buyPct: Number(((buyCount / totalCalculated) * 100).toFixed(1)),
      sellPct: Number(((sellCount / totalCalculated) * 100).toFixed(1))
    };

    const completenessStats = {
      coreFieldsCompletePct: Number(((completeCoreFieldsCount / totalCalculated) * 100).toFixed(1)),
      setupAnnotatedPct: Number(((setupFieldPresentCount / totalCalculated) * 100).toFixed(1))
    };

    return {
      totalSamples,
      trainingReadySamples,
      avgAccuracyPct,
      avgQualityScore,
      qualityBreakdown,
      fieldAccuracyRates,
      correctedFieldsRank,
      invalidReasons: invalidReasonsList,
      growthTimeline: growthRows,
      marketBreakdown: marketRows,
      sourceBreakdown: sourceRows,
      directionBreakdown,
      completenessStats,
      modelMilestoneTarget: 1000,
      retrainingReady: trainingReadySamples >= 1000
    };
  }

  // ── AI Dataset Versions (Immutable Snapshots) ────────────────────────────

  /**
   * Create an immutable dataset version snapshot
   */
  createDatasetVersion(data) {
    const stmt = this.db.prepare(`
      INSERT INTO ai_dataset_versions (
        id,
        version_tag,
        name,
        description,
        sample_count,
        training_ready_count,
        quality_score,
        market_distribution,
        platform_distribution,
        field_completeness,
        dataset_hash,
        sample_ids,
        is_frozen,
        created_by,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = new Date().toISOString();
    stmt.run(
      data.id,
      data.versionTag,
      data.name,
      data.description || '',
      data.sampleCount || 0,
      data.trainingReadyCount || 0,
      data.qualityScore || 100.0,
      typeof data.marketDistribution === 'string' ? data.marketDistribution : JSON.stringify(data.marketDistribution || {}),
      typeof data.platformDistribution === 'string' ? data.platformDistribution : JSON.stringify(data.platformDistribution || {}),
      typeof data.fieldCompleteness === 'string' ? data.fieldCompleteness : JSON.stringify(data.fieldCompleteness || {}),
      data.datasetHash,
      typeof data.sampleIds === 'string' ? data.sampleIds : JSON.stringify(data.sampleIds || []),
      1, // Always frozen / immutable
      data.createdBy || 'admin',
      now
    );

    return this.getDatasetVersionById(data.id);
  }

  /**
   * Get all immutable dataset versions
   */
  getDatasetVersions() {
    const rows = this.db.prepare(`
      SELECT * FROM ai_dataset_versions
      ORDER BY created_at DESC
    `).all();

    return rows.map(r => ({
      id: r.id,
      versionTag: r.version_tag,
      name: r.name,
      description: r.description,
      sampleCount: r.sample_count,
      trainingReadyCount: r.training_ready_count,
      qualityScore: r.quality_score,
      marketDistribution: JSON.parse(r.market_distribution || '{}'),
      platformDistribution: JSON.parse(r.platform_distribution || '{}'),
      fieldCompleteness: JSON.parse(r.field_completeness || '{}'),
      datasetHash: r.dataset_hash,
      sampleIds: JSON.parse(r.sample_ids || '[]'),
      isFrozen: Boolean(r.is_frozen),
      createdBy: r.created_by,
      createdAt: r.created_at
    }));
  }

  /**
   * Get dataset version by ID
   */
  getDatasetVersionById(id) {
    const r = this.db.prepare(`
      SELECT * FROM ai_dataset_versions WHERE id = ?
    `).get(id);

    if (!r) return null;
    return {
      id: r.id,
      versionTag: r.version_tag,
      name: r.name,
      description: r.description,
      sampleCount: r.sample_count,
      trainingReadyCount: r.training_ready_count,
      qualityScore: r.quality_score,
      marketDistribution: JSON.parse(r.market_distribution || '{}'),
      platformDistribution: JSON.parse(r.platform_distribution || '{}'),
      fieldCompleteness: JSON.parse(r.field_completeness || '{}'),
      datasetHash: r.dataset_hash,
      sampleIds: JSON.parse(r.sample_ids || '[]'),
      isFrozen: Boolean(r.is_frozen),
      createdBy: r.created_by,
      createdAt: r.created_at
    };
  }

  // ── AI Model Experiments ─────────────────────────────────────────────────

  /**
   * Insert a new AI model experiment run (Never overwrites past experiments)
   */
  insertModelExperiment(data) {
    const stmt = this.db.prepare(`
      INSERT INTO ai_model_experiments (
        id,
        name,
        dataset_version_id,
        model_architecture,
        hyperparameters,
        overall_accuracy_pct,
        field_accuracies,
        latency_ms,
        is_baseline,
        is_candidate,
        status,
        notes,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = new Date().toISOString();
    stmt.run(
      data.id,
      data.name,
      data.datasetVersionId,
      data.modelArchitecture,
      typeof data.hyperparameters === 'string' ? data.hyperparameters : JSON.stringify(data.hyperparameters || {}),
      data.overallAccuracyPct,
      typeof data.fieldAccuracies === 'string' ? data.fieldAccuracies : JSON.stringify(data.fieldAccuracies || {}),
      data.latencyMs || 350,
      data.isBaseline ? 1 : 0,
      data.isCandidate ? 1 : 0,
      data.status || 'COMPLETED',
      data.notes || '',
      now
    );

    return this.getModelExperimentById(data.id);
  }

  /**
   * Get all model experiments with dataset version details
   */
  getModelExperiments() {
    const rows = this.db.prepare(`
      SELECT 
        e.*,
        v.version_tag as dataset_version_tag,
        v.name as dataset_version_name
      FROM ai_model_experiments e
      LEFT JOIN ai_dataset_versions v ON e.dataset_version_id = v.id
      ORDER BY e.created_at DESC
    `).all();

    return rows.map(r => ({
      id: r.id,
      name: r.name,
      datasetVersionId: r.dataset_version_id,
      datasetVersionTag: r.dataset_version_tag || 'Unlinked',
      datasetVersionName: r.dataset_version_name || '',
      modelArchitecture: r.model_architecture,
      hyperparameters: JSON.parse(r.hyperparameters || '{}'),
      overallAccuracyPct: r.overall_accuracy_pct,
      fieldAccuracies: JSON.parse(r.field_accuracies || '{}'),
      latencyMs: r.latency_ms,
      isBaseline: Boolean(r.is_baseline),
      isCandidate: Boolean(r.is_candidate),
      status: r.status,
      notes: r.notes,
      createdAt: r.created_at
    }));
  }

  /**
   * Get experiment by ID
   */
  getModelExperimentById(id) {
    const r = this.db.prepare(`
      SELECT 
        e.*,
        v.version_tag as dataset_version_tag,
        v.name as dataset_version_name
      FROM ai_model_experiments e
      LEFT JOIN ai_dataset_versions v ON e.dataset_version_id = v.id
      WHERE e.id = ?
    `).get(id);

    if (!r) return null;
    return {
      id: r.id,
      name: r.name,
      datasetVersionId: r.dataset_version_id,
      datasetVersionTag: r.dataset_version_tag || 'Unlinked',
      datasetVersionName: r.dataset_version_name || '',
      modelArchitecture: r.model_architecture,
      hyperparameters: JSON.parse(r.hyperparameters || '{}'),
      overallAccuracyPct: r.overall_accuracy_pct,
      fieldAccuracies: JSON.parse(r.field_accuracies || '{}'),
      latencyMs: r.latency_ms,
      isBaseline: Boolean(r.is_baseline),
      isCandidate: Boolean(r.is_candidate),
      status: r.status,
      notes: r.notes,
      createdAt: r.created_at
    };
  }

  /**
   * Get current active baseline experiment
   */
  getActiveBaselineExperiment() {
    const r = this.db.prepare(`
      SELECT 
        e.*,
        v.version_tag as dataset_version_tag
      FROM ai_model_experiments e
      LEFT JOIN ai_dataset_versions v ON e.dataset_version_id = v.id
      WHERE e.is_baseline = 1
      LIMIT 1
    `).get();

    if (!r) return null;
    return {
      id: r.id,
      name: r.name,
      datasetVersionId: r.dataset_version_id,
      datasetVersionTag: r.dataset_version_tag || 'Unlinked',
      modelArchitecture: r.model_architecture,
      hyperparameters: JSON.parse(r.hyperparameters || '{}'),
      overallAccuracyPct: r.overall_accuracy_pct,
      fieldAccuracies: JSON.parse(r.field_accuracies || '{}'),
      latencyMs: r.latency_ms,
      isBaseline: true,
      isCandidate: Boolean(r.is_candidate),
      status: r.status,
      notes: r.notes,
      createdAt: r.created_at
    };
  }

  /**
   * Update experiment candidate status
   */
  updateExperimentCandidateStatus(id, isCandidate) {
    this.db.prepare(`
      UPDATE ai_model_experiments
      SET is_candidate = ?
      WHERE id = ?
    `).run(isCandidate ? 1 : 0, id);

    return this.getModelExperimentById(id);
  }

  /**
   * Set experiment as active production baseline (demoting other baselines)
   */
  setExperimentAsBaseline(id) {
    this.db.prepare(`
      UPDATE ai_model_experiments
      SET is_baseline = 0
    `).run();

    this.db.prepare(`
      UPDATE ai_model_experiments
      SET is_baseline = 1, is_candidate = 0
      WHERE id = ?
    `).run(id);

    return this.getModelExperimentById(id);
  }

  // ── AI Model Safety & Staged Rollout ──────────────────────────────────────

  /**
   * Create a new staged canary rollout record
   */
  createModelRollout(data) {
    const stmt = this.db.prepare(`
      INSERT INTO ai_model_rollouts (
        id,
        model_id,
        baseline_model_id,
        rollout_status,
        traffic_percentage,
        safety_gate_passed,
        safety_gate_report,
        auto_rollback_enabled,
        rollback_reason,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = new Date().toISOString();
    stmt.run(
      data.id,
      data.modelId,
      data.baselineModelId,
      data.rolloutStatus || 'STAGED_CANARY',
      data.trafficPercentage !== undefined ? data.trafficPercentage : 10,
      data.safetyGatePassed ? 1 : 0,
      typeof data.safetyGateReport === 'string' ? data.safetyGateReport : JSON.stringify(data.safetyGateReport || {}),
      data.autoRollbackEnabled !== undefined ? (data.autoRollbackEnabled ? 1 : 0) : 1,
      data.rollbackReason || '',
      now,
      now
    );

    return this.getRolloutById(data.id);
  }

  /**
   * Get active staged canary rollout
   */
  getActiveRollout() {
    const r = this.db.prepare(`
      SELECT 
        r.*,
        m.name as model_name,
        m.model_architecture,
        m.overall_accuracy_pct as candidate_accuracy,
        b.name as baseline_name,
        b.overall_accuracy_pct as baseline_accuracy
      FROM ai_model_rollouts r
      LEFT JOIN ai_model_experiments m ON r.model_id = m.id
      LEFT JOIN ai_model_experiments b ON r.baseline_model_id = b.id
      WHERE r.rollout_status = 'STAGED_CANARY'
      ORDER BY r.created_at DESC
      LIMIT 1
    `).get();

    if (!r) return null;
    return {
      id: r.id,
      modelId: r.model_id,
      modelName: r.model_name,
      modelArchitecture: r.model_architecture,
      candidateAccuracy: r.candidate_accuracy,
      baselineModelId: r.baseline_model_id,
      baselineName: r.baseline_name,
      baselineAccuracy: r.baseline_accuracy,
      rolloutStatus: r.rollout_status,
      trafficPercentage: r.traffic_percentage,
      safetyGatePassed: Boolean(r.safety_gate_passed),
      safetyGateReport: JSON.parse(r.safety_gate_report || '{}'),
      autoRollbackEnabled: Boolean(r.auto_rollback_enabled),
      rollbackReason: r.rollback_reason,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    };
  }

  /**
   * Get rollout by ID
   */
  getRolloutById(id) {
    const r = this.db.prepare(`
      SELECT 
        r.*,
        m.name as model_name,
        m.model_architecture,
        b.name as baseline_name
      FROM ai_model_rollouts r
      LEFT JOIN ai_model_experiments m ON r.model_id = m.id
      LEFT JOIN ai_model_experiments b ON r.baseline_model_id = b.id
      WHERE r.id = ?
    `).get(id);

    if (!r) return null;
    return {
      id: r.id,
      modelId: r.model_id,
      modelName: r.model_name,
      modelArchitecture: r.model_architecture,
      baselineModelId: r.baseline_model_id,
      baselineName: r.baseline_name,
      rolloutStatus: r.rollout_status,
      trafficPercentage: r.traffic_percentage,
      safetyGatePassed: Boolean(r.safety_gate_passed),
      safetyGateReport: JSON.parse(r.safety_gate_report || '{}'),
      autoRollbackEnabled: Boolean(r.auto_rollback_enabled),
      rollbackReason: r.rollback_reason,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    };
  }

  /**
   * Update traffic percentage for rollout
   */
  updateRolloutTraffic(id, trafficPercentage) {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE ai_model_rollouts
      SET traffic_percentage = ?, updated_at = ?
      WHERE id = ?
    `).run(trafficPercentage, now, id);

    return this.getRolloutById(id);
  }

  /**
   * Update rollout status (e.g. FULL_PRODUCTION, ROLLED_BACK)
   */
  updateRolloutStatus(id, rolloutStatus, rollbackReason = '') {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE ai_model_rollouts
      SET rollout_status = ?, rollback_reason = ?, updated_at = ?
      WHERE id = ?
    `).run(rolloutStatus, rollbackReason, now, id);

    return this.getRolloutById(id);
  }

  /**
   * Upsert live production telemetry for a rollout
   */
  upsertProductionTelemetry(data) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO ai_production_telemetry (
        id,
        rollout_id,
        model_id,
        traffic_count,
        production_accuracy_pct,
        user_correction_rate_pct,
        critical_price_correction_rate_pct,
        error_rate_pct,
        avg_latency_ms,
        health_status,
        last_evaluated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = new Date().toISOString();
    stmt.run(
      data.id || `telem_${data.rolloutId}_${data.modelId}`,
      data.rolloutId,
      data.modelId,
      data.trafficCount || 0,
      data.productionAccuracyPct !== undefined ? data.productionAccuracyPct : 95.0,
      data.userCorrectionRatePct !== undefined ? data.userCorrectionRatePct : 5.0,
      data.criticalPriceCorrectionRatePct !== undefined ? data.criticalPriceCorrectionRatePct : 2.0,
      data.errorRatePct !== undefined ? data.errorRatePct : 0.0,
      data.avgLatencyMs !== undefined ? data.avgLatencyMs : 280,
      data.healthStatus || 'HEALTHY',
      now
    );

    return this.getProductionTelemetry(data.rolloutId);
  }

  /**
   * Get production telemetry for rollout
   */
  getProductionTelemetry(rolloutId) {
    const r = this.db.prepare(`
      SELECT * FROM ai_production_telemetry
      WHERE rollout_id = ?
      ORDER BY last_evaluated_at DESC
      LIMIT 1
    `).get(rolloutId);

    if (!r) return null;
    return {
      id: r.id,
      rolloutId: r.rollout_id,
      modelId: r.model_id,
      trafficCount: r.traffic_count,
      productionAccuracyPct: r.production_accuracy_pct,
      userCorrectionRatePct: r.user_correction_rate_pct,
      criticalPriceCorrectionRatePct: r.critical_price_correction_rate_pct,
      errorRatePct: r.error_rate_pct,
      avgLatencyMs: r.avg_latency_ms,
      healthStatus: r.health_status,
      lastEvaluatedAt: r.last_evaluated_at
    };
  }

  // ── Profile Operations ───────────────────────────────────────────────────

  getProfile(userId) {
    if (!userId) return null;
    const r = this.db.prepare('SELECT * FROM profiles WHERE id = ?').get(userId);
    if (!r) return null;
    return {
      id: r.id,
      email: r.email,
      fullName: r.full_name,
      avatarUrl: r.avatar_url,
      avatarPublicId: r.avatar_public_id,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    };
  }

  upsertProfile(profile) {
    if (!profile || !profile.id) return null;
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO profiles (id, email, full_name, avatar_url, avatar_public_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        email = excluded.email,
        full_name = coalesce(nullif(excluded.full_name, ''), profiles.full_name),
        avatar_url = excluded.avatar_url,
        avatar_public_id = excluded.avatar_public_id,
        updated_at = excluded.updated_at
    `);
    stmt.run(
      profile.id,
      profile.email || `${profile.id}@riskloop.io`,
      profile.fullName || profile.full_name || '',
      profile.avatarUrl || profile.avatar_url || null,
      profile.avatarPublicId || profile.avatar_public_id || null,
      profile.createdAt || now,
      now
    );
    return this.getProfile(profile.id);
  }

  updateProfileAvatar(userId, avatarUrl, avatarPublicId) {
    if (!userId) return null;
    const now = new Date().toISOString();
    const existing = this.getProfile(userId);
    if (!existing) {
      return this.upsertProfile({
        id: userId,
        email: `${userId}@riskloop.io`,
        avatarUrl,
        avatarPublicId
      });
    }

    this.db.prepare(`
      UPDATE profiles
      SET avatar_url = ?, avatar_public_id = ?, updated_at = ?
      WHERE id = ?
    `).run(avatarUrl, avatarPublicId, now, userId);

    return this.getProfile(userId);
  }

  // ── Journal Trade Operations ─────────────────────────────────────────────

  getJournalTrade(tradeId) {
    if (!tradeId) return null;
    const r = this.db.prepare('SELECT * FROM journal_trades WHERE id = ?').get(tradeId);
    if (!r) return null;
    let images = [];
    try {
      images = typeof r.images === 'string' ? JSON.parse(r.images || '[]') : (r.images || []);
    } catch (_) {
      images = [];
    }

    return {
      id: r.id,
      userId: r.user_id,
      tradeDate: r.trade_date,
      symbol: r.symbol,
      instrumentType: r.instrument_type,
      side: r.side,
      quantity: r.quantity,
      entryPrice: r.entry_price,
      exitPrice: r.exit_price,
      stopLoss: r.stop_loss,
      targetPrice: r.target_price,
      broker: r.broker,
      pnl: r.pnl,
      pnlPercentage: r.pnl_percentage,
      strategyTag: r.strategy_tag,
      psychologyRating: r.psychology_rating,
      notes: r.notes,
      images,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    };
  }

  saveJournalTrade(trade) {
    if (!trade || !trade.id) return null;
    const now = new Date().toISOString();
    const imagesJson = JSON.stringify(Array.isArray(trade.images) ? trade.images : []);

    const stmt = this.db.prepare(`
      INSERT INTO journal_trades (
        id, user_id, trade_date, symbol, instrument_type, side, quantity,
        entry_price, exit_price, stop_loss, target_price, broker, pnl,
        pnl_percentage, strategy_tag, psychology_rating, notes, images, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        symbol = excluded.symbol,
        instrument_type = excluded.instrument_type,
        side = excluded.side,
        quantity = excluded.quantity,
        entry_price = excluded.entry_price,
        exit_price = excluded.exit_price,
        stop_loss = excluded.stop_loss,
        target_price = excluded.target_price,
        broker = excluded.broker,
        pnl = excluded.pnl,
        pnl_percentage = excluded.pnl_percentage,
        strategy_tag = excluded.strategy_tag,
        psychology_rating = excluded.psychology_rating,
        notes = excluded.notes,
        images = excluded.images,
        updated_at = excluded.updated_at
    `);

    stmt.run(
      trade.id,
      trade.userId || trade.user_id,
      trade.tradeDate || trade.trade_date || now.split('T')[0],
      trade.symbol || 'NIFTY',
      trade.instrumentType || trade.instrument_type || 'EQUITY',
      trade.side || 'BUY',
      trade.quantity || 1,
      trade.entryPrice || trade.entry_price || 0,
      trade.exitPrice !== undefined ? trade.exitPrice : null,
      trade.stopLoss !== undefined ? trade.stopLoss : null,
      trade.targetPrice !== undefined ? trade.targetPrice : null,
      trade.broker || '',
      trade.pnl || 0,
      trade.pnlPercentage || trade.pnl_percentage || 0,
      trade.strategyTag || trade.strategy_tag || '',
      trade.psychologyRating || trade.psychology_rating || 3,
      trade.notes || '',
      imagesJson,
      trade.createdAt || now,
      now
    );

    return this.getJournalTrade(trade.id);
  }

  updateJournalTradeImages(tradeId, images) {
    if (!tradeId) return null;
    const now = new Date().toISOString();
    const imagesJson = JSON.stringify(Array.isArray(images) ? images : []);

    this.db.prepare(`
      UPDATE journal_trades
      SET images = ?, updated_at = ?
      WHERE id = ?
    `).run(imagesJson, now, tradeId);

    return this.getJournalTrade(tradeId);
  }

  deleteJournalTrade(tradeId, userId = null) {
    if (!tradeId) return false;
    let query = 'DELETE FROM journal_trades WHERE id = ?';
    const params = [tradeId];
    if (userId) {
      query += ' AND user_id = ?';
      params.push(userId);
    }
    const result = this.db.prepare(query).run(...params);
    return result.changes > 0;
  }

  deleteUserJournalTrades(userId) {
    if (!userId) return 0;
    const result = this.db.prepare('DELETE FROM journal_trades WHERE user_id = ?').run(userId);
    return result.changes;
  }

  getAllJournalTrades(userId = null) {
    let query = 'SELECT * FROM journal_trades';
    const params = [];
    if (userId) {
      query += ' WHERE user_id = ?';
      params.push(userId);
    }
    const rows = this.db.prepare(query).all(...params);
    return rows.map(r => {
      let images = [];
      try {
        images = typeof r.images === 'string' ? JSON.parse(r.images || '[]') : (r.images || []);
      } catch (_) {
        images = [];
      }
      return {
        id: r.id,
        userId: r.user_id,
        tradeDate: r.trade_date,
        symbol: r.symbol,
        pnl: r.pnl,
        images,
        createdAt: r.created_at,
        updatedAt: r.updated_at
      };
    });
  }

  getAllProfiles() {
    const rows = this.db.prepare('SELECT * FROM profiles').all();
    return rows.map(r => ({
      id: r.id,
      email: r.email,
      fullName: r.full_name,
      avatarUrl: r.avatar_url,
      avatarPublicId: r.avatar_public_id,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));
  }

  // ── Profile Management ────────────────────────────────────────────────────

  getProfile(userId) {
    if (!userId) return null;
    const row = this.db.prepare(`
      SELECT * FROM profiles WHERE id = ?
    `).get(userId);

    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      fullName: row.full_name,
      avatarUrl: row.avatar_url,
      avatarPublicId: row.avatar_public_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  upsertProfile(profile) {
    if (!profile || !profile.id) return null;
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO profiles (id, email, full_name, avatar_url, avatar_public_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        email = excluded.email,
        full_name = excluded.full_name,
        avatar_url = excluded.avatar_url,
        avatar_public_id = excluded.avatar_public_id,
        updated_at = excluded.updated_at
    `).run(
      profile.id,
      profile.email || `${profile.id}@riskloop.io`,
      profile.fullName || profile.full_name || '',
      profile.avatarUrl || profile.avatar_url || null,
      profile.avatarPublicId || profile.avatar_public_id || null,
      profile.createdAt || now,
      now
    );
    return this.getProfile(profile.id);
  }

  updateProfileAvatar(userId, avatarUrl, avatarPublicId) {
    if (!userId) return null;
    const now = new Date().toISOString();
    const existing = this.getProfile(userId);
    if (!existing) {
      this.upsertProfile({
        id: userId,
        email: `${userId}@riskloop.io`,
        avatarUrl: avatarUrl || null,
        avatarPublicId: avatarPublicId || null
      });
    } else {
      this.db.prepare(`
        UPDATE profiles
        SET avatar_url = ?, avatar_public_id = ?, updated_at = ?
        WHERE id = ?
      `).run(avatarUrl || null, avatarPublicId || null, now, userId);
    }
    return this.getProfile(userId);
  }
}

// Singleton
export const db = new DatabaseService();
