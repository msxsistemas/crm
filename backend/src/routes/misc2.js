// All routes originally in this file have been extracted to dedicated modules:
//   products        → routes/products.js
//   webhooks        → routes/webhooks.js
//   sla-rules       → routes/sla.js
//   reviews         → routes/reviews.js
//   activity-log    → routes/sla.js
//   followup-rem.   → routes/sla.js
//   api-tokens      → routes/api-tokens.js
//   blacklist       → routes/blacklist.js
//   agent-schedules → routes/agent-schedules.js
//   proposals       → routes/proposals.js
//   sales-goals     → routes/proposals.js
//   conv-transfers  → routes/distribution.js
//   auto-dist-cfg   → routes/distribution.js
//   whatsapp-status → routes/engagement.js
//   contact-forms   → routes/engagement.js
//   queues          → routes/engagement.js
//   queue-agents    → routes/engagement.js
//   campaign-cont.  → routes/engagement.js
//   conv-notes      → routes/engagement.js

export default async function misc2Routes(_fastify) {
  // intentionally empty — routes live in dedicated files
}
