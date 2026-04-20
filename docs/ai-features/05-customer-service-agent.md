# Feature Spec: Customer Service Agent

**Feature ID:** AI-005  
**Phase:** 3  
**Priority:** Medium  
**Status:** Planning

---

## Summary

A customer-facing AI agent that handles common inquiries - certificate status, estimated completion, download links, and calibration requests - via chat widget or WhatsApp.

---

## Problem Statement

Labs receive repetitive customer inquiries:
- "What's the status of my certificate?"
- "When will it be ready?"
- "Can you send me a copy?"
- "I need to schedule a calibration"

**Current state:**
- 20+ support calls/emails per day
- Admin time wasted on status lookups
- Delayed responses = unhappy customers

---

## Solution

### Customer Portal Chat Widget

```
┌─────────────────────────────────────────────────────────────────┐
│  💬 Precision Calibration Support                       [−]    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  🤖 Hi! I'm your calibration assistant. How can I help?       │
│                                                                 │
│  Quick actions:                                                 │
│  [📋 Check Certificate Status]                                 │
│  [📅 Schedule Calibration]                                     │
│  [📄 Download Certificates]                                    │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  👤 What's the status of my Fluke 87V calibration?             │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  🤖 I found your certificate for Fluke 87V (S/N: 12345):       │
│                                                                 │
│     📄 Certificate: HTA/CAL/2026/1234                          │
│     📊 Status: Under Review                                    │
│     ⏱️ Estimated completion: Tomorrow by 2 PM                  │
│                                                                 │
│     Would you like me to notify you when it's ready?           │
│     [Yes, notify me] [No thanks]                               │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Type a message...                              [Send]          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### WhatsApp Integration

```
┌─────────────────────────────────────────────────────────────────┐
│  WhatsApp - Precision Calibration                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Customer: Hi, I need the calibration certificate for my        │
│            pressure gauge submitted last week                   │
│                                                                 │
│  Bot: Hi! Let me look that up for you.                         │
│                                                                 │
│        I found your pressure gauge calibration:                │
│        • Certificate: HTA/CAL/2026/1198                        │
│        • Status: ✅ Authorized                                  │
│        • Completed: April 15, 2026                             │
│                                                                 │
│        📎 [Download Certificate PDF]                           │
│                                                                 │
│        Is there anything else I can help with?                 │
│                                                                 │
│  Customer: Can you also check when my DMM is due?              │
│                                                                 │
│  Bot: Your Fluke 87V DMM (last calibrated Jan 2026)            │
│        is due for recalibration in July 2026.                  │
│                                                                 │
│        Would you like to schedule it now?                      │
│        [📅 Schedule Calibration] [Remind me later]             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Agent Capabilities

| Intent | Action | Data Source |
|--------|--------|-------------|
| Certificate status | Look up by instrument/serial/cert# | Certificate table |
| ETA inquiry | Estimate based on queue position | Workflow analytics |
| Download request | Generate secure link | Signed PDF storage |
| Schedule calibration | Create calibration request | Request system |
| Due date check | Look up next calibration | Customer instruments |
| General question | Answer from knowledge base | RAG system |
| Escalate to human | Transfer to admin | Notification |

---

## Implementation

### Agent Definition

```typescript
// apps/api/src/agents/customer-service/agent.ts

const CUSTOMER_TOOLS = [
  {
    name: 'lookup_certificate',
    description: 'Find certificate by number, instrument, or serial number',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        customer_id: { type: 'string' }
      },
      required: ['query', 'customer_id']
    }
  },
  {
    name: 'get_certificate_status',
    description: 'Get detailed status and ETA for a certificate',
    input_schema: {
      type: 'object',
      properties: {
        certificate_id: { type: 'string' }
      },
      required: ['certificate_id']
    }
  },
  {
    name: 'generate_download_link',
    description: 'Create a secure download link for a certificate',
    input_schema: {
      type: 'object',
      properties: {
        certificate_id: { type: 'string' },
        expires_in_hours: { type: 'number', default: 24 }
      },
      required: ['certificate_id']
    }
  },
  {
    name: 'check_calibration_due',
    description: 'Check when instruments are due for calibration',
    input_schema: {
      type: 'object',
      properties: {
        customer_id: { type: 'string' },
        instrument_type: { type: 'string' }
      },
      required: ['customer_id']
    }
  },
  {
    name: 'create_calibration_request',
    description: 'Submit a new calibration request',
    input_schema: {
      type: 'object',
      properties: {
        customer_id: { type: 'string' },
        instrument_description: { type: 'string' },
        preferred_date: { type: 'string' },
        notes: { type: 'string' }
      },
      required: ['customer_id', 'instrument_description']
    }
  },
  {
    name: 'escalate_to_human',
    description: 'Transfer conversation to human support',
    input_schema: {
      type: 'object',
      properties: {
        reason: { type: 'string' },
        priority: { enum: ['low', 'medium', 'high'] }
      },
      required: ['reason']
    }
  }
]

const SYSTEM_PROMPT = `You are a customer service assistant for a calibration laboratory.

## Your Role
- Help customers check certificate status
- Provide download links for completed certificates
- Schedule calibration requests
- Answer questions about calibration services

## Guidelines
- Always verify customer identity before sharing certificate details
- Be helpful and professional
- If you can't help, offer to connect with human support
- Never share certificates with unauthorized users

## Boundaries
- You cannot modify certificates
- You cannot change pricing or terms
- You cannot access other customers' data
- Complex technical questions should go to engineers`

export class CustomerServiceAgent {
  async handleMessage(
    customerId: string,
    message: string,
    channel: 'web' | 'whatsapp'
  ): Promise<AgentResponse> {
    // Implementation similar to onboarding agent
    // with customer-specific tools
  }
}
```

### WhatsApp Integration (via Twilio/360dialog)

```typescript
// apps/api/src/routes/webhooks/whatsapp.ts

app.post('/webhooks/whatsapp', async (req, reply) => {
  const { from, body } = req.body
  
  // Find customer by phone number
  const customer = await prisma.customerUser.findFirst({
    where: { phone: from },
    include: { customerAccount: true }
  })
  
  if (!customer) {
    return reply.send({
      message: "I don't recognize this number. Please contact your lab directly."
    })
  }
  
  // Process with agent
  const agent = new CustomerServiceAgent()
  const response = await agent.handleMessage(
    customer.customerAccountId,
    body,
    'whatsapp'
  )
  
  // Send via WhatsApp API
  await sendWhatsAppMessage(from, response.message, response.buttons)
  
  return reply.send({ success: true })
})
```

---

## Channel Configuration

### Web Widget Embed

```html
<!-- Customer portal integration -->
<script src="https://app.hta-calibration.com/widget.js"></script>
<script>
  HTAWidget.init({
    tenantId: 'your-tenant-id',
    customerId: 'logged-in-customer-id',
    position: 'bottom-right',
    primaryColor: '#1e40af'
  })
</script>
```

### WhatsApp Business Setup

```yaml
# Configuration for WhatsApp Business API
whatsapp:
  provider: twilio  # or 360dialog
  business_number: "+91XXXXXXXXXX"
  greeting_message: "Welcome to {tenant_name} calibration services!"
  away_message: "We're currently offline. Leave a message and we'll respond soon."
  business_hours:
    timezone: "Asia/Kolkata"
    hours:
      - days: [mon, tue, wed, thu, fri]
        start: "09:00"
        end: "18:00"
```

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Support tickets/day | 20 | 5 |
| Avg response time | 4 hours | <1 minute |
| Resolution rate (AI) | 0% | 70% |
| Customer satisfaction | N/A | >4.5/5 |
