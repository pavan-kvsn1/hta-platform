# AI Features Roadmap for HTA Platform

**Version:** 1.0  
**Created:** 2026-04-17  
**Status:** Planning

---

## Overview

This document outlines the AI/ML features planned for the HTA Calibration Platform. The features are organized into phases, starting with foundational RAG capabilities and progressing to fully autonomous agentic workflows.

## Business Context

HTA Platform is a B2B2B calibration certificate management system:
- **HTA** (Platform) → **Calibration Labs** (Tenants) → **Their Customers**

AI features should reduce manual work for:
1. **Lab Engineers** - Certificate creation, data entry
2. **Lab Admins/Reviewers** - Quality checks, approvals
3. **Customers** - Status inquiries, certificate requests
4. **Platform Ops** - Tenant onboarding, support

---

## Feature Index

| # | Feature | Phase | Priority | Doc |
|---|---------|-------|----------|-----|
| 1 | [Knowledge Base RAG](#1-knowledge-base-rag) | 1 | High | [spec](./01-knowledge-base-rag.md) |
| 2 | [Certificate Intelligence](#2-certificate-intelligence) | 1 | High | [spec](./02-certificate-intelligence.md) |
| 3 | [Lab Onboarding Agent](#3-lab-onboarding-agent) | 2 | High | [spec](./03-lab-onboarding-agent.md) |
| 4 | [Review Assistant Agent](#4-review-assistant-agent) | 2 | Medium | [spec](./04-review-assistant-agent.md) |
| 5 | [Customer Service Agent](#5-customer-service-agent) | 3 | Medium | [spec](./05-customer-service-agent.md) |
| 6 | [Anomaly Detection](#6-anomaly-detection) | 3 | Medium | [spec](./06-anomaly-detection.md) |
| 7 | [Code Maintenance Agent](#7-code-maintenance-agent) | 4 | Low | [spec](./07-code-maintenance-agent.md) |

---

## Phase Overview

### Phase 1: RAG Foundation (Month 1-2)
Build the knowledge retrieval layer that powers all other features.

```
┌─────────────────────────────────────────────────────────────┐
│                    PHASE 1: RAG FOUNDATION                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │    SOPs     │    │  Standards  │    │ Historical  │     │
│  │  Manuals    │    │  IS/ISO     │    │   Certs     │     │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘     │
│         │                  │                  │             │
│         ▼                  ▼                  ▼             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              EMBEDDING + VECTOR STORE               │   │
│  │                    (pgvector)                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│                          ▼                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Q&A INTERFACE FOR ENGINEERS            │   │
│  │   "What's the uncertainty formula for DC voltage?"  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Phase 2: Agentic Workflows (Month 3-4)
Introduce agents that can take actions, not just answer questions.

```
┌─────────────────────────────────────────────────────────────┐
│                 PHASE 2: AGENTIC WORKFLOWS                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────┐    ┌─────────────────────┐        │
│  │  ONBOARDING AGENT   │    │   REVIEW ASSISTANT  │        │
│  ├─────────────────────┤    ├─────────────────────┤        │
│  │ • Parse NABL cert   │    │ • Check calculations│        │
│  │ • Extract scope     │    │ • Flag anomalies    │        │
│  │ • Create instruments│    │ • Suggest comments  │        │
│  │ • Setup templates   │    │ • Validate specs    │        │
│  └─────────────────────┘    └─────────────────────┘        │
│           │                          │                      │
│           ▼                          ▼                      │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                   TOOL LAYER                        │   │
│  │  [Create User] [Add Instrument] [Update Cert] ...   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Phase 3: Customer-Facing AI (Month 5-6)
Extend AI capabilities to customer touchpoints.

### Phase 4: Advanced Intelligence (Month 7+)
Predictive analytics, code maintenance, autonomous operations.

---

## Technical Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         HTA AI ARCHITECTURE                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │   Web App   │  │   Mobile    │  │  WhatsApp   │   INTERFACES    │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                 │
│         │                │                │                         │
│         └────────────────┼────────────────┘                         │
│                          ▼                                          │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                      API GATEWAY                            │   │
│  │                   (Fastify + Auth)                          │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                          │                                          │
│         ┌────────────────┼────────────────┐                         │
│         ▼                ▼                ▼                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │   AI API    │  │  Core API   │  │  Worker     │   SERVICES      │
│  │  (agents)   │  │ (business)  │  │  (async)    │                 │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                 │
│         │                │                │                         │
│         └────────────────┼────────────────┘                         │
│                          ▼                                          │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    DATA LAYER                               │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │   │
│  │  │PostgreSQL│  │ pgvector │  │  Redis   │  │   GCS    │    │   │
│  │  │  (data)  │  │(embeddings)│ │ (cache)  │  │ (files)  │    │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                          │                                          │
│                          ▼                                          │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                   EXTERNAL AI SERVICES                      │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │   │
│  │  │  Claude  │  │  OpenAI  │  │  Cohere  │                  │   │
│  │  │   API    │  │Embeddings│  │(fallback)│                  │   │
│  │  └──────────┘  └──────────┘  └──────────┘                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack Recommendation

| Component | Recommended | Alternatives | Notes |
|-----------|-------------|--------------|-------|
| **LLM** | Claude API (Sonnet) | GPT-4o, Gemini | Best for complex reasoning |
| **Embeddings** | OpenAI text-embedding-3-small | Cohere, Voyage | Cost-effective, good quality |
| **Vector DB** | pgvector | Pinecone, Qdrant | Keep in existing Postgres |
| **Agent Framework** | Claude tool_use | LangGraph, CrewAI | Native, simpler |
| **Orchestration** | BullMQ | - | Already in stack |
| **Document Processing** | Unstructured.io | LlamaParse | PDF/image extraction |

---

## Cost Estimates

> **Detailed analysis:** [08-cost-analysis.md](./08-cost-analysis.md)

| Phase | Features | Monthly Cost | One-Time Setup |
|-------|----------|--------------|----------------|
| **Phase 1** | RAG + Certificate Intelligence | $40-80 | $50 |
| **Phase 2** | Onboarding + Review Agents | $60-120 | $100 |
| **Phase 3** | Customer Service + Anomaly | $80-150 | $200 |
| **Phase 4** | Code Maintenance | $5-20 | $0 |
| **Total (all phases)** | | **$185-370/mo** | **$350** |

### Cost Optimization

- Use **Claude Haiku** for 70% of tasks (80% cheaper than Sonnet)
- **Cache** common queries (30-50% savings)
- **Batch** operations where possible (20-40% savings)

### ROI Summary

| Metric | Value |
|--------|-------|
| Monthly AI cost (medium) | ~$275 (₹22,000) |
| Time saved | 277 hours/month |
| Value created | ₹138,500/month |
| **ROI** | **530%** |
| Payback period | < 1 month |

---

## Success Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Cert creation time | 45 min | 15 min | Avg time draft→submit |
| Review time | 20 min | 8 min | Avg time submit→approved |
| Onboarding time | 2 days | 2 hours | New tenant → first cert |
| Support tickets | 50/week | 20/week | Customer inquiries |
| First-pass approval | 60% | 85% | Certs approved without revision |

---

## Related Documents

- [01-knowledge-base-rag.md](./01-knowledge-base-rag.md) - RAG system spec
- [02-certificate-intelligence.md](./02-certificate-intelligence.md) - Auto-fill & validation
- [03-lab-onboarding-agent.md](./03-lab-onboarding-agent.md) - Onboarding automation
- [04-review-assistant-agent.md](./04-review-assistant-agent.md) - Review workflow
- [05-customer-service-agent.md](./05-customer-service-agent.md) - Customer-facing bot
- [06-anomaly-detection.md](./06-anomaly-detection.md) - Outlier detection
- [07-code-maintenance-agent.md](./07-code-maintenance-agent.md) - Code maintenance
- [08-cost-analysis.md](./08-cost-analysis.md) - Detailed cost breakdown & ROI

---

## Appendix: Glossary

| Term | Definition |
|------|------------|
| **RAG** | Retrieval-Augmented Generation - combining search with LLM |
| **Agentic AI** | AI that can take actions, not just generate text |
| **Tool Use** | LLM capability to call functions/APIs |
| **Embedding** | Vector representation of text for similarity search |
| **NABL** | National Accreditation Board for Testing and Calibration Laboratories |
| **UUC** | Unit Under Calibration (the instrument being calibrated) |
