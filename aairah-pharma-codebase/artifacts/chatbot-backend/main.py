from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import uvicorn
import asyncio
from rag import retrieve, generate_answer, ingest_document, extract_text_from_pdf

app = FastAPI(title="Store Chatbot API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatMessage(BaseModel):
    message: str
    session_id: str

class Source(BaseModel):
    title: str
    page: int

class ChatResponse(BaseModel):
    answer: str
    sources: List[Source]
    message_id: str
    fallback: bool

@app.post("/api/chat/messages", response_model=ChatResponse)
async def chat_messages(req: ChatMessage):
    await asyncio.sleep(0.5) # Slight delay to simulate processing
    
    # RAG pipeline
    retrieved = retrieve(req.message, top_k=2)
    response_data = generate_answer(req.message, retrieved)
    
    return ChatResponse(
        answer=response_data["answer"],
        sources=[Source(**s) for s in response_data["sources"]],
        message_id="msg-" + str(hash(req.message)),
        fallback=False
    )

@app.post("/api/admin/chatbot/documents")
async def upload_document(
    file: UploadFile = File(...),
    title: str = Form(...),
    category: str = Form(...),
    audience: str = Form(...)
):
    # Read PDF (Mock)
    content = await file.read()
    text = extract_text_from_pdf(content)
    
    # Ingest to vector store
    ingest_document(title, text, page=1)
    
    return {"status": "success", "document_id": "doc-test", "message": f"Processed {title} into chunks and embeddings."}

class LoginRequest(BaseModel):
    email: str
    password: str

@app.post("/owner/login")
async def owner_login(req: LoginRequest):
    if req.email == "admin@example.com" and req.password == "Password123!":
        return {
            "token": "mock-admin-token",
            "user": {
                "id": "admin-1",
                "email": "admin@example.com",
                "fullname": "Store Admin",
                "role": "owner"
            }
        }
    raise HTTPException(status_code=401, detail="Invalid credentials")

@app.get("/user/me")
async def user_me():
    return {
        "id": "admin-1",
        "email": "admin@example.com",
        "fullname": "Store Admin",
        "role": "owner"
    }

@app.get("/owner/orders")
async def owner_orders():
    return []

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)
