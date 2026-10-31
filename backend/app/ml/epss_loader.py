"""
EPSS CSV loader — parses the FIRST.org EPSS snapshot and upserts into DB.

File format (first line is a comment header):
  #model_version:v2026.06.15,score_date:2026-10-30T12:03:08Z
  cve,epss,percentile
  CVE-1999-0001,0.04753,0.91871
  ...

Run once (or daily to refresh):
  python -m app.ml.epss_loader --csv dataset/epss_scores.csv
"""
from __future__ import annotations

import csv
import logging
from datetime import date, datetime, timezone
from pathlib import Path

from sqlalchemy.orm import Session

from app.models.ml_models import EPSSScore

logger = logging.getLogger(__name__)

BATCH_SIZE = 5_000


def _parse_score_date(comment_line: str) -> date | None:
    """Extract score_date from the EPSS comment header."""
    try:
        for part in comment_line.lstrip("#").split(","):
            if part.startswith("score_date:"):
                dt_str = part.split(":", 1)[1].strip()
                return datetime.fromisoformat(dt_str.replace("Z", "+00:00")).date()
    except Exception:
        pass
    return None


def load_epss_csv(csv_path: str | Path, db: Session) -> dict:
    """
    Parse EPSS CSV and upsert all records into epss_scores table.
    Returns summary dict with counts.
    """
    csv_path = Path(csv_path)
    if not csv_path.exists():
        raise FileNotFoundError(f"EPSS CSV not found: {csv_path}")

    logger.info("Loading EPSS scores from %s", csv_path)

    score_date: date | None = None
    inserted = 0
    updated = 0
    errors = 0

    with csv_path.open("r", encoding="utf-8", newline="") as fh:
        # First line may be the comment header
        first_line = fh.readline().strip()
        if first_line.startswith("#"):
            score_date = _parse_score_date(first_line)
            # next line is the column header
            fh.readline()
        else:
            # No comment line — reset to start
            fh.seek(0)

        reader = csv.reader(fh)
        # Skip column header if we didn't already consume it
        try:
            header = next(reader)
            if header[0].lower() != "cve":
                # Was data row, put it back conceptually — rare edge case, just log
                logger.warning("Unexpected first row after header skip: %s", header)
        except StopIteration:
            return {"inserted": 0, "updated": 0, "errors": 0, "score_date": None}

        batch: list[dict] = []

        def _flush(batch: list[dict]) -> tuple[int, int]:
            ins = upd = 0
            cve_ids = [r["cve_id"] for r in batch]
            existing_map = {
                row.cve_id: row
                for row in db.query(EPSSScore)
                .filter(EPSSScore.cve_id.in_(cve_ids))
                .all()
            }
            for rec in batch:
                cid = rec["cve_id"]
                if cid in existing_map:
                    row = existing_map[cid]
                    row.epss_score = rec["epss_score"]
                    row.percentile = rec["percentile"]
                    row.score_date = rec["score_date"]
                    row.fetched_at = datetime.now(timezone.utc)
                    upd += 1
                else:
                    db.add(EPSSScore(**rec))
                    ins += 1
            db.commit()
            return ins, upd

        for row in reader:
            if len(row) < 3:
                errors += 1
                continue
            try:
                cve_id = row[0].strip().upper()
                epss_val = float(row[1])
                pct_val = float(row[2])
            except (ValueError, IndexError):
                errors += 1
                continue

            batch.append({
                "cve_id": cve_id,
                "epss_score": epss_val,
                "percentile": pct_val,
                "score_date": score_date,
                "fetched_at": datetime.now(timezone.utc),
            })

            if len(batch) >= BATCH_SIZE:
                ins, upd = _flush(batch)
                inserted += ins
                updated += upd
                batch.clear()
                logger.debug("EPSS progress: +%d inserted, ~%d updated so far", inserted, updated)

        if batch:
            ins, upd = _flush(batch)
            inserted += ins
            updated += upd

    logger.info(
        "EPSS load complete: %d inserted, %d updated, %d errors, score_date=%s",
        inserted, updated, errors, score_date,
    )
    return {"inserted": inserted, "updated": updated, "errors": errors, "score_date": str(score_date)}


def get_epss_for_cve(cve_id: str, db: Session) -> EPSSScore | None:
    """Lookup a single CVE's EPSS record."""
    return db.query(EPSSScore).filter(EPSSScore.cve_id == cve_id.upper()).first()
