# Chaos Monkey Resilience Simulation & Fault Injection Report
**Course:** IT457 Cloud Computing | **Group:** 35  
**Assignee:** Member 2 (Cloud Infrastructure Lead)  
**Deliverable Link:** Week 2/3 Lab Milestone — Systemic Resilience & Single Point of Failure (SPOF) Analysis

---

## 1. Experiment Objective & Hypothesis
- **Hypothesis:** In a single-VM Lift-and-Shift architecture, stopping the co-located database container simulates an unrecoverable node or storage failure. Because the compute tier is tightly coupled to the local database container, the application will experience immediate functional degradation and write failure.
- **Tool Used:** Custom Chaos daemon script (`scripts/chaos_monkey.sh`) simulating Netflix Chaos Monkey container termination.

---

## 2. Experimental Execution

### Step 1: Pre-Chaos Baseline Verification
- Endpoint `/health`: HTTP `200 OK`
- Database Status: `"Connected to Local Docker DB on EC2"` (Status pill: **Green**)
- All catalog items and user watchlist entries render without latency.

### Step 2: Fault Injection (Chaos Monkey)
- Execution command: `docker stop <db-container-id>`
- The PostgreSQL database process was forcefully halted on the EC2 host.

### Step 3: Observed System Behavior & Blast Radius

| Component / Feature | Observed Behavior | HTTP Code | Impact Level |
| :--- | :--- | :---: | :---: |
| **Catalog Browsing (`/api/catalog`)** | Continues serving static cached catalog data | `200 OK` | Low (Graceful degradation) |
| **Health Check (`/health`)** | Immediately reports database unreachable | `500 Error` | Critical |
| **Status Banner (`/api/status`)** | Turns **RED**: `"Database connection FAILED"` | `200 OK` (Degraded) | High visibility |
| **User Watchlist Read (`GET /api/watchlist`)** | Fails; displays `"Database unavailable"` | `500 Error` | Critical |
| **User Watchlist Write (`POST /api/watchlist`)** | Write rejected; displays error toast | `500 Error` | Critical (Data loss risk) |

### Step 4: Recovery
- Container restored: `docker start <db-container-id>`
- Recovery time (RTO): Approximately 4.2 seconds for PostgreSQL daemon initialization.
- Endpoint `/health` returned to `200 OK`.

---

## 3. Analysis & Comparison with Cloud Modernization (RDS)

1. **Why Lift-and-Shift Failed the Chaos Test:**
   - On a single VM, compute and storage share the same failure domain.
   - There is no automated failover, no standby instance, and no multi-AZ redundancy.
   - Recovery requires manual administrator intervention (`ssh` and `docker start`).

2. **How Cloud Modernization (AWS RDS) Solves This:**
   - In Phase B (Refactored to AWS RDS), the database is decoupled from the VM.
   - RDS Multi-AZ synchronously replicates data across two physical availability zones.
   - If the primary database crashes, AWS automatically flips the DNS CNAME to the standby replica within 60 seconds, with zero data loss.

