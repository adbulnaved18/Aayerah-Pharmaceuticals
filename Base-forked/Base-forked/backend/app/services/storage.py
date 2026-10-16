"""
Storage Service Module
----------------------
Provides a unified abstraction for file storage with support for:
- Local storage (for development and tests using UPLOAD_DIR)
- Supabase Storage (for production on Render Free without persistent disk)

Public bucket: product-images (public read)
Private bucket: private-documents (authenticated backend access only)
"""

import logging
import os
import time
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Optional

import anyio
import httpx

from ..config import Settings, settings

logger = logging.getLogger(__name__)


# ─── Exceptions ──────────────────────────────────────────────────────────────


class StorageError(Exception):
    """Base exception for storage operations."""
    pass


class StorageNotFoundError(StorageError):
    """Raised when an object or file cannot be found in storage."""
    pass


class StorageConfigurationError(StorageError):
    """Raised when storage configuration is invalid or missing required credentials."""
    pass


# ─── Abstract Interface ───────────────────────────────────────────────────────


class StorageService(ABC):
    """Abstract base class for storage backends."""

    @abstractmethod
    def upload(self, key: str, data: bytes, content_type: str, is_public: bool = False) -> str:
        """Upload raw bytes to storage synchronously and return the object key."""
        pass

    @abstractmethod
    async def upload_async(self, key: str, data: bytes, content_type: str, is_public: bool = False) -> str:
        """Upload raw bytes to storage asynchronously and return the object key."""
        pass

    @abstractmethod
    def read(self, key: str, is_public: bool = False) -> bytes:
        """Read raw bytes from storage synchronously."""
        pass

    @abstractmethod
    async def read_async(self, key: str, is_public: bool = False) -> bytes:
        """Read raw bytes from storage asynchronously."""
        pass

    @abstractmethod
    def delete(self, key: str, is_public: bool = False) -> bool:
        """Delete an object from storage synchronously. Returns True on success or if already absent."""
        pass

    @abstractmethod
    async def delete_async(self, key: str, is_public: bool = False) -> bool:
        """Delete an object from storage asynchronously. Returns True on success or if already absent."""
        pass

    @abstractmethod
    def get_public_url(self, key: str) -> str:
        """Return the public URL for an object stored in the public bucket."""
        pass


# ─── Local Storage Implementation ────────────────────────────────────────────


class LocalStorageService(StorageService):
    """
    Local filesystem storage for local development and test runs.
    Uses settings.upload_dir as the base directory.
    """

    def __init__(self, upload_dir: str, public_base_url: str):
        self.upload_dir = Path(upload_dir)
        self.public_base_url = public_base_url.rstrip("/")
        self.upload_dir.mkdir(parents=True, exist_ok=True)

    def _resolve_path(self, key: str) -> Path:
        clean_key = key.lstrip("/").replace("\\", "/")
        return self.upload_dir / clean_key

    def upload(self, key: str, data: bytes, content_type: str, is_public: bool = False) -> str:
        target_path = self._resolve_path(key)
        target_path.parent.mkdir(parents=True, exist_ok=True)
        target_path.write_bytes(data)
        return key

    async def upload_async(self, key: str, data: bytes, content_type: str, is_public: bool = False) -> str:
        return await anyio.to_thread.run_sync(self.upload, key, data, content_type, is_public)

    def read(self, key: str, is_public: bool = False) -> bytes:
        target_path = self._resolve_path(key)
        if not target_path.exists():
            raise StorageNotFoundError(f"Local file not found: {key}")
        return target_path.read_bytes()

    async def read_async(self, key: str, is_public: bool = False) -> bytes:
        return await anyio.to_thread.run_sync(self.read, key, is_public)

    def delete(self, key: str, is_public: bool = False) -> bool:
        target_path = self._resolve_path(key)
        if target_path.exists():
            try:
                target_path.unlink()
            except OSError as exc:
                logger.warning("Failed to delete local file %s: %s", key, exc)
                return False
        return True

    async def delete_async(self, key: str, is_public: bool = False) -> bool:
        return await anyio.to_thread.run_sync(self.delete, key, is_public)

    def get_public_url(self, key: str) -> str:
        clean_key = key.lstrip("/").replace("\\", "/")
        return f"{self.public_base_url}/uploads/{clean_key}"


# ─── Supabase Storage Implementation ─────────────────────────────────────────


class SupabaseStorageService(StorageService):
    """
    Supabase Storage implementation using the documented Storage HTTP API.
    Uses bounded timeouts and safe retries without exposing secrets in logs.
    """

    def __init__(
        self,
        supabase_url: str,
        service_role_key: str,
        product_images_bucket: str = "product-images",
        private_files_bucket: str = "private-documents",
        timeout: float = 15.0,
        max_retries: int = 2,
    ):
        if not supabase_url or not supabase_url.startswith(("http://", "https://")):
            raise StorageConfigurationError(
                "SUPABASE_URL must be a valid HTTP/HTTPS URL when STORAGE_BACKEND is 'supabase'."
            )
        if not service_role_key or len(service_role_key.strip()) < 10:
            raise StorageConfigurationError(
                "SUPABASE_SERVICE_ROLE_KEY is required and must not be empty when STORAGE_BACKEND is 'supabase'."
            )

        self.supabase_url = supabase_url.rstrip("/")
        self._service_role_key = service_role_key.strip()
        self.product_images_bucket = product_images_bucket
        self.private_files_bucket = private_files_bucket
        self.timeout = timeout
        self.max_retries = max_retries

    def _get_bucket(self, is_public: bool) -> str:
        return self.product_images_bucket if is_public else self.private_files_bucket

    def _clean_key(self, key: str) -> str:
        clean = key.lstrip("/").replace("\\", "/")
        if not clean:
            raise StorageError("Invalid empty storage key")
        return clean

    def _headers(self, content_type: Optional[str] = None) -> dict[str, str]:
        h = {
            "Authorization": f"Bearer {self._service_role_key}",
            "apikey": self._service_role_key,
        }
        if content_type:
            h["Content-Type"] = content_type
        return h

    def upload(self, key: str, data: bytes, content_type: str, is_public: bool = False) -> str:
        clean_key = self._clean_key(key)
        bucket = self._get_bucket(is_public)
        url = f"{self.supabase_url}/storage/v1/object/{bucket}/{clean_key}"
        headers = self._headers(content_type)
        headers["x-upsert"] = "true"

        last_error = None
        for attempt in range(self.max_retries + 1):
            try:
                with httpx.Client(timeout=self.timeout) as client:
                    res = client.post(url, headers=headers, content=data)
                    if res.status_code in (200, 201):
                        return clean_key
                    if res.status_code in (500, 502, 503, 504) and attempt < self.max_retries:
                        time.sleep(0.5 * (attempt + 1))
                        continue
                    raise StorageError(f"Supabase Storage upload failed with status {res.status_code}: {res.text[:200]}")
            except (httpx.TimeoutException, httpx.NetworkError) as exc:
                last_error = exc
                if attempt < self.max_retries:
                    time.sleep(0.5 * (attempt + 1))
                    continue
                raise StorageError(f"Supabase Storage upload connection failed: {type(exc).__name__}") from exc
        raise StorageError(f"Supabase Storage upload exhausted retries: {last_error}")

    async def upload_async(self, key: str, data: bytes, content_type: str, is_public: bool = False) -> str:
        clean_key = self._clean_key(key)
        bucket = self._get_bucket(is_public)
        url = f"{self.supabase_url}/storage/v1/object/{bucket}/{clean_key}"
        headers = self._headers(content_type)
        headers["x-upsert"] = "true"

        last_error = None
        for attempt in range(self.max_retries + 1):
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    res = await client.post(url, headers=headers, content=data)
                    if res.status_code in (200, 201):
                        return clean_key
                    if res.status_code in (500, 502, 503, 504) and attempt < self.max_retries:
                        await anyio.sleep(0.5 * (attempt + 1))
                        continue
                    raise StorageError(f"Supabase Storage upload failed with status {res.status_code}: {res.text[:200]}")
            except (httpx.TimeoutException, httpx.NetworkError) as exc:
                last_error = exc
                if attempt < self.max_retries:
                    await anyio.sleep(0.5 * (attempt + 1))
                    continue
                raise StorageError(f"Supabase Storage upload connection failed: {type(exc).__name__}") from exc
        raise StorageError(f"Supabase Storage upload exhausted retries: {last_error}")

    def read(self, key: str, is_public: bool = False) -> bytes:
        clean_key = self._clean_key(key)
        bucket = self._get_bucket(is_public)
        url = f"{self.supabase_url}/storage/v1/object/authenticated/{bucket}/{clean_key}"
        headers = self._headers()

        last_error = None
        for attempt in range(self.max_retries + 1):
            try:
                with httpx.Client(timeout=self.timeout) as client:
                    res = client.get(url, headers=headers)
                    if res.status_code == 200:
                        return res.content
                    if res.status_code == 404:
                        raise StorageNotFoundError(f"Supabase Storage object '{clean_key}' not found in bucket '{bucket}'.")
                    if res.status_code in (500, 502, 503, 504) and attempt < self.max_retries:
                        time.sleep(0.5 * (attempt + 1))
                        continue
                    raise StorageError(f"Supabase Storage read failed with status {res.status_code}")
            except (httpx.TimeoutException, httpx.NetworkError) as exc:
                last_error = exc
                if attempt < self.max_retries:
                    time.sleep(0.5 * (attempt + 1))
                    continue
                raise StorageError(f"Supabase Storage read connection failed: {type(exc).__name__}") from exc
        raise StorageError(f"Supabase Storage read exhausted retries: {last_error}")

    async def read_async(self, key: str, is_public: bool = False) -> bytes:
        clean_key = self._clean_key(key)
        bucket = self._get_bucket(is_public)
        url = f"{self.supabase_url}/storage/v1/object/authenticated/{bucket}/{clean_key}"
        headers = self._headers()

        last_error = None
        for attempt in range(self.max_retries + 1):
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    res = await client.get(url, headers=headers)
                    if res.status_code == 200:
                        return res.content
                    if res.status_code == 404:
                        raise StorageNotFoundError(f"Supabase Storage object '{clean_key}' not found in bucket '{bucket}'.")
                    if res.status_code in (500, 502, 503, 504) and attempt < self.max_retries:
                        await anyio.sleep(0.5 * (attempt + 1))
                        continue
                    raise StorageError(f"Supabase Storage read failed with status {res.status_code}")
            except (httpx.TimeoutException, httpx.NetworkError) as exc:
                last_error = exc
                if attempt < self.max_retries:
                    await anyio.sleep(0.5 * (attempt + 1))
                    continue
                raise StorageError(f"Supabase Storage read connection failed: {type(exc).__name__}") from exc
        raise StorageError(f"Supabase Storage read exhausted retries: {last_error}")

    def delete(self, key: str, is_public: bool = False) -> bool:
        clean_key = self._clean_key(key)
        bucket = self._get_bucket(is_public)
        url = f"{self.supabase_url}/storage/v1/object/{bucket}/{clean_key}"
        headers = self._headers()

        try:
            with httpx.Client(timeout=self.timeout) as client:
                res = client.delete(url, headers=headers)
                if res.status_code in (200, 204, 404):
                    return True
                logger.warning("Supabase Storage delete status %s for key %s: %s", res.status_code, clean_key, res.text[:100])
                return False
        except Exception as exc:
            logger.warning("Supabase Storage delete error for key %s: %s", clean_key, exc)
            return False

    async def delete_async(self, key: str, is_public: bool = False) -> bool:
        clean_key = self._clean_key(key)
        bucket = self._get_bucket(is_public)
        url = f"{self.supabase_url}/storage/v1/object/{bucket}/{clean_key}"
        headers = self._headers()

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                res = await client.delete(url, headers=headers)
                if res.status_code in (200, 204, 404):
                    return True
                logger.warning("Supabase Storage delete status %s for key %s: %s", res.status_code, clean_key, res.text[:100])
                return False
        except Exception as exc:
            logger.warning("Supabase Storage delete error for key %s: %s", clean_key, exc)
            return False

    def get_public_url(self, key: str) -> str:
        clean_key = self._clean_key(key)
        return f"{self.supabase_url}/storage/v1/object/public/{self.product_images_bucket}/{clean_key}"


# ─── Service Factory ──────────────────────────────────────────────────────────


_storage_instance: Optional[StorageService] = None


def get_storage_service(custom_settings: Optional[Settings] = None) -> StorageService:
    """
    Factory function returning the configured StorageService instance.
    Validates required settings when Supabase is selected.
    """
    cfg = custom_settings or settings
    backend_mode = (cfg.storage_backend or "local").strip().lower()

    if backend_mode == "supabase":
        return SupabaseStorageService(
            supabase_url=cfg.supabase_url,
            service_role_key=cfg.supabase_service_role_key,
            product_images_bucket=cfg.supabase_product_images_bucket,
            private_files_bucket=cfg.supabase_private_files_bucket,
        )
    elif backend_mode == "local":
        return LocalStorageService(
            upload_dir=cfg.upload_dir,
            public_base_url=cfg.public_base_url,
        )
    else:
        raise StorageConfigurationError(
            f"Unsupported STORAGE_BACKEND '{cfg.storage_backend}'. Allowed options are 'local' or 'supabase'."
        )


def get_storage() -> StorageService:
    """Convenience accessor using application settings."""
    global _storage_instance
    if _storage_instance is None:
        _storage_instance = get_storage_service()
    return _storage_instance


def reset_storage():
    """Reset cached singleton instance (useful for testing configuration changes)."""
    global _storage_instance
    _storage_instance = None
