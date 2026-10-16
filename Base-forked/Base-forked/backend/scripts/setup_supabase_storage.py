"""
Automated Supabase Storage Bucket Initialization Script
-------------------------------------------------------
Creates or updates the required buckets via Supabase Storage API:
- product-images (public: True)
- private-documents (public: False)

Usage:
    python -m scripts.setup_supabase_storage
"""

import sys
import httpx
from app.config import settings

def setup_buckets():
    print("=" * 60)
    print("Initializing Supabase Storage Buckets for Aayerah")
    print("=" * 60)

    url = settings.supabase_url.rstrip("/")
    key = settings.supabase_service_role_key
    product_bucket = settings.supabase_product_images_bucket
    private_bucket = settings.supabase_private_files_bucket

    if not url or not key:
        print("[ERROR] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.")
        sys.exit(1)

    headers = {
        "Authorization": f"Bearer {key}",
        "apikey": key,
        "Content-Type": "application/json",
    }

    buckets_to_configure = [
        {
            "id": product_bucket,
            "name": product_bucket,
            "public": True,
            "file_size_limit": 5242880, # 5MB
            "allowed_mime_types": ["image/webp", "image/jpeg", "image/png", "image/gif"],
        },
        {
            "id": private_bucket,
            "name": private_bucket,
            "public": False,
            "file_size_limit": 15728640, # 15MB
            "allowed_mime_types": [
                "application/pdf",
                "image/jpeg",
                "image/png",
                "image/webp",
                "application/vnd.ms-excel",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "text/csv",
            ],
        },
    ]

    with httpx.Client(timeout=15.0) as client:
        # Check existing buckets
        resp = client.get(f"{url}/storage/v1/bucket", headers=headers)
        if resp.status_code != 200:
            print(f"[ERROR] Failed to list buckets: HTTP {resp.status_code} - {resp.text}")
            sys.exit(1)

        existing_bucket_ids = {b["id"] for b in resp.json()}

        for b_config in buckets_to_configure:
            b_id = b_config["id"]
            if b_id in existing_bucket_ids:
                print(f"Bucket '{b_id}' already exists. Updating configuration...")
                update_resp = client.put(
                    f"{url}/storage/v1/bucket/{b_id}",
                    headers=headers,
                    json={
                        "public": b_config["public"],
                        "file_size_limit": b_config["file_size_limit"],
                        "allowed_mime_types": b_config["allowed_mime_types"],
                    },
                )
                if update_resp.status_code in (200, 204):
                    print(f"  [OK] Bucket '{b_id}' updated (public={b_config['public']}).")
                else:
                    print(f"  [WARN] Failed to update bucket '{b_id}': {update_resp.text}")
            else:
                print(f"Creating bucket '{b_id}' (public={b_config['public']})...")
                create_resp = client.post(
                    f"{url}/storage/v1/bucket",
                    headers=headers,
                    json=b_config,
                )
                if create_resp.status_code in (200, 201):
                    print(f"  [OK] Bucket '{b_id}' created successfully.")
                else:
                    print(f"  [ERROR] Failed to create bucket '{b_id}': HTTP {create_resp.status_code} - {create_resp.text}")

    print("\nBucket setup completed successfully.")
    print("=" * 60)

if __name__ == "__main__":
    setup_buckets()
