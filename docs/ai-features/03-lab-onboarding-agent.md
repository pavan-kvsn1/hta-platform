# Feature Spec: Lab Onboarding Agent

**Feature ID:** AI-003  
**Phase:** 2  
**Priority:** High  
**Status:** Planning

---

## Summary

An agentic AI that guides new calibration labs through the complete onboarding process - from uploading accreditation documents to creating their first certificate.

---

## Problem Statement

Current onboarding takes **2-3 days** and requires:
- Manual data entry of lab details
- Back-and-forth emails for document collection
- Manual creation of master instruments
- Training on platform features
- Setup of certificate templates

**Pain points:**
- High support burden (~4 hours per new tenant)
- Inconsistent setup quality
- Delayed time-to-first-certificate

---

## Solution: Conversational Onboarding Agent

```
┌─────────────────────────────────────────────────────────────────┐
│  🤖 HTA Onboarding Assistant                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Agent: Welcome to HTA! I'm your onboarding assistant.         │
│         I'll help you set up your calibration lab in about     │
│         30 minutes. Let's start!                               │
│                                                                 │
│         First, could you upload your NABL accreditation        │
│         certificate? I'll extract your lab details and         │
│         scope automatically.                                   │
│                                                                 │
│         [📎 Upload NABL Certificate]                           │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  User: *uploads NABL-cert.pdf*                                 │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Agent: Great! I found the following from your certificate:    │
│                                                                 │
│         📋 Lab Details                                          │
│         ├─ Name: Precision Calibration Services               │
│         ├─ NABL Cert #: CC-2847                                │
│         ├─ Valid until: 2028-03-15                             │
│         └─ Address: 45 Tech Park, Bangalore                    │
│                                                                 │
│         📐 Accredited Scope (23 parameters found)              │
│         ├─ Electro-Technical: DC Voltage, AC Voltage,          │
│         │   Resistance, Current, Frequency                     │
│         ├─ Mechanical: Pressure, Force, Torque                 │
│         └─ Thermal: Temperature                                │
│                                                                 │
│         Is this correct? [✓ Yes, continue] [✏️ Edit]           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Agent Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                    ONBOARDING AGENT FLOW                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐                                                │
│  │   START     │                                                │
│  └──────┬──────┘                                                │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ STEP 1: Document Collection                             │   │
│  │ • Upload NABL certificate                               │   │
│  │ • Upload logo (optional)                                │   │
│  │ • Parse and extract lab details                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ STEP 2: Scope Analysis                                  │   │
│  │ • Extract accredited parameters                         │   │
│  │ • Match to standard categories                          │   │
│  │ • Identify CMC (Calibration Measurement Capability)     │   │
│  └─────────────────────────────────────────────────────────┘   │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ STEP 3: Master Instruments                              │   │
│  │ • Ask about reference standards                         │   │
│  │ • Create master instrument entries                      │   │
│  │ • Set up calibration due dates                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ STEP 4: User Setup                                      │   │
│  │ • Identify admin users                                  │   │
│  │ • Identify engineers                                    │   │
│  │ • Send invitations                                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ STEP 5: First Certificate                               │   │
│  │ • Guide through first cert creation                     │   │
│  │ • Suggest template based on scope                       │   │
│  │ • Verify understanding                                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────┐                                                │
│  │  COMPLETE   │                                                │
│  └─────────────┘                                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Agent Implementation

### Agent Definition

```typescript
// apps/api/src/agents/onboarding/agent.ts

import Anthropic from '@anthropic-ai/sdk'

const ONBOARDING_TOOLS = [
  {
    name: 'parse_nabl_certificate',
    description: 'Extract lab details and scope from uploaded NABL certificate PDF',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'GCS path to uploaded PDF' }
      },
      required: ['file_path']
    }
  },
  {
    name: 'create_tenant',
    description: 'Create a new tenant with the extracted lab details',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        nabl_number: { type: 'string' },
        address: { type: 'string' },
        valid_until: { type: 'string', format: 'date' }
      },
      required: ['name', 'nabl_number']
    }
  },
  {
    name: 'create_master_instruments',
    description: 'Batch create master instruments from a list',
    input_schema: {
      type: 'object',
      properties: {
        instruments: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              category: { type: 'string' },
              description: { type: 'string' },
              make: { type: 'string' },
              model: { type: 'string' },
              serial_number: { type: 'string' },
              calibration_due: { type: 'string', format: 'date' }
            }
          }
        }
      },
      required: ['instruments']
    }
  },
  {
    name: 'invite_users',
    description: 'Send invitation emails to staff members',
    input_schema: {
      type: 'object',
      properties: {
        users: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              email: { type: 'string' },
              name: { type: 'string' },
              role: { enum: ['ADMIN', 'ENGINEER'] }
            }
          }
        }
      },
      required: ['users']
    }
  },
  {
    name: 'create_certificate_template',
    description: 'Create a certificate template for a parameter type',
    input_schema: {
      type: 'object',
      properties: {
        parameter_type: { type: 'string' },
        default_points: { type: 'array', items: { type: 'number' } },
        uncertainty_formula: { type: 'string' }
      },
      required: ['parameter_type']
    }
  },
  {
    name: 'send_message',
    description: 'Send a message to the user in the chat',
    input_schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        options: { 
          type: 'array', 
          items: { type: 'string' },
          description: 'Optional buttons for user to click'
        }
      },
      required: ['message']
    }
  }
]

const SYSTEM_PROMPT = `You are HTA's onboarding assistant. Your job is to help new calibration labs get set up on the platform.

## Personality
- Friendly and professional
- Patient with non-technical users
- Proactive in suggesting next steps

## Onboarding Steps
1. Collect NABL certificate → extract lab details and scope
2. Confirm extracted information with user
3. Ask about master/reference instruments
4. Set up staff users (admins, engineers)
5. Guide through first certificate creation

## Guidelines
- Always confirm extracted data before creating records
- Explain what you're doing and why
- Offer to skip optional steps
- Celebrate progress ("Great! Lab details saved ✓")
- If user seems stuck, offer specific help

## Tools Available
- parse_nabl_certificate: Extract info from uploaded PDFs
- create_tenant: Set up the lab account
- create_master_instruments: Add reference standards
- invite_users: Send team invitations
- create_certificate_template: Set up default templates
- send_message: Communicate with user`

export class OnboardingAgent {
  private client: Anthropic
  private conversationHistory: Anthropic.MessageParam[] = []
  private tenantId: string | null = null
  
  constructor() {
    this.client = new Anthropic()
  }
  
  async processMessage(userMessage: string, attachments?: string[]): Promise<string> {
    // Add user message to history
    this.conversationHistory.push({
      role: 'user',
      content: userMessage
    })
    
    // If there are attachments, note them
    if (attachments?.length) {
      this.conversationHistory.push({
        role: 'user',
        content: `[User uploaded files: ${attachments.join(', ')}]`
      })
    }
    
    // Run agent loop
    let response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: ONBOARDING_TOOLS,
      messages: this.conversationHistory
    })
    
    // Process tool calls
    while (response.stop_reason === 'tool_use') {
      const toolUse = response.content.find(c => c.type === 'tool_use')
      if (!toolUse) break
      
      // Execute the tool
      const toolResult = await this.executeTool(toolUse.name, toolUse.input)
      
      // Add to conversation
      this.conversationHistory.push({
        role: 'assistant',
        content: response.content
      })
      this.conversationHistory.push({
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify(toolResult)
        }]
      })
      
      // Continue the loop
      response = await this.client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: ONBOARDING_TOOLS,
        messages: this.conversationHistory
      })
    }
    
    // Extract final text response
    const textContent = response.content.find(c => c.type === 'text')
    const finalMessage = textContent?.text || 'I encountered an issue. Please try again.'
    
    this.conversationHistory.push({
      role: 'assistant',
      content: response.content
    })
    
    return finalMessage
  }
  
  private async executeTool(name: string, input: any): Promise<any> {
    switch (name) {
      case 'parse_nabl_certificate':
        return await this.parseNABLCertificate(input.file_path)
      case 'create_tenant':
        return await this.createTenant(input)
      case 'create_master_instruments':
        return await this.createMasterInstruments(input.instruments)
      case 'invite_users':
        return await this.inviteUsers(input.users)
      case 'create_certificate_template':
        return await this.createTemplate(input)
      case 'send_message':
        return { sent: true, message: input.message }
      default:
        return { error: `Unknown tool: ${name}` }
    }
  }
  
  private async parseNABLCertificate(filePath: string) {
    // Use document AI to extract structured data
    const content = await extractPDFContent(filePath)
    
    const extraction = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `Extract the following from this NABL certificate:
        
1. Lab name
2. NABL certificate number
3. Valid until date
4. Address
5. Accredited scope (list of parameters with ranges and CMC)

Certificate content:
${content}

Return as JSON.`
      }]
    })
    
    return JSON.parse(extraction.content[0].text)
  }
  
  private async createTenant(input: any) {
    const tenant = await prisma.tenant.create({
      data: {
        name: input.name,
        slug: slugify(input.name),
        settings: {
          nablNumber: input.nabl_number,
          nablValidUntil: input.valid_until,
          address: input.address
        }
      }
    })
    this.tenantId = tenant.id
    
    // Create default subscription
    await prisma.tenantSubscription.create({
      data: {
        tenantId: tenant.id,
        tier: 'STARTER',
        status: 'TRIALING'
      }
    })
    
    return { success: true, tenantId: tenant.id }
  }
  
  private async createMasterInstruments(instruments: any[]) {
    const created = await prisma.masterInstrument.createMany({
      data: instruments.map(inst => ({
        tenantId: this.tenantId!,
        instrumentId: randomUUID(),
        category: inst.category,
        description: inst.description,
        make: inst.make,
        model: inst.model,
        serialNumber: inst.serial_number,
        calibrationDue: inst.calibration_due ? new Date(inst.calibration_due) : null,
        version: 1,
        isLatest: true
      }))
    })
    
    return { success: true, count: created.count }
  }
  
  private async inviteUsers(users: any[]) {
    const results = []
    for (const user of users) {
      const created = await prisma.user.create({
        data: {
          tenantId: this.tenantId!,
          email: user.email,
          name: user.name,
          role: user.role,
          isAdmin: user.role === 'ADMIN',
          passwordHash: '', // Will be set on first login
          isActive: false   // Activated on invitation acceptance
        }
      })
      
      // Send invitation email
      await sendInvitationEmail(user.email, user.name, this.tenantId!)
      
      results.push({ email: user.email, invited: true })
    }
    
    return { success: true, results }
  }
  
  private async createTemplate(input: any) {
    // Store template in tenant settings
    await prisma.tenant.update({
      where: { id: this.tenantId! },
      data: {
        settings: {
          update: {
            templates: {
              push: {
                parameterType: input.parameter_type,
                defaultPoints: input.default_points,
                uncertaintyFormula: input.uncertainty_formula
              }
            }
          }
        }
      }
    })
    
    return { success: true }
  }
}
```

---

## Conversation Examples

### Happy Path

```
Agent: Welcome! Upload your NABL certificate to get started.

User: *uploads certificate*

Agent: Found it! Your lab "Precision Calibration Services" (NABL CC-2847) 
       is accredited for 23 parameters. Is this correct?
       [✓ Yes] [✏️ Edit]

User: Yes

Agent: Great! ✓ Lab details saved.
       
       Now, let's add your reference standards. What master instruments 
       do you use? You can list them or upload a spreadsheet.

User: We have a Fluke 5520A calibrator and a Fluke 8846A DMM

Agent: I'll add those:
       • Fluke 5520A Multi-Product Calibrator
       • Fluke 8846A 6.5 Digit Precision Multimeter
       
       When are they due for calibration?

User: The 5520A is due in June, the 8846A in September

Agent: ✓ Master instruments added with due dates.
       
       Who should have access to the system?
       • Admin (full access, can approve certs)
       • Engineer (create and edit certs)

User: rajesh@precision.com as admin, amit@precision.com as engineer

Agent: Sending invitations now...
       ✓ Rajesh (Admin) invited
       ✓ Amit (Engineer) invited
       
       You're all set! Would you like me to walk you through 
       creating your first certificate?
       [Yes, show me] [I'll explore on my own]
```

---

## API Endpoints

```typescript
// Start onboarding session
POST /api/ai/onboarding/start
Response: { sessionId: "uuid", welcomeMessage: "..." }

// Send message to agent
POST /api/ai/onboarding/message
{
  "sessionId": "uuid",
  "message": "Here's my NABL cert",
  "attachments": ["gs://bucket/nabl-cert.pdf"]
}

// Get session status
GET /api/ai/onboarding/:sessionId/status
Response: {
  "step": "master_instruments",
  "completedSteps": ["documents", "lab_details"],
  "tenantId": "uuid"
}
```

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Onboarding time | 2-3 days | 30 minutes |
| Support hours/tenant | 4 hours | 15 minutes |
| Time to first cert | 3 days | Same day |
| Setup completion rate | 70% | 95% |
