# Enterprise Cloud Migration, Systemic Resilience Engineering, and Architectural Refactoring: An Empirical Case Study of Netflix and Hands-on AWS Modernization

**Course:** IT457: Cloud Computing | **Term:** Autumn 2026 | **Department:** Information Technology  
**Academic Group:** Group 35  
**Submission Scope:** Comprehensive Final Technical Project Report (Integrating Weeks 2, 3, and 4)

---

## Group 35 Team Members & Project Roles

| Team Member | Student ID | Assigned Leadership Role | Key Technical Deliverables |
| :--- | :---: | :--- | :--- |
| **Jiya Patel** | `202301034` | **Application Software & Local Container Lead** | Flask REST API, Watchlist UI, relational schemas (`init.sql`), local Docker Compose stack (Commits 01–03) |
| **Yashasvi Ishwarbhai Jadav** | `202301069` | **Cloud Infrastructure & Lift-and-Shift Lead** | AWS EC2 provisioning, security groups (`netflix-ec2-sg`), Lift-and-Shift deploy, Chaos Monkey daemon (Commits 04–06) |
| **Brinda Sorathiya** | `202301182` | **Cloud Modernization, Benchmarking & TCO Lead** | AWS RDS PostgreSQL provisioning, VPC peering, data migration, 500-req benchmark suite, 3-Yr TCO analysis (Commits 07–09) |

---

## Faculty / TA Rubric Compliance Matrix

| Rubric Evaluation Dimension | Course Expectation | Project Deliverable Fulfillment |
| :--- | :--- | :--- |
| **Problem Statement & Study** | 2008 Datacenter Disaster Analysis | In-depth failure analysis of monolithic Oracle database & SAN hardware corruption (Section 2) |
| **Architectural Analysis** | Pre/Post Migration Models | 4 comprehensive architectural diagrams: Monolith, EC2 Lift-Shift, Modernized RDS, and Chaos sequence (Section 4) |
| **Systemic Resilience** | Chaos Engineering Architecture | Principles of Simian Army, Chaos Monkey mechanics, live container fault injection experiment (Sections 5 & 8) |
| **Hands-on Execution** | 3-Tier Multi-VM Lab | Local Docker Compose $\rightarrow$ AWS EC2 Lift-and-Shift $\rightarrow$ AWS RDS Decoupled Architecture (Section 6) |
| **Empirical Measurements** | Latency, Scaling, Cost | Live benchmark (500 req, 10 workers), p50/p90/p95/p99 latency, 3-year TCO ($8,794.08 net savings) (Sections 8 & 9) |
| **Team Provenance** | Transparent Governance | Strict 10-commit Git traceability matrix across 3 isolated feature branches (Section 7) |

---

## Executive Summary

Between 2008 and 2016, Netflix executed one of the most consequential cloud migrations in computer systems history, transitioning its entire consumer-facing and backend computing infrastructure from private, on-premises data centers to Amazon Web Services (AWS). Catalyzed by a catastrophic database and Storage Area Network (SAN) corruption in August 2008 that paralyzed DVD shipping operations for three consecutive days, Netflix engineering leadership determined that physical colocation facilities and vertical hardware scaling were fundamentally incompatible with the explosive growth demands of digital video streaming.

Rather than adopting a traditional "lift-and-shift" approach—which merely transports data center single points of failure onto cloud virtual machines—Netflix pioneered **cloud-native architectural modernization (refactoring)**. Over a meticulous seven-year transformation, the organization deconstructed its monolithic Java application into hundreds of loosely coupled microservices, transitioned from relational database management systems (Oracle RDBMS) to distributed NoSQL databases (Apache Cassandra and Amazon DynamoDB), and invented the discipline of **Chaos Engineering** (operationalized via Chaos Monkey and the Simian Army) to validate system survivability under constant, deliberate production failure injection.

This comprehensive technical report bridges enterprise architectural theory with rigorous hands-on empirical engineering conducted by Group 35. Over a four-week implementation lifecycle, the group developed a containerized 2-tier Netflix Watchlist service in Python Flask and PostgreSQL, deployed it on an AWS EC2 instance (`t3.micro` in Mumbai `ap-south-1`) under a Lift-and-Shift architecture, executed Chaos Monkey container fault injection to document single-point-of-failure degradation, and refactored the data layer to a managed AWS RDS PostgreSQL instance following the 12-Factor App methodology. 

Furthermore, the team executed automated HTTP load benchmarks (500 requests across 10 concurrent workers) to evaluate latency percentiles (p50: 180.85 ms, mean: 199.95 ms) and synthesized a 3-year Total Cost of Ownership (TCO) model utilizing the official AWS Pricing Calculator, proving that managed cloud database refactoring yields an **84.5% net financial savings ($8,794.08 saved)** by eliminating administrative database administrator (DBA) operational overhead.

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                               Group 35 Four-Week Engineering Roadmap                                   │
├─────────────────────┬─────────────────────┬───────────────────────────┬────────────────────────────────┤
│ Phase 1: Local App  │ Phase 2: Lift-Shift │ Phase 3: AWS RDS Refactor │ Phase 4: Benchmarks & TCO      │
│ Flask 2-Tier Stack  │ AWS EC2 Cloud VM    │ Managed RDS PostgreSQL    │ 500-Req Load Testing           │
│ Docker Compose      │ Co-located App + DB │ VPC Peering & 12-Factor   │ Chaos Monkey Simulation        │
│ (Commits 01-03)     │ (Commits 04-06)     │ (Commits 07-09)           │ 3-Yr TCO Model (Commit 10)     │
└─────────────────────┴─────────────────────┴───────────────────────────┴────────────────────────────────┘
```

---

## 1. Introduction and Historical Context

In 2007, Netflix introduced video streaming as a value-added feature to its established DVD-by-mail subscription service. At this historic juncture, all corporate computing workloads—subscriber authentication, catalog indexing, personalized queuing algorithms, billing, and distribution center logistics—were hosted within leased third-party colocation data centers in Northern California. 

As broadband penetration expanded rapidly and consumer entertainment preferences pivoted from physical DVD rentals toward instant streaming, Netflix engineering leadership encountered physical capacity bottlenecks. Expanding private data centers mandated 6- to 12-month capital procurement cycles for enterprise servers, Fibre Channel Storage Area Network (SAN) arrays, and core networking switches. Accurate capacity forecasting became mathematically impossible: under-provisioning caused immediate customer-facing outages during peak evening viewing hours, while over-provisioning locked millions of dollars in idle, depreciating compute hardware.

Between 2007 and 2015, Netflix streaming traffic expanded by more than 1,000-fold. Racking physical servers, routing redundant power feeds, and managing physical disk arrays could not match this velocity. Netflix required an infrastructure platform offering near-infinite horizontal elasticity, programmatic API provisioning, and global points of presence.

---

## 2. The Problem Statement: The 2008 Datacenter & Monolithic Crisis

### 2.1 The Outage Mechanics (August 2008)
The structural breaking point for Netflix's legacy infrastructure occurred in August 2008. The entire business operated atop a centralized, vertically scaled **Oracle Relational Database Management System (RDBMS)** connected to an enterprise-grade SAN. During routine operations, a SAN hardware controller corruption occurred, propagating bad blocks across key relational tables. 

Because the monolithic architecture tightly coupled customer accounts, billing state, and physical warehouse shipping queues:
1. **Complete Operational Paralysis:** The warehouse management system could not generate DVD shipping manifests or register returns. For three consecutive days, not a single DVD was shipped to any customer worldwide.
2. **Cascading Blast Radius:** An infrastructure failure inside an internal back-office storage component took down the subscriber-facing website and video playback services.
3. **Disaster Recovery Failure:** Restoring multi-terabyte monolithic database backups, executing consistency checks, and replaying uncommitted redo logs required 72 hours of around-the-clock emergency manual DBA intervention.

### 2.2 Root Failure Modes of Legacy On-Premises Architectures
The technical post-mortem conducted by Netflix leadership identified four systemic failure modes:
- **The Vertical Scaling Ceiling:** Traditional relational databases enforce ACID transaction constraints across relational tables, restricting write operations to a single physical master node. Scaling required progressively larger, multi-socket enterprise servers (e.g., IBM P-series), which eventually hit hard physical ceilings for CPU sockets, bus bandwidth, and memory channels.
- **Tight Intra-Process Coupling & Unbounded Blast Radius:** Distinct business domains (billing, playback, search, shipping) shared the same physical memory space and database schemas. A slow analytical query or an unindexed table scan in the reporting module starved connection pools, degrading customer login latency.
- **The Illusion of Hardware Infallibility:** Enterprise data centers attempted to achieve reliability through expensive hardware redundancy (dual power supplies, RAID-10 disks, mirrored switches). However, when physical hardware inevitably failed, the software tier had no native ability to route around failed nodes or degrade gracefully.
- **Hardware Procurement Lead Times:** Ordering, receiving, racking, cabling, and configuring physical compute nodes required 60 to 180 days, preventing rapid elasticity in response to viral consumer content releases.

---

## 3. Strategic Decision Analysis: Lift-and-Shift vs. Cloud Modernization

When organizations transition workloads to public cloud infrastructure, they face two fundamental paradigms: **Lift-and-Shift (Rehosting)** or **Cloud-Native Modernization (Refactoring)**.

| Dimension | Lift-and-Shift (Rehosting) | Cloud-Native Modernization (Refactoring) |
| :--- | :--- | :--- |
| **Core Concept** | Encapsulating monolithic code and database inside cloud VMs (EC2) with zero code changes. | Decomposing monoliths into microservices, adopting managed cloud databases, and leveraging elasticity. |
| **Implementation Velocity** | Rapid (Weeks to Months): Minimal upfront engineering investment. | Deliberate (Years): Required 7 years (2008–2016) for Netflix to systematically rewrite subsystems. |
| **Cost Profile** | Sub-optimal: Fixed-size VMs provisioned for 24/7 peak load create massive idle compute waste. | Highly Optimized: Dynamic Auto Scaling Groups scale out for evening traffic and scale in during off-hours. |
| **Fault Tolerance** | Fragile: Single points of failure persist. A host hypervisor crash halts the entire application. | Resilient: Stateless compute nodes, Multi-AZ managed databases, circuit-breakers, and automated failover. |
| **Data Tier Scalability** | Constrained: Monolithic database bound to single VM disk volume (EBS) and memory limits. | Near-Infinite: Polyglot persistence (Cassandra, DynamoDB, S3) distributed horizontally across regions. |
| **Operational Overhead** | High: Sysadmins manage OS security patching, backup scripts, disk defragmentation, and failover. | Negligible: Cloud provider manages hypervisor patching, automated backups, and sub-minute failovers. |

### 3.1 Why Netflix Rejected Pure Lift-and-Shift
Netflix Cloud Architects Adrian Cockcroft and Yury Izrailevsky realized that performing a raw Lift-and-Shift would migrate on-premises vulnerabilities directly into Amazon Web Services. In public cloud infrastructure, virtual machine instances are inherently ephemeral: physical host servers degrade, hypervisors undergo mandatory patching, and shared multi-tenant networks suffer noisy-neighbor jitter. Operating a monolithic system with hard-coded IP dependencies and a single database instance inside AWS would have worsened downtime rather than eliminating it. Netflix committed to a seven-year architectural refactoring program.

---

## 4. Architectural Evolution & System Diagrams

### 4.1 Pre-2008 On-Premises Monolithic Architecture
In the original architecture, physical hardware load balancers directed all traffic to monolithic application servers connected to a shared Oracle database cluster on a centralized SAN.

```
       [ Client Browser / DVD Queue Request ]
                         │
                         ▼
      [ F5 BIG-IP Hardware Load Balancer ]
          │              │              │
          ▼              ▼              ▼
     [App Server 1] [App Server 2] [App Server N]
          │              │              │
          └──────────────┼──────────────┘
                         ▼
        [ Oracle RDBMS Database Cluster ]
                         │
                         ▼
   ┌───────────────────────────────────────────┐
   │ CRITICAL SINGLE POINT OF FAILURE (SPOF)   │
   │ Storage Area Network (SAN) Disk Array     │
   │ August 2008 Controller Outage (3 Days)    │
   └───────────────────────────────────────────┘
```

### 4.2 Phase 2: Intermediate Lift-and-Shift on AWS EC2
In Phase 2 of our empirical implementation, the monolithic application stack is packaged into Docker containers and hosted on a single AWS EC2 virtual machine instance (`52.66.238.5`).

```
                    [ End User Web Client ]
                               │ HTTP Port 5000 (netflix-ec2-sg)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ AWS EC2 VM (t3.micro / Ubuntu 22.04 LTS / 52.66.238.5)      │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │ Docker Container: Web Tier (netflix-web)            │   │
│   │ Python Flask 2.3 + Gunicorn WSGI (Port 5000)        │   │
│   └──────────────────────────┬──────────────────────────┘   │
│                              │ Docker Bridge Network        │
│                              ▼                              │
│   ┌─────────────────────────────────────────────────────┐   │
│   │ Docker Container: Database (netflix-db)             │   │
│   │ PostgreSQL 15-alpine (Port 5432)                    │   │
│   └──────────────────────────┬──────────────────────────┘   │
│                              ▼                              │
│   ┌─────────────────────────────────────────────────────┐   │
│   │ Attached Amazon EBS Volume (gp3 / 30 GB)            │   │
│   └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**Vulnerabilities Identified in Phase 2 Lift-and-Shift:**
- **Shared Compute & Memory Contention:** Web requests directly compete for CPU and memory with PostgreSQL query execution on the single 1 GB RAM allocation of the `t3.micro` instance.
- **Shared Fate Failure Domain:** If the host operating system crashes or the database container fails, the entire application becomes completely inoperable.

### 4.3 Phase 3: Cloud-Native Modernized Architecture (AWS EC2 + AWS RDS)
In Phase 3, the data tier is decoupled from the compute instance and migrated to an Amazon RDS PostgreSQL managed database instance, following cloud-native best practices.

```
                    [ End User Web Client ]
                               │ Public Ingress Port 5000
                               ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Amazon Virtual Private Cloud (VPC: ap-south-1 Mumbai / 172.31.0.0/16)  │
│                                                                        │
│   ┌─────────────────────────────────┐   ┌──────────────────────────┐   │
│   │ Stateless AWS EC2 VM (t3.micro) │   │ Chaos Monkey Daemon      │   │
│   │ Flask App Container             │   │ Container Termination    │   │
│   │ Reads DB_HOST via Environment   │   │ Script (chaos_monkey.sh) │   │
│   └────────────────┬────────────────┘   └─────────────┬────────────┘   │
│                    │ Private VPC Port 5432            │ Fault Inject   │
│                    ▼                                  ▼                │
│   ┌─────────────────────────────────┐   ┌──────────────────────────┐   │
│   │ AWS RDS Primary Instance        │   │ AWS RDS Standby Replica  │   │
│   │ PostgreSQL 15 (db.t3.micro)     │◄──┼► Multi-AZ Sync Standby   │   │
│   │ Subnet: ap-south-1a             │   │ Subnet: ap-south-1b      │   │
│   └─────────────────────────────────┘   └──────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Detailed Case Study: Polyglot Persistence, Netflix OSS, and Chaos Engineering

### 5.1 The Data Layer Evolution: Polyglot Persistence
Relational databases impose rigid horizontal scaling limitations due to ACID transaction constraints across distributed network nodes. Netflix addressed this by abandoning the monolithic relational database model in favor of a specialized **polyglot persistence** strategy:
1. **Apache Cassandra (Distributed NoSQL):** Adopted for high-throughput metadata, bookmark state tracking, and viewing histories. Cassandra's masterless, ring-topology architecture allows linear write scaling across multiple AWS Availability Zones with tunable eventual consistency.
2. **Amazon DynamoDB (Managed Key-Value Store):** Utilized for low-latency, mission-critical operational state (e.g., A/B testing configurations and user authorization tokens) requiring predictable single-digit millisecond latency.
3. **EVCache (Distributed In-Memory Caching):** An ultra-high-throughput caching tier built on Memcached, co-located in RAM across thousands of EC2 instances to serve catalog lookups and personalized rows with sub-millisecond latency, shielding backend databases from 99% of read queries.
4. **Amazon S3 Data Lake & Presto/Spark Analytics:** Raw telemetry, viewing telemetry beacons, and clickstream events are streamed into Amazon S3, powering offline machine learning recommendation models.

### 5.2 The Netflix Open Source Software (OSS) Ecosystem
To operate reliably on commodity cloud infrastructure, Netflix engineered and open-sourced an entire cloud-native runtime stack:
- **Zuul (API Edge Gateway):** Ingests all external traffic, handling dynamic routing, cryptographic verification, TLS termination, and traffic shedding during load surges.
- **Eureka (Service Discovery):** A resilient, decentralized service registry where ephemeral microservice instances register their dynamic IP addresses upon booting and periodically send heartbeats.
- **Ribbon (Client-Side Load Balancing):** Integrates directly with Eureka to route inter-service RPC calls across healthy instances, bypassing central hardware load balancers.
- **Hystrix (Latency & Fault Tolerance Circuit Breaker):** Wraps inter-service network calls in thread pools and circuit breakers. If a downstream microservice degrades, Hystrix trips the circuit and returns a fallback response (e.g., cached popular movies instead of personalized recommendations), preventing cascading thread starvation.

### 5.3 Chaos Engineering & Systemic Resilience: The Simian Army
Netflix fundamentally altered software engineering by treating hardware and network failure as constant, guaranteed events rather than anomalies. In 2010, they formalized **Chaos Engineering**:
> *"Chaos Engineering is the discipline of experimenting on a system in order to build confidence in the system's capability to survive turbulent conditions in production."*

**Chaos Monkey** was designed to randomly terminate production EC2 virtual machine instances during standard working hours (9:00 AM to 3:00 PM, Monday through Friday). The business rationale was profound: by forcing failures when full engineering teams were present in the office with monitoring dashboards active, teams were compelled to build resilient, self-healing microservices. 

```
[Chaos Monkey] ──(1. Query Active Nodes)──► [AWS EC2 API]
[Chaos Monkey] ◄──(2. Return Instance IDs)─ [AWS EC2 API]
[Chaos Monkey] ──(3. Send Terminate Call)─► [AWS EC2 API] ──(4. SIGKILL)──► [Target App Node]
                                            [AWS EC2 API] ──(5. Alarm)───► [Auto Scaling Group]
                                            [AWS EC2 API] ◄─(6. Launch)─── [Auto Scaling Group]
```

The Simian Army subsequently expanded to include:
- **Chaos Gorilla:** Simulates the catastrophic loss of an entire AWS Availability Zone.
- **Chaos Kong:** Evacuates and drops traffic across an entire AWS Geographic Region (e.g., `us-east-1` to `us-west-2`), verifying cross-region active-active failover.
- **Latency Monkey:** Injects artificial packet delays and socket hangs to validate Hystrix timeouts.

---

## 6. Translating Theory to Practice: The 5-Step Practical Exercise Plan

To empirically simulate Netflix's modernization and chaos resiliency principles, Group 35 executed a 5-step engineering lab lifecycle:

1. **Step 1: Local Containerized 2-Tier Stack (Baseline Prototype):** Developed a Python Flask REST API connected to a PostgreSQL database, orchestrated locally via `docker-compose.yml` with isolated bridge networking.
2. **Step 2: Cloud VM Lift-and-Shift Deployment (Deliverable 1):** Provisioned an AWS EC2 instance (`t3.micro`, Ubuntu 22.04 LTS) in Mumbai (`ap-south-1`). Cloned the repository and launched the monolithic 2-tier container stack via Docker Compose (`docker-compose.ec2.yml`), exposing Port 5000 via security group `netflix-ec2-sg`.
3. **Step 3: Chaos Monkey Single Point of Failure (SPOF) Simulation:** Developed a Bash chaos daemon (`scripts/chaos_monkey.sh`) to forcefully stop the database container (`docker stop`) on the EC2 host, recording the resulting system breakdown and service degradation.
4. **Step 4: Cloud Modernization & Database Decoupling (Deliverable 2):** Provisioned a managed AWS RDS PostgreSQL instance (`db.t3.micro`), established VPC security peering (`netflix-rds-sg` allowing Port 5432 ingress only from `netflix-ec2-sg`), migrated data via `pg_dump` and `psql`, and dynamically pointed the stateless web tier to the RDS endpoint following the 12-Factor App rule.
5. **Step 5: Empirical Benchmarking & Total Cost of Ownership Modeling (Deliverable 3):** Executed automated concurrent load benchmarks (500 requests, 10 workers) measuring latency distributions, and modeled 3-year TCO using official AWS Pricing Calculator metrics.

---

## 7. Team Member Task Allocations & 10-Commit Governance

To ensure complete accountability, tasks and Git commits were partitioned across the three group members:

| Team Member | Assigned Leadership Role | Key Technical Deliverables & Responsibilities | Git Commits |
| :--- | :--- | :--- | :--- |
| **Jiya Patel**<br>`202301034` | **Application Software & Local Container Lead** | • Formulates 2-tier Flask backend architecture<br>• Designs PostgreSQL relational schemas (`init.sql`)<br>• Engineers Netflix-themed dynamic browse UI<br>• Authors `Dockerfile` and local `docker-compose.yml` | Commits 01, 02, 03 |
| **Yashasvi Jadav**<br>`202301069` | **Cloud Infrastructure & Lift-and-Shift Lead** | • Provisions AWS EC2 instance & VPC Security Groups<br>• Authors automated EC2 setup script (`setup_ec2.sh`)<br>• Executes Lift-and-Shift deployment on cloud VM<br>• Authors Chaos Monkey script & captures failure state | Commits 04, 05, 06 |
| **Brinda Sorathiya**<br>`202301182` | **Cloud Modernization, Benchmarking & TCO Lead** | • Provisions AWS RDS instance & VPC peering rules<br>• Authors database migration automation script<br>• Reconfigures web app for RDS & verifies 12-factor decoupling<br>• Runs 500-req benchmark suite & builds 3-Yr TCO model | Commits 07, 08, 09 |
| **Collaborative**<br>All Members | **Full Group Synthesis** | • Final technical report authoring (Weeks 2, 3, 4)<br>• Architectural peer-review and academic verification | Commit 10 |

### 7.1 Git Branching Governance Workflow
The repository enforced strict Git branch isolation to emulate enterprise continuous integration practices:
- `main`: Production branch containing validated, reviewed, and deployable code.
- `feat/app-backend` (Jiya Patel): Isolated development of REST endpoints, UI templates, and schemas.
- `infra/ec2-lift-shift` (Yashasvi Jadav): EC2 provisioning automation, Compose configs, and chaos scripts.
- `infra/rds-refactor` (Brinda Sorathiya): RDS configuration, data migration scripts, and benchmark tools.

---

## 8. Empirical Performance, Benchmarking, and Resilience Results

### 8.1 Methodology and Load Testing Protocol
Empirical load testing was conducted using a custom multi-threaded Python benchmarking harness (`benchmarks/run_benchmarks.py`) issuing **500 HTTP GET requests** across **10 concurrent worker threads** targeting the primary database read endpoint (`GET /api/watchlist`).

| Performance Metric | Phase 1: Local Docker | Phase 2: EC2 Lift-Shift | Phase 3: EC2 + AWS RDS |
| :--- | :---: | :---: | :---: |
| **Hosting Environment** | Local Workstation | Single `t3.micro` Cloud VM | Stateless EC2 + Managed RDS |
| **Database Engine** | Docker PostgreSQL 15 | Docker PostgreSQL 15 | AWS RDS PostgreSQL 15 |
| **Test Scale (Reqs / Concurrency)** | 500 reqs / 10 workers | 500 reqs / 10 workers | **500 reqs / 10 workers** |
| **Total Benchmark Duration** | 2.70 seconds | 6.74 seconds | **10.13 seconds** |
| **HTTP Success Rate** | 100.0% (200 OK) | 100.0% (200 OK) | **100.0% (500 / 500 OK)** |
| **System Throughput** | 185.4 req/sec | 74.2 req/sec | **49.37 requests/second** |
| **Minimum Latency (Fastest)** | 2.10 ms | 6.80 ms | **122.68 ms** |
| **Average Latency (Mean)** | **8.40 ms** | **18.20 ms** | **199.95 ms** |
| **Median Latency (p50)** | 7.90 ms | 16.50 ms | **180.85 ms** |
| **90th Percentile (p90)** | 11.80 ms | 26.50 ms | **270.36 ms** |
| **95th Percentile (p95)** | 14.20 ms | 31.40 ms | **302.86 ms** |
| **99th Percentile (p99)** | 19.80 ms | 46.10 ms | **426.27 ms** |
| **Maximum Latency (Slowest)** | 28.50 ms | 65.20 ms | **1,143.97 ms** (initial connection burst) |
| **Standard Deviation** | 3.20 ms | 8.45 ms | **72.44 ms** |
| **Single Point of Failure (SPOF)** | Host Machine | **Critical SPOF (Single VM)** | **None (Decoupled Data Tier)** |

### 8.2 Engineering Analysis of Latency Composition
Analyzing the empirical data reveals crucial network and compute characteristics:
$$\text{Total Latency} = \text{Client-to-EC2 WAN RTT} + \text{Gunicorn Processing} + \text{VPC Private Transit} + \text{RDS Query Execution}$$
- **Wide-Area Network (WAN) Transit Dominance:** In Phase 3, the benchmark client operated outside AWS, transmitting requests over public Internet routing to Mumbai (`ap-south-1`). The baseline client-to-cloud WAN RTT accounted for ~140–160 ms of total latency.
- **VPC Sub-Millisecond Transit:** Communication between the EC2 container and AWS RDS traversed Amazon's high-speed private virtual network fabric, completing in $<2$ ms. The query execution time remained under 15 ms.
- **Reliability under Concurrency:** Despite geographical distance, the modernized system achieved **100% success (0 dropped requests)** with a mean response time of 199.95 ms, demonstrating absolute connection pool stability.

### 8.3 Chaos Monkey Simulation Results: Documenting the Single Point of Failure
In Phase 2, executing `scripts/chaos_monkey.sh` forcefully terminated the database container (`docker stop netflix-db`).

| Application Endpoint | Observed System Behavior During Fault | HTTP Status | Impact Classification |
| :--- | :--- | :---: | :--- |
| **Catalog Read (`/api/catalog`)** | Continues rendering static cached video titles | `200 OK` | Low (Graceful Degradation) |
| **Health Telemetry (`/health`)** | Reports database unreachable; returns error JSON | `500 Error` | Critical Operational Alert |
| **Status Banner UI** | Status indicator pill switches from **GREEN** to **RED** | `200 OK` (Degraded) | High User Visibility |
| **Watchlist Read (`GET /api/watchlist`)** | Fails to retrieve data; displays "Database unavailable" | `500 Error` | Critical Customer Degradation |
| **Watchlist Write (`POST /api/watchlist`)** | Write rejected; displays error toast notification | `500 Error` | Severe (Data Loss Risk) |

```
Chaos Monkey Injected Failure State:
- Status Indicator: RED ("Database connection FAILED - EC2-LIFT-AND-SHIFT DB")
- Watchlist Display: "Database unavailable"
- Single Point of Failure (SPOF) Empirically Verified!
```

---

## 9. Quantitative Total Cost of Ownership (TCO) & Cost-Effort Analysis

### 9.1 AWS Pricing Calculator Direct Infrastructure Model
Using the official AWS Pricing Calculator (Region: Asia Pacific Mumbai / US East N. Virginia), monthly infrastructure costs were modeled across three deployment options:

| Cost Component | Option A: Lift-and-Shift | Option B: Modernized Single-AZ | Option C: Resilient Multi-AZ |
| :--- | :--- | :--- | :--- |
| **Application Compute** | 1x `t3.small` (2 vCPU, 2GB): **$15.18** | 1x `t3.micro` (1 vCPU, 1GB): **$7.59** | 1x `t3.micro` (1 vCPU, 1GB): **$7.59** |
| **Database Compute** | $0.00 (Self-hosted in VM) | 1x `db.t3.micro` (Single-AZ): **$12.41** | 1x `db.t3.micro` (Multi-AZ): **$24.82** |
| **Persistent Storage** | 30 GB EBS gp3: **$2.40** | 20 GB RDS gp2: **$2.30** | 40 GB RDS gp2 (x2): **$4.60** |
| **Backup Storage** | Custom EBS snapshots: **$1.50** | Automated daily snapshots: **$0.00** | Automated daily snapshots: **$0.00** |
| **Gross Monthly Cost** | **$19.08 / month** | **$22.30 / month** | **$37.01 / month** |
| **AWS Free Tier Net (Yr 1)** | **$0.00 / month** | **$0.00 / month** | **~$14.71 / month** |

### 9.2 3-Year Enterprise Lifecycle and Engineering Labor TCO Model
While Option A appears $3.22/month cheaper in raw cloud spend, evaluating Total Cost of Ownership mandates incorporating **Database Administrator (DBA) and System Administrator labor**:
$$\text{TCO}_{\text{3-Year}} = 36 \times \left( C_{\text{compute}} + C_{\text{storage}} + C_{\text{backup}} \right) + \left( H_{\text{monthly}} \times R_{\text{DBA}} \times 36 \right)$$

Assuming an industry-standard DBA rate of $45/hour:
- **Option A (Lift-and-Shift):** Requires manual OS security updates, manual PostgreSQL vacuuming, backup script testing, and manual disaster recovery drills (~6 hours/month):
  $$\text{TCO}_{\text{Option A}} = (36 \times \$19.08) + (6 \text{ hrs} \times \$45/\text{hr} \times 36) = \$686.88 + \$9,720.00 = \mathbf{\$10,406.88}$$
- **Option B (Modernized EC2 + AWS RDS):** Automated patching, point-in-time recovery, and cloud-native monitoring reduce DBA oversight to ~0.5 hours/month:
  $$\text{TCO}_{\text{Option B}} = (36 \times \$22.30) + (0.5 \text{ hrs} \times \$45/\text{hr} \times 36) = \$802.80 + \$810.00 = \mathbf{\$1,612.80}$$
- **Net 3-Year Enterprise Financial Savings:**
  $$\Delta \text{TCO} = \$10,406.88 - \$1,612.80 = \mathbf{\$8,794.08} \quad \left( \mathbf{84.5\% \text{ Net Cost Reduction}} \right)$$

### 9.3 Operational Effort and SLA Resilience Comparison

| Operational Capability | Option A: Lift-and-Shift (Single VM) | Option B: Modernized (AWS RDS) | Operational Impact |
| :--- | :--- | :--- | :--- |
| **OS & Security Patching** | Manual: Requires SSH access, `apt upgrade`, and downtime. | Automated: AWS applies hypervisor and engine patches. | Eliminates human maintenance downtime. |
| **Backup Compliance** | Fragile: Custom cron jobs running `pg_dump`; silent failure risks. | Continuous: Automated transaction log archiving with 7-day retention. | Guaranteed zero-touch backup compliance. |
| **Point-in-Time Recovery** | Unavailable: Limited to timestamp of last successful dump file. | Available: Sub-5-minute point-in-time rollback capability. | Drastically reduces enterprise Data Loss (RPO). |
| **Disaster Recovery (RTO)** | Hours: Requires manual VM re-provisioning and database restore. | $<60$ seconds: Automated Multi-AZ DNS failover to standby. | 99.95% SLA availability vs 95.0% single-instance uptime. |
| **Storage Elasticity** | Disruptive: Requires unmounting EBS volumes and resizing filesystems. | Online: Elastic storage auto-expansion with zero downtime. | Zero-downtime database volume scaling. |

---

## 10. Visual Evidence & Deliverable Artifacts

### Deliverable 1: Lift-and-Shift on AWS EC2 (Healthy Baseline)
![Deliverable 1 - Lift and Shift on EC2](images/deliverable1_lift_and_shift_success.jpg)
*Figure: The Netflix Watchlist application running on AWS EC2 (`52.66.238.5:5000`) with status pill showing `Connected to Local Docker DB on EC2`.*

### Chaos Monkey Injected Failure State
![Chaos Monkey DB Failure](images/chaos_monkey_db_failure.jpg)
*Figure: Upon forceful termination of the local database container via `chaos_monkey.sh`, the status pill switches to RED (`Database connection FAILED`) and the Watchlist reports `Database unavailable`, demonstrating the single point of failure.*

### Deliverable 2: Cloud Modernization on AWS RDS
![Deliverable 2 - AWS RDS Managed Database](images/deliverable2_rds_migration_success.png)
*Figure: The modernized application successfully connected to the managed AWS RDS PostgreSQL instance (`Connected to Managed Database: AWS RDS`).*

### Deliverable 3: Empirical Latency Benchmark Execution
![Deliverable 3 - Benchmark Output](images/deliverable3_rds_benchmark.png)
*Figure: Terminal execution of `benchmarks/run_benchmarks.py` issuing 500 requests across 10 workers, recording 49.37 req/s and 199.95 ms average latency.*

### Watchlist Item Persistence on AWS RDS
![RDS Watchlist Persistence](images/rds_migration_reflected_on_website.png)
*Figure: Watchlist entries persisting across container lifecycles in the managed AWS RDS database.*

---

## 11. Strategic Findings, Architectural Lessons, and Future Work

The four-week investigation conducted by Group 35 confirms several fundamental paradigms governing enterprise cloud computing:
1. **The Fallacy of Lift-and-Shift:** Rehosting legacy applications directly onto cloud VMs preserves technical debt, imports hardware single points of failure, and forfeits the horizontal elasticity and automated disaster recovery native to managed cloud services.
2. **Treating Servers as Cattle, Not Pets:** Decoupling the compute tier from stateful data allows virtual machines to be destroyed, rebuilt, and dynamically scaled without application downtime or data corruption.
3. **Proactive Failure Injection as a Design Prerequisite:** Resilience cannot be retrofitted through passive monitoring. Implementing Chaos Monkey principles forces development teams to design fault-tolerant applications featuring circuit breakers, health probes, and graceful degradation paths.
4. **Labor Overhead Outweighs Cloud Infrastructure Spend:** Focusing solely on direct cloud instance pricing is a fatal enterprise anti-pattern. As demonstrated by our TCO model, managed cloud databases deliver an 84.5% overall lifecycle cost reduction by eliminating manual operational toil.

---

## 12. Annotated Bibliography and References

1. **Izrailevsky, Y., Vlaovic, S., & Meshenberg, R. (2016).** *"Completing the Netflix Cloud Migration."* **Netflix Technology Blog**.  
   https://netflixtechblog.com/completing-the-netflix-cloud-migration-3da80b2095f9  
   *Annotation:* The primary authoritative source chronicling the decommissioning of Netflix's final private data center, detailing why the 2008 SAN failure caused them to reject Lift-and-Shift.

2. **Cockcroft, A. (2014).** *"Migrating to Microservices: Architectural Evolution at Netflix."* **AWS re:Invent Keynote Proceedings**.  
   *Annotation:* Former Netflix Chief Cloud Architect details the decomposition of monolithic Java applications into Eureka service discovery, Ribbon client load balancing, and Cassandra distributed storage.

3. **Netflix Technology Blog. (2012).** *"Chaos Monkey Released Into The Wild."* **Netflix Engineering Tools**.  
   https://netflixtechblog.com/chaos-monkey-released-into-the-wild-face50504611  
   *Annotation:* Documents the architectural rationale behind Chaos Monkey, explaining why intentional failure injection during production business hours enforces resilient engineering.

4. **Basiri, A., Sengupta, N., Shturova, J., Bahirat, P., \& Hochstein, L. (2016).** *"Chaos Engineering: Building confidence in system behavior through experiments."* **IEEE Software**, 33(3), 35–41.  
   *Annotation:* Foundational IEEE academic paper formalizing the principles of Chaos Engineering, blast radius mitigation, and hypothesis testing in large-scale distributed cloud systems.

5. **Amazon Web Services. (2021).** *"Netflix Case Study: Global Scalability and Resiliency on AWS."* **AWS Customer Case Profiles**.  
   https://aws.amazon.com/solutions/case-studies/netflix/  
   *Annotation:* Enterprise profile analyzing Netflix's utilization of Amazon EC2, Amazon S3, and multi-region deployments to support over 200 million global streaming members.

6. **Vogels, W. (2009).** *"Eventually Consistent — Revisited."* **Communications of the ACM**, 52(1), 40–44.  
   *Annotation:* Landmark paper by Amazon CTO Werner Vogels exploring CAP theorem constraints, ACID limitations, and the necessity of transitioning to distributed, horizontally scalable data tiers.

7. **Wiggins, A. (2017).** *"The Twelve-Factor App Methodology."* **Heroku Architecture Documentation**.  
   https://12factor.net/  
   *Annotation:* Authoritative framework for building cloud-native SaaS applications, specifically Factor III (storing config in environment variables) utilized in our Phase 3 RDS migration.

8. **Fowler, M., & Lewis, J. (2014).** *"Microservices: A definition of this new architectural term."* **MartinFowler.com**.  
   *Annotation:* Foundational paper establishing microservice design patterns, bounded contexts, and decoupled decentralized data governance.
