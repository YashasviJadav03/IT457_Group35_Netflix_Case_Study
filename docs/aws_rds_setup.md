# AWS RDS PostgreSQL Provisioning & Decoupled Architecture Guide
**Course:** IT457 Cloud Computing | **Group:** 35  
**Assignee:** Member 3 (Cloud Modernization & Analytics Lead)  
**Task:** Commit 07 — Cloud Modernization Infrastructure (Managed Database Tier)

---

## 1. Overview & Architecture Evolution

In **Phase A (Lift-and-Shift)**, both the Flask web tier and PostgreSQL database ran inside Docker containers co-located on a single AWS EC2 virtual machine. While simple to deploy, this architecture suffers from significant enterprise limitations:
- **Shared compute contention:** Heavy analytical queries throttle the web server CPU and RAM.
- **Single Point of Failure (SPOF):** A VM crash or storage failure takes down both compute and state.
- **High operational overhead:** Database patching, manual backups, OS updates, and failover fall entirely on the administrator.

In **Phase B (Cloud Modernization / Refactored)**, we decouple state by provisioning **Amazon Relational Database Service (AWS RDS)** running PostgreSQL. The web tier on EC2 becomes stateless, connecting securely to RDS over the private Amazon Virtual Private Cloud (VPC).

```
Phase A: Single-Host Lift-and-Shift           Phase B: Cloud Modernization (RDS Decoupled)
┌─────────────────────────────────┐           ┌──────────────────┐       ┌────────────────────────┐
│ AWS EC2 (t2.micro / t3.micro)   │           │ AWS EC2 Instance │       │ AWS RDS (db.t3.micro)  │
│  ┌───────────┐   ┌───────────┐  │           │  ┌────────────┐  │       │  ┌──────────────────┐  │
│  │ Web App   │───│ Postgres  │  │   ───►    │  │ Stateless  │──┼───────┼─►│ Managed Postgres │  │
│  │ Container │   │ Container │  │           │  │ Web App    │  │ Port  │  │ Automated Backup │  │
│  └───────────┘   └─────┬─────┘  │           │  └────────────┘  │ 5432  │  │ Multi-AZ Ready   │  │
│                  ┌─────▼─────┐  │           └──────────────────┘       │  └──────────────────┘  │
│                  │ EBS Vol   │  │                                      └────────────────────────┘
└──────────────────┴───────────┴──┘
```

---

## 2. AWS RDS Provisioning Specifications

| Parameter | Selected Value | Justification |
| :--- | :--- | :--- |
| **Engine** | PostgreSQL 15.x | Exact engine compatibility with containerized development image (`postgres:15-alpine`). |
| **Template** | Free Tier | Restricts configuration to Free Tier eligible parameters ($0 additional billing). |
| **DB Instance Class** | `db.t3.micro` (or `db.t4g.micro`) | 1 vCPU, 1 GiB RAM; burstable compute sufficient for decoupled web application traffic. |
| **Storage Engine** | General Purpose SSD (`gp2` or `gp3`) | 20 GiB allocation (AWS Free Tier limit). Autoscaling disabled to avoid surprise billing. |
| **DB Identifier** | `netflix-cloud-db` | Uniquely identifies the RDS cluster in the AWS Region. |
| **Master Username** | `postgresadmin` | Dedicated database master administrator account. |
| **Master Password** | Configured via environment secret | High-entropy credential stored only in `.env.production`. |
| **Initial Database** | `netflix_db` | Automatically initialized schema upon database boot. |
| **Public Accessibility** | **No (Private Subnet)** | Database is strictly isolated within the VPC; not reachable over the public internet. |
| **Automated Backups** | Enabled (7-day retention) | Automated daily snapshots + point-in-time recovery (PITR) up to 5 minutes. |

---

## 3. Network Security & VPC Architecture

Database isolation follows the **Principle of Least Privilege**. PostgreSQL port `5432` is never exposed to the public internet (`0.0.0.0/0`). Instead, network ingress is restricted strictly to the EC2 security group.

### Security Group Ingress / Egress Matrix

#### 1. EC2 Security Group (`netflix-ec2-sg`)
- **Inbound:**
  - Port `22` (SSH) from Admin IP.
  - Port `5000` (HTTP Web App) from `0.0.0.0/0`.
- **Outbound:**
  - Port `5432` (PostgreSQL) destination: `netflix-rds-sg`.
  - Port `80/443` outbound for container updates.

#### 2. RDS Security Group (`netflix-rds-sg`)
- **Inbound Rule (Ingress):**
  - **Type:** PostgreSQL
  - **Protocol:** TCP
  - **Port Range:** `5432`
  - **Source:** `sg-xxxxxx` (`netflix-ec2-sg` Security Group ID)
  - **Description:** Allow traffic strictly from EC2 Web Tier container.
- **Outbound Rule (Egress):**
  - Default: All outbound allowed.

```
Internet User ──► [Port 5000] ──► EC2 (netflix-ec2-sg) ──► [Port 5432] ──► RDS (netflix-rds-sg)
                                        │                                         ▲
                                        └──────── Security Group Reference ───────┘
                                                (All other IPs DROPPED)
```

---

## 4. Connectivity Verification from EC2

Before running database migration or restarting the application tier, verify that the EC2 virtual machine can reach the RDS instance over the private network.

### Step 1: Connect to EC2 VM
```bash
ssh -i netflix-key.pem ubuntu@<EC2-PUBLIC-IP>
```

### Step 2: Test TCP Connectivity & Port Reachability
Using `nc` (netcat) or `pg_isready`:
```bash
# Test TCP handshake on port 5432
nc -zv <RDS-ENDPOINT> 5432

# Expected output:
# Connection to <RDS-ENDPOINT> 5432 port [tcp/postgresql] succeeded!
```

Or verify using a transient Docker container (no need to install client packages on host):
```bash
docker run --rm postgres:15-alpine pg_isready \
  -h <RDS-ENDPOINT> \
  -p 5432 \
  -U postgresadmin \
  -d netflix_db
```

### Step 3: Interactive Database Shell
```bash
docker run -it --rm postgres:15-alpine psql \
  -h <RDS-ENDPOINT> \
  -U postgresadmin \
  -d netflix_db
```

---

## 5. Automated Data Migration Procedure

Data migration from the Lift-and-Shift PostgreSQL container to the managed AWS RDS database is automated via `scripts/migrate_to_rds.sh`.

### Execution Flow:
1. **Pre-flight Check:** Validates that Docker is running, the local container is online, and the RDS endpoint is reachable.
2. **Consistent Snapshot:** Issues `pg_dump` with clean-table drop guards (`--clean --if-exists`) against the local container without modifying application files.
3. **Target Ingestion:** Restores schema and seed rows into AWS RDS using TLS encryption (`sslmode=require`).
4. **Data Integrity Check:** Runs `COUNT(*)` verification on the `watchlist` table across both databases to confirm zero record loss.

Execute the migration script:
```bash
chmod +x scripts/migrate_to_rds.sh
./scripts/migrate_to_rds.sh
```

---

## 6. Verification Checklist
- [x] AWS RDS PostgreSQL 15 instance status is `Available`.
- [x] Security group `netflix-rds-sg` references `netflix-ec2-sg` on port 5432.
- [x] TCP connectivity on port 5432 succeeds from the EC2 instance.
- [x] Automated migration script executed without errors.
- [x] Schema `watchlist` and starter rows verified inside `netflix_db`.
