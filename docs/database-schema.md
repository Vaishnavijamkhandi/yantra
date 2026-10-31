# Database schema

## assets
Infrastructure inventory: name, type, IP, OS, criticality, exposure, department, environment.

## asset_software
Many-to-one relationship to assets. Stores vendor, product/software name and version.

## vulnerabilities
Cached CVE record: CVE ID, description, CVSS score/severity, published/modified dates, source URL and raw JSON.

## asset_vulnerabilities
Association between assets and CVEs. Stores `confirmed`, `needs_verification` or `not_affected`, matching evidence and assessment timestamp.

## risk_assessments
Immutable assessment snapshots: score, category, factor values, explanation and assessment timestamp.

## Relationships
- assets 1:N asset_software
- assets N:M vulnerabilities through asset_vulnerabilities
- assets 1:N risk_assessments

A missing CVE match is not equivalent to a secure asset. Risk scoring must account for incomplete inventory and uncertain assessment coverage.
