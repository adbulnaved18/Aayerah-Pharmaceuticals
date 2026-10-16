from decimal import Decimal
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')
    database_url: str = 'postgresql+psycopg://postgres:postgres@localhost:5432/base'
    cors_origins: list[str] = ['http://localhost:5173', 'http://localhost:8080']
    public_base_url: str = 'http://localhost:8000'
    upload_dir: str = './uploads'
    max_image_bytes: int = 5 * 1024 * 1024
    session_hours: int = 24
    currency: str = Field(default='INR', pattern=r'^[A-Z]{3}$')
    shipping_fee: Decimal = Field(default=Decimal('20.00'), ge=0, le=999999, decimal_places=2)
    gemini_api_key: str = ''  # Set GEMINI_API_KEY in .env for LLM invoice extraction

    # Storage backend configuration ('local' | 'supabase')
    storage_backend: str = 'local'
    supabase_url: str = ''
    supabase_service_role_key: str = ''
    supabase_product_images_bucket: str = 'product-images'
    supabase_private_files_bucket: str = 'private-documents'

settings = Settings()
