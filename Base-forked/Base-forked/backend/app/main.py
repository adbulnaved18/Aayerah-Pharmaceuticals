from pathlib import Path
from fastapi import FastAPI, Request, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from .config import settings
from .security import DB
from .routes import auth, products, chat, stock_imports, offline_sales, sales_analytics

app = FastAPI(
    title='Aayerah Pharma API',
    version='2.0.0',
    description='Promotional and informational pharmaceutical catalogue API with authenticated owner administration.'
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allow_headers=['Content-Type', 'Authorization', 'Idempotency-Key']
)

@app.exception_handler(HTTPException)
async def http_error(request, exc):
    return JSONResponse(status_code=exc.status_code, content={'error': exc.detail}, headers=exc.headers)

@app.exception_handler(RequestValidationError)
async def validation_error(request, exc):
    return JSONResponse(status_code=422, content={'error': 'Validation failed', 'details': [
        {'loc': list(e['loc']), 'msg': e['msg'], 'type': e['type']} for e in exc.errors()]})

@app.middleware('http')
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers['X-Content-Type-Options'] = 'nosniff'
    if not request.url.path.startswith('/uploads/'):
        response.headers['Cache-Control'] = 'no-store'
    return response

@app.get('/', tags=['Health'])
@app.get('/health', tags=['Health'])
@app.get('/api/health', tags=['Health'])
def health():
    return {'status': 'ok', 'app': 'Aayerah Pharma Promotional & Catalogue Service'}

@app.get('/api/ready', tags=['Health'])
def ready(db: DB):
    try:
        db.execute(text('SELECT 1 FROM alembic_version LIMIT 1'))
    except SQLAlchemyError:
        raise HTTPException(503, 'Database unavailable or migrations missing')
    return {'status': 'ready'}

# Mount active routers (Auth, Products catalogue, Stock Imports, Offline Sales, Sales Analytics)
for router in [auth.router, products.router, stock_imports.router, offline_sales.router, sales_analytics.router]:
    app.include_router(router)
    app.include_router(router, prefix='/api', include_in_schema=False)

app.include_router(chat.router)

# Retired ecommerce endpoints respond with intentional 410 Gone
@app.api_route('/cart', methods=['GET', 'POST', 'PUT', 'DELETE', 'PATCH'], include_in_schema=False)
@app.api_route('/cart/{path:path}', methods=['GET', 'POST', 'PUT', 'DELETE', 'PATCH'], include_in_schema=False)
@app.api_route('/api/cart', methods=['GET', 'POST', 'PUT', 'DELETE', 'PATCH'], include_in_schema=False)
@app.api_route('/api/cart/{path:path}', methods=['GET', 'POST', 'PUT', 'DELETE', 'PATCH'], include_in_schema=False)
@app.api_route('/orders', methods=['GET', 'POST', 'PUT', 'DELETE', 'PATCH'], include_in_schema=False)
@app.api_route('/orders/{path:path}', methods=['GET', 'POST', 'PUT', 'DELETE', 'PATCH'], include_in_schema=False)
@app.api_route('/api/orders', methods=['GET', 'POST', 'PUT', 'DELETE', 'PATCH'], include_in_schema=False)
@app.api_route('/api/orders/{path:path}', methods=['GET', 'POST', 'PUT', 'DELETE', 'PATCH'], include_in_schema=False)
def retired_ecommerce(path: str = ''):
    raise HTTPException(
        status_code=410,
        detail='Online ordering and cart workflows are permanently disabled. Aayerah operates as an informational catalogue with verified offline dispensing.'
    )
# Mount local uploads static files only when running in local storage mode
if (settings.storage_backend or 'local').strip().lower() == 'local':
    Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
    app.mount('/uploads', StaticFiles(directory=settings.upload_dir), name='uploads')

