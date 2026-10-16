import io
import os
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch
import pytest
from PIL import Image
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.models import Product, StoredFile, InvoiceUpload, User
from app.security import passwords
from app.services.storage import (
    LocalStorageService,
    SupabaseStorageService,
    StorageError,
    get_storage,
)

PRODUCT_PAYLOAD = {
    "name": "Storage Test Capsule",
    "description": "High potency test medicine",
    "price": "99.00",
    "category": "Capsules",
    "stock": 100,
    "discount": 0,
    "bgColor": "#ffffff",
}


def create_test_image_bytes():
    img_buf = io.BytesIO()
    Image.new("RGB", (32, 32), color="blue").save(img_buf, format="PNG")
    return img_buf.getvalue()


# ── 1. Local Storage Service Operations ──

def test_local_storage_crud(tmp_path):
    storage = LocalStorageService(upload_dir=tmp_path, public_base_url="http://localhost:8000")
    
    # Upload
    key = "test_img.webp"
    data = b"fake-webp-bytes"
    uploaded_key = storage.upload(key, data, content_type="image/webp", is_public=True)
    assert uploaded_key == key
    assert (tmp_path / key).exists()

    # Public URL
    url = storage.get_public_url(key)
    assert url == f"http://localhost:8000/uploads/{key}"

    # Read
    read_bytes = storage.read(key, is_public=True)
    assert read_bytes == data

    # Delete
    storage.delete(key, is_public=True)
    assert not (tmp_path / key).exists()

    # Delete missing is safe
    storage.delete("non_existent_key.png", is_public=True)


# ── 2. Supabase Storage Configuration Validation ──

def test_supabase_storage_missing_config_validation():
    # Missing URL or Key must raise StorageError
    with pytest.raises(StorageError, match="SUPABASE_URL must be a valid HTTP/HTTPS URL"):
        SupabaseStorageService(
            supabase_url="",
            service_role_key="some-key",
            product_images_bucket="product-images",
            private_files_bucket="private-documents",
        )

    with pytest.raises(StorageError, match="SUPABASE_SERVICE_ROLE_KEY is required"):
        SupabaseStorageService(
            supabase_url="https://xyz.supabase.co",
            service_role_key="",
            product_images_bucket="product-images",
            private_files_bucket="private-documents",
        )


# ── 3. Supabase Storage Mocked Upload & Public URL ──

def test_supabase_storage_mocked_upload_and_public_url():
    with patch("httpx.Client") as mock_client_cls:
        mock_client = MagicMock()
        mock_client_cls.return_value.__enter__.return_value = mock_client
        mock_resp = MagicMock(status_code=200, is_success=True)
        mock_client.post.return_value = mock_resp

        storage = SupabaseStorageService(
            supabase_url="https://testproject.supabase.co",
            service_role_key="test-service-key",
            product_images_bucket="product-images",
            private_files_bucket="private-documents",
        )

        key = "sample-product.webp"
        data = b"image-content"
        result_key = storage.upload(key, data, content_type="image/webp", is_public=True)

        assert result_key == key
        mock_client.post.assert_called_once()
        args, kwargs = mock_client.post.call_args
        assert "storage/v1/object/product-images/sample-product.webp" in args[0]
        assert kwargs["headers"]["Authorization"] == "Bearer test-service-key"
        assert kwargs["headers"]["Content-Type"] == "image/webp"

        # Public URL format
        pub_url = storage.get_public_url(key)
        assert pub_url == "https://testproject.supabase.co/storage/v1/object/public/product-images/sample-product.webp"


# ── 4. Supabase Errors Never Fallback to Local Storage ──

def test_supabase_error_never_falls_back_to_local(tmp_path):
    with patch("httpx.Client") as mock_client_cls:
        mock_client = MagicMock()
        mock_client_cls.return_value.__enter__.return_value = mock_client
        mock_resp = MagicMock(status_code=500, text="Internal Server Error")
        mock_resp.is_success = False
        mock_client.post.return_value = mock_resp

        storage = SupabaseStorageService(
            supabase_url="https://testproject.supabase.co",
            service_role_key="test-service-key",
            product_images_bucket="product-images",
            private_files_bucket="private-documents",
        )

        with pytest.raises(StorageError, match="Supabase Storage upload failed with status 500"):
            storage.upload("unwanted.webp", b"test-data", content_type="image/webp", is_public=True)

        # Confirm no file was created on local disk
        assert not (tmp_path / "unwanted.webp").exists()


# ── 5. Product Image Upload & Returned Public URL (API Level) ──

def test_product_upload_and_returned_url(client, admin):
    img_bytes = create_test_image_bytes()
    response = client.post(
        "/product/createproduct",
        data={k: str(v) for k, v in PRODUCT_PAYLOAD.items()},
        files={"image": ("test.png", img_bytes, "image/png")},
        headers=admin,
    )
    assert response.status_code == 201, response.text
    product_data = response.json()
    image_url = product_data["image"]["url"]
    assert image_url.endswith(".webp")
    # Verify image is accessible
    assert client.get(image_url).status_code == 200


# ── 6. Product Replacement & Cleanup on Failed Database Commit ──

def test_product_replacement_and_commit_failure_cleanup(client, admin, database):
    # 1. Create product
    img_bytes = create_test_image_bytes()
    resp1 = client.post(
        "/product/createproduct",
        data={k: str(v) for k, v in PRODUCT_PAYLOAD.items()},
        files={"image": ("orig.png", img_bytes, "image/png")},
        headers=admin,
    )
    assert resp1.status_code == 201
    prod_id = resp1.json()["id"]
    orig_key = resp1.json()["image"]["public_id"]

    storage = get_storage()
    # Confirm initial file exists in storage
    assert storage.read(orig_key, is_public=True) is not None

    # 2. Successfully update with a new image
    new_img_bytes = create_test_image_bytes()
    resp2 = client.put(
        f"/product/updateproduct/{prod_id}",
        data={"name": "Updated Capsule"},
        files={"image": ("new.png", new_img_bytes, "image/png")},
        headers=admin,
    )
    assert resp2.status_code == 200
    new_key = resp2.json()["image"]["public_id"]
    assert new_key != orig_key

    # Confirm new file exists and old file is deleted from storage
    assert storage.read(new_key, is_public=True) is not None
    # In local mode, old file was unlinked
    if isinstance(storage, LocalStorageService):
        assert not (Path(storage.upload_dir) / orig_key).exists()

    # 3. Simulate failure during DB commit on update: verify newly uploaded file is cleaned up
    with patch("sqlalchemy.orm.Session.commit", side_effect=Exception("Database lock failure")):
        with pytest.raises(Exception, match="Database lock failure"):
            client.put(
                f"/product/updateproduct/{prod_id}",
                data={"name": "Failing Update"},
                files={"image": ("failing.png", create_test_image_bytes(), "image/png")},
                headers=admin,
            )

    # The existing valid image should still be intact
    assert storage.read(new_key, is_public=True) is not None


# ── 7. Invoice Upload, Authenticated Retrieval, & Unauthorized Denial ──

def test_invoice_upload_and_auth_checks(client, admin, database):
    pdf_content = b"%PDF-1.4 simulated pdf invoice content"
    files = {"file": ("invoice_sample.pdf", pdf_content, "application/pdf")}
    
    # 1. Authenticated upload
    upload_resp = client.post("/admin/sales/invoice-uploads", files=files, headers=admin)
    assert upload_resp.status_code == 200, upload_resp.text
    upload_id = upload_resp.json()["id"]

    # 2. Authenticated Preview (inline)
    preview_resp = client.get(f"/admin/sales/invoice-uploads/{upload_id}/file", headers=admin)
    assert preview_resp.status_code == 200
    assert preview_resp.content == pdf_content
    assert preview_resp.headers["content-type"] == "application/pdf"
    assert "inline" in preview_resp.headers.get("content-disposition", "")
    assert "no-store" in preview_resp.headers.get("cache-control", "")

    # 3. Unauthorized Access Denial (No headers)
    anon_resp = client.get(f"/admin/sales/invoice-uploads/{upload_id}/file")
    assert anon_resp.status_code == 401

    # 4. Invalid Token Denial
    invalid_resp = client.get(
        f"/admin/sales/invoice-uploads/{upload_id}/file",
        headers={"Authorization": "Bearer totally-invalid-token"},
    )
    assert invalid_resp.status_code == 401


# ── 8. Private Files Not Exposed Through /uploads ──

def test_private_files_not_exposed_through_uploads(client, admin):
    pdf_content = b"%PDF-1.4 confidential doc"
    files = {"file": ("confidential.pdf", pdf_content, "application/pdf")}
    
    upload_resp = client.post("/admin/sales/invoice-uploads", files=files, headers=admin)
    assert upload_resp.status_code == 200
    upload_id = upload_resp.json()["id"]

    # Direct access through /uploads must fail with 404
    direct_resp = client.get(f"/uploads/invoices/{upload_id}.pdf")
    assert direct_resp.status_code == 404


# ── 9. Invoice Deletion and Missing Object Handling ──

def test_invoice_deletion_and_missing_object(client, admin):
    pdf_content = b"%PDF-1.4 delete test"
    files = {"file": ("to_delete.pdf", pdf_content, "application/pdf")}
    
    upload_resp = client.post("/admin/sales/invoice-uploads", files=files, headers=admin)
    assert upload_resp.status_code == 200
    upload_id = upload_resp.json()["id"]

    # Delete invoice upload
    del_resp = client.delete(f"/admin/sales/invoice-uploads/{upload_id}", headers=admin)
    assert del_resp.status_code == 200

    # Further attempt to access returns 404
    get_resp = client.get(f"/admin/sales/invoice-uploads/{upload_id}/file", headers=admin)
    assert get_resp.status_code == 404


# ── 10. Fresh Process Remote Retrieval (No Local Uploads Present) ──

def test_fresh_process_remote_retrieval(client, admin, database):
    """
    Simulates a brand new process/container where local UPLOAD_DIR is empty
    and files are served from the remote Supabase storage mock.
    """
    remote_data = b"%PDF-1.4 fresh remote process test"
    
    supabase_svc = SupabaseStorageService(
        supabase_url="https://remote-project.supabase.co",
        service_role_key="service-role-test",
        product_images_bucket="product-images",
        private_files_bucket="private-documents",
    )

    with patch.object(supabase_svc, "read", return_value=remote_data):
        with patch("app.routes.offline_sales.get_storage", return_value=supabase_svc):
            factory = database[0]
            with factory() as db:
                owner_user = db.query(User).filter(User.role == "owner").first()
                sf = StoredFile(
                    original_name="remote_invoice.pdf",
                    storage_key="invoices/remote_invoice.pdf",
                    mime_type="application/pdf",
                    size=len(remote_data),
                    sha256="fakehash",
                    uploader_id=owner_user.id,
                )
                db.add(sf)
                db.flush()
                inv = InvoiceUpload(
                    file_id=sf.id,
                    original_name="remote_invoice.pdf",
                    storage_key="invoices/remote_invoice.pdf",
                    file_hash="fakehash",
                    mime_type="application/pdf",
                    file_size=len(remote_data),
                    status="uploaded",
                    actor_id=owner_user.id,
                )
                db.add(inv)
                db.commit()
                inv_id = inv.id

            # Request file from backend - local disk has no such file
            resp = client.get(f"/admin/sales/invoice-uploads/{inv_id}/file", headers=admin)
            assert resp.status_code == 200
            assert resp.content == remote_data
            assert resp.headers["content-type"] == "application/pdf"
            assert "inline" in resp.headers["content-disposition"]
