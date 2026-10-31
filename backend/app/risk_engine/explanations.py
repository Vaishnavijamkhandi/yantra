def build_remediation_recommendations(asset, risk_result: dict) -> list[str]:
    recommendations = []
    if risk_result["factors"]["confirmed_vulnerability_count"]:
        recommendations.append("Review the confirmed CVE records and apply vendor-approved security updates where applicable.")
    if asset.exposure.value == "internet_facing":
        recommendations.append("Review external exposure; restrict administrative interfaces and unnecessary services.")
    if asset.criticality.value in ("high", "critical"):
        recommendations.append("Confirm backup, recovery and incident-response procedures for this critical asset.")
    if risk_result["factors"]["uncertain_match_count"]:
        recommendations.append("Manually verify uncertain product/version matches before taking remediation decisions.")
    if not recommendations:
        recommendations.append("Maintain an accurate inventory, monitor configuration changes and schedule periodic reassessment.")
    return recommendations
