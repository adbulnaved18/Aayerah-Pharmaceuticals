"""
Manual Storage Migration Command
---------------------------------
Migrates existing local product images and private documents from local disk (UPLOAD_DIR)
to Supabase Storage.

Key Features:
- Dry-run mode by default (use --apply to execute).
- Idempotent: Skips files that are already stored in Supabase.
- Verifies remote object existence before committing database updates.
- Preserves original local files (no deletion of source files).
- Outputs a detailed summary of migrated, skipped, missing, and failed items.
- Not run automatically at application startup.

Usage:
    python -m app.commands.migrate_storage --dry-run
    python -m app.commands.migrate_storage --apply
"""

import argparse
import logging
import mimetypes
import os
import sys
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import SessionLocal
from ..models import Product, StoredFile
from ..services.storage import SupabaseStorageService, StorageError

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


def migrate_storage(apply: bool = False, custom_db: Session = None):
    print("=" * 70)
    mode_str = "APPLY (LIVE EXECUTION)" if apply else "DRY-RUN (SIMULATION ONLY)"
    print(f"AAYERAH STORAGE MIGRATION — {mode_str}")
    print("=" * 70)

    if not settings.supabase_url or not settings.supabase_service_role_key:
        print("\n[ERROR] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured in environment or .env.")
        return {
            "status": "error",
            "message": "Missing Supabase credentials",
        }

    try:
        supabase_storage = SupabaseStorageService(
            supabase_url=settings.supabase_url,
            service_role_key=settings.supabase_service_role_key,
            product_images_bucket=settings.supabase_product_images_bucket,
            private_files_bucket=settings.supabase_private_files_bucket,
        )
    except Exception as exc:
        print(f"\n[ERROR] Failed to initialize Supabase storage client: {exc}")
        return {"status": "error", "message": str(exc)}

    db = custom_db or session_factory()
    upload_dir = Path(settings.upload_dir)

    summary = {
        "products": {"total": 0, "migrated": 0, "skipped": 0, "missing": 0, "failed": 0},
        "stored_files": {"total": 0, "migrated": 0, "skipped": 0, "missing": 0, "failed": 0},
    }

    try:
        # ── 1. Product Images ──
        print(f"\nScanning products in database (Local UPLOAD_DIR: {upload_dir})...")
        products = db.scalars(select(Product)).all()
        summary["products"]["total"] = len(products)

        for p in products:
            if not p.image and not p.image_public_id:
                summary["products"]["skipped"] += 1
                continue

            # Check if already a remote Supabase URL
            if p.image and settings.supabase_url and settings.supabase_url in p.image:
                print(f"  [PRODUCT SKIPPED] {p.name} (id: {p.id}) — Already using Supabase Storage.")
                summary["products"]["skipped"] += 1
                continue

            # Identify filename / local path
            filename = p.image_public_id
            if not filename and p.image:
                filename = p.image.rsplit("/", 1)[-1].split("?")[0]

            if not filename:
                summary["products"]["skipped"] += 1
                continue

            local_file = upload_dir / filename
            if not local_file.exists():
                print(f"  [PRODUCT MISSING] {p.name} (id: {p.id}) — Local file not found: {local_file}")
                summary["products"]["missing"] += 1
                continue

            # File found on local disk
            content_type = mimetypes.guess_type(local_file.name)[0] or "image/webp"
            target_key = filename

            if not apply:
                print(f"  [PRODUCT DRY-RUN] {p.name} — Would migrate {local_file.name} to public bucket.")
                summary["products"]["migrated"] += 1
                continue

            # Apply upload
            try:
                data = local_file.read_bytes()
                uploaded_key = supabase_storage.upload(target_key, data, content_type=content_type, is_public=True)
                new_url = supabase_storage.get_public_url(uploaded_key)

                # Verify remote read
                supabase_storage.read(uploaded_key, is_public=True)

                # Update database reference
                p.image = new_url
                p.image_public_id = uploaded_key
                db.commit()
                print(f"  [PRODUCT MIGRATED] {p.name} -> {new_url}")
                summary["products"]["migrated"] += 1
            except Exception as exc:
                db.rollback()
                print(f"  [PRODUCT FAILED] {p.name} — Upload failed: {exc}")
                summary["products"]["failed"] += 1

        # ── 2. Stored Files (Invoices & Attachments) ──
        print(f"\nScanning private stored files in database...")
        stored_files = db.scalars(select(StoredFile)).all()
        summary["stored_files"]["total"] = len(stored_files)

        for sf in stored_files:
            key = sf.storage_key
            if not key:
                summary["stored_files"]["skipped"] += 1
                continue

            local_file = upload_dir / key.lstrip("/").replace("\\", "/")
            if not local_file.exists():
                print(f"  [FILE MISSING] StoredFile '{sf.original_name}' (key: {key}) — Local file not found: {local_file}")
                summary["stored_files"]["missing"] += 1
                continue

            content_type = sf.mime_type or mimetypes.guess_type(local_file.name)[0] or "application/octet-stream"

            if not apply:
                print(f"  [FILE DRY-RUN] StoredFile '{sf.original_name}' — Would migrate to private-documents/{key}")
                summary["stored_files"]["migrated"] += 1
                continue

            # Apply upload
            try:
                data = local_file.read_bytes()
                uploaded_key = supabase_storage.upload(key, data, content_type=content_type, is_public=False)

                # Verify remote read
                supabase_storage.read(uploaded_key, is_public=False)

                print(f"  [FILE MIGRATED] StoredFile '{sf.original_name}' -> private-documents/{uploaded_key}")
                summary["stored_files"]["migrated"] += 1
            except Exception as exc:
                print(f"  [FILE FAILED] StoredFile '{sf.original_name}' — Upload failed: {exc}")
                summary["stored_files"]["failed"] += 1

    finally:
        if not custom_db:
            db.close()

    print("\n" + "=" * 70)
    print("MIGRATION SUMMARY")
    print("=" * 70)
    print(f"Products:     Total: {summary['products']['total']}, Migrated: {summary['products']['migrated']}, "
          f"Skipped: {summary['products']['skipped']}, Missing: {summary['products']['missing']}, Failed: {summary['products']['failed']}")
    print(f"Stored Files: Total: {summary['stored_files']['total']}, Migrated: {summary['stored_files']['migrated']}, "
          f"Skipped: {summary['stored_files']['skipped']}, Missing: {summary['stored_files']['missing']}, Failed: {summary['stored_files']['failed']}")
    print("=" * 70)
    if not apply:
        print("Note: This was a DRY-RUN. To execute the migration, pass the --apply flag.")
    print("=" * 70 + "\n")

    return summary


def main():
    parser = argparse.ArgumentParser(description="Migrate local files to Supabase Storage.")
    parser.add_argument("--apply", action="store_true", help="Apply migration (default is dry-run)")
    parser.add_argument("--dry-run", action="store_true", help="Explicitly run in simulation mode")
    args = parser.parse_args()

    apply = args.apply and not args.dry_run
    migrate_storage(apply=apply)


if __name__ == "__main__":
    main()
