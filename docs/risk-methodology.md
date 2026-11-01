# Risk Scoring & Simulation Methodology

## 1. Multi-Factor Risk Formulation

CyberSentra scores each infrastructure asset on a standardized 0–100 scale using four weighted analytical dimensions:

$$\text{Risk Score} = \min\left(100, \max\left(5, \text{round}\left(0.40 \cdot S + 0.20 \cdot E + 0.20 \cdot X + 0.20 \cdot C\right)\right)\right)$$

### Dimensions

1. **Vulnerability Severity ($S$, 40%)**:
   - $S = \text{round}(\max(\text{CVSS Scores}) \times 10)$.
   - Accounts for the highest active vulnerability severity affecting the asset.
2. **Threat Exploitability ($E$, 20%)**:
   - Incorporates First.org **EPSS (Exploit Prediction Scoring System)** probability and weaponization indicators.
   - Measures likelihood of in-the-wild exploitation.
3. **Network Exposure ($X$, 20%)**:
   - Ingress accessibility attack surface:
     - **External / DMZ Gateway**: 100
     - **Internal Enclave**: 35
     - **Isolated / Zero-Trust / Air-Gapped**: 10
4. **Operational Criticality ($C$, 20%)**:
   - Intrinsic business/clinical priority:
     - **Critical** (Life-support ICU, Grid Substation PLC): 100
     - **High** (Database Clusters, Core Routing): 75
     - **Medium** (Application Servers, Workstations): 50
     - **Low** (Auxiliary Printers, Sandbox Nodes): 25

---

## 2. Risk Tier Classification

- **Critical** ($\ge 80$): Immediate threat requiring emergency isolation or patching.
- **High** ($60 \dots 79$): Significant vulnerability requiring expedited remediation within 48 hours.
- **Medium** ($30 \dots 59$): Moderate risk addressable during standard maintenance cycles.
- **Low** ($< 30$): Minimal threat monitored under routine compliance auditing.

---

## 3. Interactive What-If Remediation Simulation

The platform calculates predictive risk mitigation before changes are deployed to production:
- **Vendor Security Patch**: Resolves active CVE matches $\implies S \to 0$, $E \to 15$ (residual baseline).
- **Network Microsegmentation**: Quarantines asset into a zero-trust segment $\implies X \to 10$.
- **Full Remediation**: Combines patching and microsegmentation for maximal risk reduction.

---

## 4. Live Graph Incident Impact Simulation

Incident simulations model cyber impact propagation through BFS graph traversal over directed functional dependencies ($u \to v$):
- **Asset Compromise**: Lateral movement across high-strength dependencies and downstream spread.
- **Ransomware Impact**: Broadcast-domain encryption ripple across connected nodes.
- **Service Outage**: Cascading availability failure down the dependency tree.
- **Network Isolation**: Quarantine boundary stopping at depth 1.

Refer to [CYBERSENTRA_SYSTEM_ARCHITECTURE.md](./CYBERSENTRA_SYSTEM_ARCHITECTURE.md) for full algorithmic pseudocode and system specifications.
