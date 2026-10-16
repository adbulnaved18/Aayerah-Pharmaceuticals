import os
import math
from typing import List, Dict, Any
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()
if "GEMINI_API_KEY" in os.environ:
    genai.configure(api_key=os.environ["GEMINI_API_KEY"])


class DocumentChunk:
    def __init__(self, text: str, metadata: Dict[str, Any], embedding: List[float] = None):
        self.text = text
        self.metadata = metadata
        self.embedding = embedding or []

# In-memory vector store for MVP
VECTOR_STORE: List[DocumentChunk] = []

def extract_text_from_pdf(file_bytes: bytes) -> str:
    """
    Mock PDF extraction. In reality, use PyPDF2 or pdfplumber.
    """
    return "This is extracted text from the PDF. Returns are accepted within 7 days. Free shipping over $35."

def chunk_text(text: str, chunk_size: int = 500, overlap: int = 75) -> List[str]:
    """
    Split text into chunks.
    """
    # Simple mock chunking
    words = text.split()
    chunks = []
    for i in range(0, len(words), chunk_size - overlap):
        chunk = " ".join(words[i:i + chunk_size])
        if chunk:
            chunks.append(chunk)
    return chunks

def get_embedding(text: str) -> List[float]:
    """
    Generate embedding using Gemini API.
    """
    try:
        response = genai.embed_content(model="models/gemini-embedding-001", content=text)
        return response['embedding']
    except Exception as e:
        print(f"Gemini embedding error: {e}")
        h = hash(text)
        vec = [float((h >> i) & 1) for i in range(768)]
        norm = math.sqrt(sum(x*x for x in vec)) if sum(x*x for x in vec) > 0 else 1.0
        return [x/norm for x in vec]

def cosine_similarity(v1: List[float], v2: List[float]) -> float:
    dot = sum(a*b for a, b in zip(v1, v2))
    return dot

def ingest_document(title: str, text: str, page: int):
    chunks = chunk_text(text)
    for c in chunks:
        emb = get_embedding(c)
        VECTOR_STORE.append(DocumentChunk(
            text=c,
            metadata={"title": title, "page": page},
            embedding=emb
        ))

def retrieve(query: str, top_k: int = 4) -> List[DocumentChunk]:
    if not VECTOR_STORE:
        return []
    
    query_emb = get_embedding(query)
    scored = []
    for chunk in VECTOR_STORE:
        score = cosine_similarity(query_emb, chunk.embedding)
        scored.append((score, chunk))
    
    scored.sort(key=lambda x: x[0], reverse=True)
    return [item[1] for item in scored[:top_k]]

def generate_answer(query: str, retrieved_chunks: List[DocumentChunk]) -> Dict[str, Any]:
    """
    Gemini Flash generation using retrieved context. 
    """
    if not retrieved_chunks:
        return {
            "answer": "I don't have enough information to answer that.",
            "sources": []
        }
    
    sources = [{"title": c.metadata["title"], "page": c.metadata["page"]} for c in retrieved_chunks]
    
    try:
        context = "\n\n".join([c.text for c in retrieved_chunks])
        prompt = f"Context:\n{context}\n\nQuestion: {query}\n\nAnswer based on the context:"
        model = genai.GenerativeModel("gemini-3.8-flash")
        response = model.generate_content(prompt)
        answer = response.text
    except Exception as e:
        print(f"Gemini generation error: {e}")
        # Fallback if API fails
        answer = f"According to our documents, {retrieved_chunks[0].text[:50]}..."
        
    return {
        "answer": answer,
        "sources": sources
    }

# Pre-populate store with some mock data for the widget to use
ingest_document("Returns Policy", "Eligible items can be returned within 7 days.", 2)
ingest_document("Shipping & Delivery", "We offer free delivery on orders over $35. Most orders arrive within 2-3 business days.", 1)
