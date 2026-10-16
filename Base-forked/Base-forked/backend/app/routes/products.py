import io
import warnings
from pathlib import Path
from uuid import uuid4
from typing import Optional
from fastapi import APIRouter, HTTPException, Request, Query, File, Form, UploadFile
from fastapi.responses import PlainTextResponse
from pydantic import ValidationError
from PIL import Image, UnidentifiedImageError
from sqlalchemy import select, or_
from ..config import settings
from ..models import Product
from ..schemas import ProductInput
from ..security import DB, Owner
from ..serializers import product_json
from ..services.stock_import_service import (
    parse_strict_csv_bytes,
    parse_strict_xlsx_bytes,
    parse_strict_xls_bytes,
    parse_spreadsheet_bytes,
    bulk_import_inventory,
    generate_inventory_csv_template,
)

router = APIRouter(prefix='/product', tags=['Products'])

@router.get('/shop')
def shop(db: DB, search: str = Query('', max_length=200), category: str | None = None,
         offset: int = Query(0, ge=0), limit: int = Query(200, ge=1, le=500)):
    query = select(Product).where(Product.active.is_(True))
    if search:
        escaped = search.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')
        query = query.where(or_(Product.name.ilike(f'%{escaped}%', escape='\\'), Product.description.ilike(f'%{escaped}%', escape='\\')))
    if category: query = query.where(Product.category == category)
    return [product_json(p) for p in db.scalars(query.order_by(Product.created_at.desc(), Product.id).offset(offset).limit(limit))]

@router.get('/categories')
def categories(db: DB):
    return list(db.scalars(select(Product.category).where(Product.active.is_(True)).distinct().order_by(Product.category)))

def get_product(db, product_id, lock=False):
    query = select(Product).where(Product.id == product_id, Product.active.is_(True))
    if lock: query = query.with_for_update()
    product = db.scalar(query)
    if not product: raise HTTPException(404, 'Product not found')
    return product

@router.get('/product/{product_id}')
def detail(product_id: str, db: DB): return product_json(get_product(db, product_id))

from ..services.storage import get_storage

from starlette.datastructures import UploadFile as StarletteUploadFile

async def parse_product(request, existing=None):
    uploaded = None
    if request.headers.get('content-type', '').startswith('multipart/form-data'):
        form = await request.form(max_files=1, max_fields=15, max_part_size=settings.max_image_bytes)
        data = dict(form)
        uploaded = data.pop('image', None)
        if uploaded is not None and not isinstance(uploaded, (UploadFile, StarletteUploadFile)) and not hasattr(uploaded, 'read'):
            raise HTTPException(422, 'Image must be a file')
    else:
        try: data = await request.json()
        except ValueError: raise HTTPException(422, 'Invalid JSON')
    if not isinstance(data, dict): raise HTTPException(422, 'Expected an object')
    if existing:
        data = {**{key: getattr(existing, key) for key in ProductInput.model_fields}, **data}
    try: validated = ProductInput.model_validate(data)
    except ValidationError as exc: raise HTTPException(422, [{'loc': list(e['loc']), 'msg': e['msg']} for e in exc.errors()])
    image_bytes = None
    new_key = None
    if uploaded:
        raw = await uploaded.read(settings.max_image_bytes + 1)
        if len(raw) > settings.max_image_bytes: raise HTTPException(413, 'Image exceeds upload limit')
        try:
            with warnings.catch_warnings():
                warnings.simplefilter('error', Image.DecompressionBombWarning)
                with Image.open(io.BytesIO(raw)) as img:
                    if img.format not in {'JPEG', 'PNG', 'WEBP'}: raise ValueError('Unsupported format')
                    if img.width * img.height > 20_000_000: raise ValueError('Too many pixels')
                    img.load()
                    img.thumbnail((1600, 1600))
                    output = io.BytesIO()
                    img.convert('RGB').save(output, 'WEBP', quality=85)
                    image_bytes = output.getvalue()
        except (UnidentifiedImageError, ValueError, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning):
            raise HTTPException(422, 'Provide a valid JPEG, PNG or WebP image under 20 megapixels')
        new_key = f'{uuid4().hex}.webp'
    return validated.model_dump(), image_bytes, new_key

@router.post('/createproduct', status_code=201)
async def create(request: Request, db: DB, admin: Owner):
    data, image_bytes, new_key = await parse_product(request)
    storage = get_storage()
    image_url = ''
    image_public_id = ''
    if image_bytes and new_key:
        await storage.upload_async(new_key, image_bytes, 'image/webp', is_public=True)
        image_url = storage.get_public_url(new_key)
        image_public_id = new_key

    product = Product(**data, image=image_url, image_public_id=image_public_id, owner_id=admin.id)
    try:
        db.add(product)
        db.commit()
    except Exception:
        if new_key:
            try:
                await storage.delete_async(new_key, is_public=True)
            except Exception:
                pass
        raise
    result = product_json(product)
    return {**result, 'product': result, 'message': 'Product saved'}

@router.post('/updateproduct/{product_id}')
@router.put('/updateproduct/{product_id}')
async def update(product_id: str, request: Request, db: DB, admin: Owner):
    product = get_product(db, product_id, lock=True)
    old_key = product.image_public_id
    data, image_bytes, new_key = await parse_product(request, product)
    storage = get_storage()

    if image_bytes and new_key:
        # Upload new image first
        await storage.upload_async(new_key, image_bytes, 'image/webp', is_public=True)
        product.image = storage.get_public_url(new_key)
        product.image_public_id = new_key

    for key, value in data.items():
        setattr(product, key, value)

    try:
        db.commit()
    except Exception:
        # If DB update fails, attempt cleanup of newly uploaded image
        if new_key:
            try:
                await storage.delete_async(new_key, is_public=True)
            except Exception:
                pass
        raise

    # If DB update succeeded and a new image replaced an existing one, delete old image
    if new_key and old_key and old_key != new_key:
        try:
            await storage.delete_async(old_key, is_public=True)
        except Exception:
            pass

    result = product_json(product)
    return {**result, 'product': result, 'message': 'Product saved'}

@router.post('/deleteproduct/{product_id}')
@router.delete('/deleteproduct/{product_id}')
def delete(product_id: str, db: DB, admin: Owner):
    product = get_product(db, product_id, lock=True)
    product.active = False
    db.commit()
    return {'message': 'Product archived'}


@router.get('/bulk-import/template')
def download_bulk_template(_: Owner):
    """Download the strict CSV template for adding products to inventory."""
    csv_text = generate_inventory_csv_template()
    return PlainTextResponse(
        content=csv_text,
        media_type='text/csv',
        headers={'Content-Disposition': 'attachment; filename=aayerah_inventory_import_template.csv'}
    )


@router.post('/bulk-import')
async def bulk_import(
    db: DB,
    admin: Owner,
    file: UploadFile = File(...),
    category: Optional[str] = Form('General'),
    mode: Optional[str] = Form('commit'),  # 'commit' or 'preview'
):
    """
    Bulk Add to Inventory via strict CSV format:
    Row 1: ITEM DESCRIPTION,,RATE,OPENING,,RECEIPT,,ISSUE,,CLOSING,
    Row 2: ,,,QTY.,VALUE,QTY.,VALUE,QTY.,VALUE,QTY.,VALUE
    
    Accepts CSV or XLSX, validates format strictly, and adds all products to inventory.
    """
    fname = file.filename or ''
    ext = '.' + fname.rsplit('.', 1)[-1].lower() if '.' in fname else ''
    if ext not in {'.csv', '.xlsx', '.xls'}:
        raise HTTPException(415, f"Only .xls, .xlsx, and .csv files are supported (got '{ext}').")

    raw = await file.read()
    if len(raw) > 10 * 1024 * 1024:
        raise HTTPException(413, "Spreadsheet exceeds 10 MiB limit.")

    # Strictly parse spreadsheet (.xls, .xlsx, or .csv)
    try:
        raw_rows = parse_spreadsheet_bytes(raw, fname)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(422, f"Could not parse spreadsheet: {exc}")

    if not raw_rows:
        raise HTTPException(422, "Spreadsheet contains no product data rows (rows start after line 2).")

    is_commit = (mode != 'preview')
    result = bulk_import_inventory(
        raw_rows=raw_rows,
        db=db,
        owner_id=admin.id,
        default_category=category or 'General',
        commit=is_commit,
    )
    return result

