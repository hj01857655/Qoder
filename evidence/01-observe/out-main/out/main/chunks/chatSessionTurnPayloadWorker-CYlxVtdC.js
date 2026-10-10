import{performance as m}from"node:perf_hooks";import{workerData as E,parentPort as g}from"node:worker_threads";import{mkdirSync as N}from"node:fs";import{dirname as L}from"node:path";import{DatabaseSync as A}from"node:sqlite";import{L as y}from"./liveAssistantProjection-Dmaq-OB-.js";import{u as O}from"./chatSessionMessageQueries-BpBLLROc.js";import"node:crypto";import"./chatSessionSearchProjection-k25ykqy2.js";import"croner";import"node:os";function I(s){const e=JSON.parse(s.message_json),t=e.status??s.message_status,n={...e,status:t==="streaming"||t==="interrupted"||t==="failed"||t==="completed"?t:"completed"};if(!Object.hasOwn(e,"status")&&!Object.hasOwn(e,"feedback"))return{message:n,payloadJson:s.message_json};const{status:i,feedback:o,...r}=e;return{message:n,payloadJson:JSON.stringify(r)}}class f{queueDatabase;constructor(e){N(L(e),{recursive:!0}),this.queueDatabase=new A(e),this.queueDatabase.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      CREATE TABLE IF NOT EXISTS pending_turn_projections (
        session_id TEXT NOT NULL,
        turn_id TEXT,
        message_id TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source = 'sdk-projection'),
        message_json TEXT NOT NULL,
        message_status TEXT NOT NULL DEFAULT 'completed',
        state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'materializing')),
        attempt_count INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (session_id, message_id)
      );
      CREATE TABLE IF NOT EXISTS active_turn_projection_items (
        session_id TEXT NOT NULL,
        turn_id TEXT NOT NULL,
        turn_started_at TEXT NOT NULL,
        request_set_id TEXT,
        item_id TEXT NOT NULL,
        ordinal INTEGER NOT NULL,
        parent_tool_use_id TEXT,
        item_type TEXT NOT NULL,
        item_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (session_id, turn_id, item_id),
        UNIQUE (session_id, turn_id, ordinal)
      );
    `);const t=new Set(this.queueDatabase.prepare("PRAGMA table_info(active_turn_projection_items)").all().map(n=>n.name));t.has("turn_started_at")||this.queueDatabase.exec("ALTER TABLE active_turn_projection_items ADD COLUMN turn_started_at TEXT"),t.has("request_set_id")||this.queueDatabase.exec("ALTER TABLE active_turn_projection_items ADD COLUMN request_set_id TEXT"),new Set(this.queueDatabase.prepare("PRAGMA table_info(pending_turn_projections)").all().map(n=>n.name)).has("message_status")||this.queueDatabase.exec("ALTER TABLE pending_turn_projections ADD COLUMN message_status TEXT NOT NULL DEFAULT 'completed'")}initialize(){return{pendingPayloads:this.queueDatabase.prepare(`SELECT session_id, turn_id, message_id, source, message_json, message_status
         FROM pending_turn_projections
         ORDER BY created_at ASC`).all().map(t=>{const a=I(t);return{sessionId:t.session_id,...t.turn_id?{turnId:t.turn_id}:{},message:a.message,payloadJson:a.payloadJson}}),interruptedPayloads:this.recoverInterruptedTurns()}}stageItem(e){const t=JSON.stringify(e.payload);return this.queueDatabase.prepare(`INSERT INTO active_turn_projection_items (
           session_id, turn_id, turn_started_at, request_set_id,
           item_id, ordinal, parent_tool_use_id, item_type, item_json, created_at
         ) VALUES (
           ?, ?, ?, ?, ?,
           COALESCE((
             SELECT MAX(ordinal) + 1 FROM active_turn_projection_items WHERE session_id = ? AND turn_id = ?
           ), 1),
           ?, ?, ?, ?
         )
         ON CONFLICT(session_id, turn_id, item_id) DO NOTHING`).run(e.sessionId,e.turnId,e.turnStartedAt,e.requestSetId??null,e.itemId,e.sessionId,e.turnId,e.parentToolUseId,e.itemType,t,Date.now()),t.length}stageFinalPayload(e){const t=e.turnId&&e.message.turnId!==e.turnId?{...e.message,turnId:e.turnId}:e.message,a=O(t),n=Date.now();return this.queueDatabase.prepare(`INSERT INTO pending_turn_projections (
           session_id, turn_id, message_id, source, message_json, message_status,
           state, attempt_count, created_at, updated_at
         ) VALUES (?, ?, ?, 'sdk-projection', ?, ?, 'pending', 0, ?, ?)
         ON CONFLICT(session_id, message_id) DO UPDATE SET
           turn_id = excluded.turn_id,
           source = excluded.source,
           message_json = excluded.message_json,
           message_status = excluded.message_status,
           state = 'pending',
           updated_at = excluded.updated_at`).run(e.sessionId,e.turnId??t.turnId??null,t.id,a,t.status??"completed",n,n),{...e,message:t,payloadJson:a}}close(){this.queueDatabase.close()}acknowledge(e,t,a){a&&this.queueDatabase.prepare("DELETE FROM pending_turn_projections WHERE session_id = ? AND message_id = ?").run(e,a),this.queueDatabase.prepare("DELETE FROM active_turn_projection_items WHERE session_id = ? AND turn_id = ?").run(e,t)}recoverInterruptedTurns(){const e=this.queueDatabase.prepare(`SELECT item.session_id, item.turn_id, item.turn_started_at, item.request_set_id,
                item.item_type, item.item_json, item.created_at
         FROM active_turn_projection_items AS item
         WHERE NOT EXISTS (
           SELECT 1 FROM pending_turn_projections AS pending
           WHERE pending.session_id = item.session_id AND pending.turn_id = item.turn_id
         )
         ORDER BY item.session_id ASC, item.turn_id ASC, item.ordinal ASC`).all(),t=new Map;for(const n of e){const i=`${n.session_id}\0${n.turn_id}`,o=t.get(i);o?o.push(n):t.set(i,[n])}const a=[];for(const n of t.values()){const i=n[0];if(i)try{const o=i.turn_started_at||new Date(i.created_at).toISOString(),r=new y(i.turn_id,o,void 0,o,i.request_set_id??void 0);let d=!1;for(const p of n){const u=JSON.parse(p.item_json);p.item_type==="assistant"&&u.type==="assistant"?d=r.applyAssistant(u)||d:p.item_type==="toolResult"&&u.type==="user"&&(d=r.applyToolResults(u)||d)}if(!d)throw new Error("Turn 中间项没有可回填的 Assistant 内容。");r.finalizeTerminalActivities("interrupted"),r.finalizeInterruptedForkAvailability();const l=r.snapshot("interrupted");if(!l)throw new Error("Turn 中间项无法形成可回填的 Assistant 消息。");a.push({sessionId:i.session_id,turnId:i.turn_id,message:l})}catch{}}return a}}const T=g;if(!T)throw new Error("ChatSession Turn Payload Worker 缺少消息端口。");const h=E,c=new f(h.queueDatabasePath);T.on("message",s=>{let e;try{if(s.kind==="initialize")e={id:s.id,kind:"initialized",...c.initialize(),memory:_()};else if(s.kind==="stageItem"){const t=m.now(),a=c.stageItem(s);e={id:s.id,kind:"staged",serializedPayloadCharacters:a,durationMs:m.now()-t,memory:_()}}else if(s.kind==="stageFinalPayload"){const t=m.now(),a=c.stageFinalPayload(s);e={id:s.id,kind:"finalPayloadStaged",serializedPayloadCharacters:a.payloadJson.length,payload:a,durationMs:m.now()-t,memory:_()}}else c.acknowledge(s.sessionId,s.turnId,s.messageId),e={id:s.id,kind:"acknowledged",memory:_()}}catch(t){e={id:s.id,kind:"failed",error:t instanceof Error?t.message:"ChatSession Turn Payload 物化失败。",memory:_()}}T.postMessage(e)});function _(){const s=process.memoryUsage();return{heapUsedBytes:s.heapUsed,heapTotalBytes:s.heapTotal,externalBytes:s.external}}
