# Baseline risk methodology

The initial engine is a transparent prioritisation heuristic, not a calibrated probability model.

Inputs (0–100):
- Severity: highest confirmed CVSS base score scaled from 0–10 to 0–100.
- Exploitability: mapped from CVSS exploitability subscore where available; otherwise neutral/unknown value with a coverage note.
- Exposure: operator-provided asset exposure.
- Criticality: operator-provided business/mission criticality.

Initial weighted score:
`0.40 * severity + 0.20 * exploitability + 0.20 * exposure + 0.20 * criticality`

The weights are configurable in code and should be reviewed with domain experts. The result must not be described as a probability of compromise. A high score means the asset deserves earlier review under this chosen heuristic.

No confirmed vulnerability match:
- Do not automatically assign zero risk.
- The current version uses a conservative baseline based on asset criticality and exposure and marks the assessment as having limited vulnerability evidence.

Uncertain matches:
- Do not treat as confirmed.
- Display the uncertainty and encourage verification.

Future improvements:
- Add asset dependencies and operational impact.
- Incorporate CISA KEV evidence and remediation availability.
- Calibrate weights against expert-labelled examples.
- Only train ML with suitable historical, labelled, leakage-controlled data.
