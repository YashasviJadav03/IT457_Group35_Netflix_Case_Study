# AWS EC2 Provisioning & Security Group Configuration Guide
**Course:** IT457 Cloud Computing | **Group:** 35  
**Assignee:** Member 2 (Cloud Infrastructure Lead)  
**Task:** Commit 04 — Infrastructure Setup for Lift-and-Shift Deployment

---

## 1. Overview
This document details the configuration and provisioning of the Amazon Elastic Compute Cloud (EC2) virtual machine hosting the containerized 2-tier Netflix application and its database in a single-instance **Lift-and-Shift** architecture.

---

## 2. EC2 Virtual Machine Specifications

| Parameter | Selected Value | Justification |
| :--- | :--- | :--- |
| **Region** | `ap-south-1` (Mumbai) / `us-east-1` (N. Virginia) | Low latency / full Free Tier eligibility |
| **AMI** | Ubuntu Server 22.04 LTS (HVM), SSD Volume Type | Long-term support, standard enterprise Linux distribution |
| **Architecture** | 64-bit (x86) | Standard architecture for container runtimes |
| **Instance Type** | `t2.micro` or `t3.micro` (1 vCPU, 1 GB RAM) | AWS Free Tier eligible (750 hours/month) |
| **Storage (EBS)** | 30 GB General Purpose SSD (`gp3` or `gp2`) | Free tier allocation for OS and Docker persistent volume |
| **Key Pair** | RSA, `.pem` format (`netflix-key.pem`) | Secure SSH key-based authentication |

---

## 3. Firewall & Security Group Configuration (`netflix-ec2-sg`)

The EC2 instance is associated with a dedicated security group controlling inbound and outbound network traffic.

### Inbound Rules (Ingress)

| Type | Protocol | Port Range | Source | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **SSH** | TCP | `22` | `0.0.0.0/0` (or Admin IP) | Remote management via terminal SSH |
| **Custom TCP** | TCP | `5000` | `0.0.0.0/0` (Anywhere) | Public web traffic for Netflix App interface |
| **HTTP** | TCP | `80` | `0.0.0.0/0` (Anywhere) | Standard HTTP ingress (optional reverse proxy) |

> **Security Note:** Port `5432` (PostgreSQL) is deliberately **NOT** opened in the security group. In the Lift-and-Shift phase, database communication is restricted strictly to the Docker internal bridge network on `localhost` inside the VM, preventing unauthorized external access.

### Outbound Rules (Egress)
- All traffic (`0.0.0.0/0` on all ports) is allowed outbound to enable package downloads and Docker registry image pulls.

---

## 4. SSH Remote Connection

From the local Windows management workstation (PowerShell):

```powershell
# Set secure read-only permission for the key file (if needed)
icacls .\netflix-key.pem /inheritance:r
icacls .\netflix-key.pem /grant:r "$($env:USERNAME):(R)"

# Connect to the EC2 instance
ssh -i .\netflix-key.pem ubuntu@<EC2-PUBLIC-IP>
```

---

## 5. Automated Server Provisioning via `setup_ec2.sh`

Once connected to the EC2 instance, execute the provisioning script to install Docker, Docker Compose, and configure group permissions:

```bash
# Clone the repository
git clone https://github.com/<ORG>/IT457_Group35_Netflix_Case_Study.git
cd IT457_Group35_Netflix_Case_Study
git checkout infra/ec2-lift-shift

# Make setup script executable and run
chmod +x scripts/setup_ec2.sh
./scripts/setup_ec2.sh
```

---

## 6. Verification Checklist
- [x] EC2 instance status reports `Running` and `2/2 checks passed`.
- [x] Inbound rules allow ports `22` and `5000`.
- [x] SSH connection established successfully from local workstation.
- [x] Docker engine (`docker --version`) and Docker Compose (`docker compose version`) verified on EC2.
- [x] User `ubuntu` added to `docker` group for non-root execution.

