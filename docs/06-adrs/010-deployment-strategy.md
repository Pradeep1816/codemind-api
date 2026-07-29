This ADR defines how CodeMind will be developed, deployed, scaled, and operated.

The deployment architecture must support:

Backend API
Background workers
AI processing
Repository indexing
MCP server
Search services
Database
Storage
Monitoring

The principle:

"Start simple for development, but design for enterprise-scale deployment."

Create:

docs/06-adrs/010-deployment-strategy.md

Content:

# ADR-010: Deployment Strategy


## Status

Accepted


## Date

2026-07-29


## Decision Makers

CodeMind Engineering Team



# 1. Context


CodeMind contains multiple processing workloads.



Examples:



API Requests

Repository Indexing

Code Parsing

Embedding Generation

AI Processing

MCP Requests

Search Queries




These workloads have different resource requirements.



Example:



API:



Needs:

Low latency

Fast response




Indexer:



Needs:

CPU

Memory

Long running execution




AI Worker:



Needs:

Network

Model API access

Processing time




Therefore CodeMind requires a deployment strategy that supports
independent scaling.



# 2. Deployment Requirements



The system must support:



## Developer Environment



Developers should run locally:




Backend

Database

Redis

Storage

Workers




---



## Production Environment



Must support:




High availability

Scaling

Monitoring

Security

Backup




---



## Continuous Delivery



Need:




Automatic build

Testing

Deployment

Rollback




---



## Infrastructure Management



Infrastructure should be:




Version controlled

Repeatable

Automated




# 3. Options Considered



# Option 1: Single Server Deployment



Architecture:




Server

|

+-- NestJS API

+-- Workers

+-- PostgreSQL

+-- Redis




Advantages:


- Simple
- Cheap
- Easy setup



Problems:


- Limited scaling
- Single point of failure
- Resource conflicts



Decision:


Rejected for production.



---



# Option 2: Docker Based Deployment



Architecture:




Docker Host

|

+-- API Container

+-- Worker Container

+-- PostgreSQL Container

+-- Redis Container




Advantages:


- Consistent environment
- Easy deployment
- Developer friendly



Decision:


Selected initially.



---



# Option 3: Kubernetes Deployment



Architecture:




Kubernetes Cluster

|

+-- API Pods

+-- Worker Pods

+-- AI Workers

+-- Database Services




Advantages:


- Auto scaling
- High availability
- Enterprise ready



Problems:


- More operational complexity



Decision:


Future production scaling option.



# 4. Decision



CodeMind will use a progressive deployment strategy.



## Phase 1


Docker based deployment.



## Phase 2


Cloud deployment.



## Phase 3


Kubernetes based enterprise deployment.



# 5. Initial Architecture



Development:




Developer Machine

    |

    v

Docker Compose

    |

+------+-------+

| |

NestJS API Workers

| |

PostgreSQL Redis

|

Object Storage




# 6. Production Architecture



Future:



             Load Balancer


                   |


          +--------+--------+

          |                 |


       API Pods        MCP Server


          |


          v


      Message Queue


          |


  +-------+--------+

  |                |

Index Workers AI Workers

  |                |


  +-------+--------+

          |


   Database + Storage



# 7. Container Strategy



Each major service has its own container.



Example:




codemind-api

codemind-worker

codemind-mcp

codemind-indexer




Benefits:


- Independent deployment
- Independent scaling
- Fault isolation



# 8. Docker Compose Development



Local services:



```yaml
services:

 api

 worker

 postgres

 redis

 minio


Purpose:

One command startup:


docker compose up

9. CI/CD Strategy

Pipeline:

Git Push


   |

   v


Run Tests


   |

   v


Build Docker Image


   |

   v


Security Scan


   |

   v


Deploy


10. Repository Deployment Flow

When new code is merged:

GitHub


 |

 v


CI Pipeline


 |

 v


Docker Registry


 |

 v


Deployment Environment

11. Infrastructure as Code

Infrastructure should be managed using:

Examples:

Terraform

OpenTofu

CloudFormation


Store:

Database

Networking

Storage

Compute

Secrets


as code.

12. Environment Strategy

CodeMind environments:

Development

Purpose:

Local development

Testing features

Staging

Purpose:

Production-like testing

QA validation

Production

Purpose:

Real customer workloads

13. Configuration Management

Environment variables:

Example:

DATABASE_URL

REDIS_URL

OPENAI_API_KEY

STORAGE_BUCKET

JWT_SECRET


Secrets should be managed using:

Future:

AWS Secrets Manager

Hashicorp Vault

Kubernetes Secrets

14. Scaling Strategy
API Scaling

Increase replicas:

2 API instances


        |


20 API instances

Worker Scaling

Scale based on queue:

Example:

1000 indexing jobs


        |


Increase workers

AI Worker Scaling

Independent because AI workloads are expensive.

15. Monitoring Strategy

Monitor:

Application Metrics
Request latency

Error rate

API usage

Worker Metrics
Queue size

Job duration

Failed jobs

Retry count

Infrastructure Metrics
CPU

Memory

Disk

Network

16. Logging Strategy

Centralized logging:

Application Logs


        |


        v


Log Platform


        |


        v


Search + Alerts


Future tools:

ELK

Grafana Loki

Datadog

17. Health Checks

Every service exposes:

/health


Example:

{
 "status":"healthy",
 "database":"connected",
 "queue":"connected"
}
18. Backup Strategy

Backup:

Database:

Daily Backup

Point-in-time Recovery


Storage:

Versioning

Replication

Snapshots

19. Disaster Recovery

Plan:

Failure Scenario

Example:

Database Failure


Recovery:

Restore Backup

Reconnect Services

Verify Data

20. Security Considerations

Deployment security:

Private networks
Encrypted communication
Secret management
Container scanning
Dependency scanning
21. Future Enterprise Architecture

Large scale:

Kubernetes


      |

      +-- API Gateway

      +-- Auth Service

      +-- Indexing Service

      +-- Search Service

      +-- AI Service

      +-- MCP Service

      +-- Worker Cluster

      +-- Data Layer

22. Consequences
Positive
Scalable Foundation

Can grow from small projects to enterprise.

Independent Services

Different workloads scale separately.

Reliable Deployment

Automation reduces mistakes.

Developer Friendly

Local environment is simple.

Negative
Operational Complexity

More services require management.

Infrastructure Cost

Production scaling increases cost.

Monitoring Requirement

Distributed systems require observability.

23. Final Decision Summary
Area	Decision
Development	Docker Compose
Containerization	Docker
CI/CD	Automated Pipeline
Infrastructure	Terraform/OpenTofu
Initial Production	Cloud Deployment
Future Scale	Kubernetes
Workers	Independently Scalable
Monitoring	Metrics + Logs
Conclusion

CodeMind deployment follows a gradual scaling approach.

Start:

Docker Compose

+

Single Environment


Grow:

Cloud

+

Multiple Services


Enterprise:

Kubernetes

+

Distributed Intelligence Platform


Final decision:

"Build simple first, scale architecture when the product proves demand."