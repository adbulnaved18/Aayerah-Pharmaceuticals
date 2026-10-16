import re
from typing import List, Optional
from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import select
from ..models import Product
from ..security import DB

router = APIRouter(prefix="", tags=["Chatbot"])

class ChatMessage(BaseModel):
    message: str
    session_id: Optional[str] = "default-session"

class Source(BaseModel):
    title: str
    page: int = 1

class ChatResponse(BaseModel):
    answer: str
    sources: List[Source] = []
    message_id: str = "msg-1"
    fallback: bool = False

# Comprehensive Static Knowledge Base for Aayerah Pharma
KNOWLEDGE_BASE = [
    {
        "keywords": ["restock format", "csv format", "restock csv", "inventory csv", "add to inventory", "bulk import", "column names", "spreadsheet format"],
        "answer": (
            "**Aayerah Strict Inventory & Restock CSV Format:**\n\n"
            "Both **Restock** and **Add to Inventory** strictly require the standard 2-tier column layout:\n\n"
            "• **Header Row 1**: `ITEM DESCRIPTION,,RATE,OPENING,,RECEIPT,,ISSUE,,CLOSING,`\n"
            "• **Header Row 2**: `,,,QTY.,VALUE,QTY.,VALUE,QTY.,VALUE,QTY.,VALUE`\n\n"
            "**Column Mapping:**\n"
            "1. **ITEM DESCRIPTION**: Product name / SKU identifier\n"
            "2. **RATE**: Product unit price (INR)\n"
            "3. **OPENING (QTY. / VALUE)**: Beginning stock balance and valuation\n"
            "4. **RECEIPT (QTY. / VALUE)**: Received restock quantity to add into inventory\n"
            "5. **ISSUE (QTY. / VALUE)**: Dispatched / dispensed quantities\n"
            "6. **CLOSING (QTY. / VALUE)**: Ending stock balance and valuation\n\n"
            "You can download the template directly from **Restock** or **Inventory > Bulk Import**."
        ),
        "source": "Inventory Operations • Stock Spreadsheet Standard",
        "page": 1
    },
    {
        "keywords": ["director", "halima", "sadeeya", "halima sadeeya", "founder", "founding director", "leader", "who runs", "head of company"],
        "answer": (
            "**Halima Sadeeya** is the **Founding Director** of Aayerah Pharmaceuticals Private Limited.\n\n"
            "• **Role**: Founding Director (Director since 15 January 2019)\n"
            "• **DIN**: `08332369`\n"
            "• **Focus**: Corporate governance, pharmaceutical ethics, regulatory compliance under ROC Cuttack, and NIC 851 human health stewardship."
        ),
        "source": "Corporate Leadership • Board of Directors",
        "page": 1
    },
    {
        "keywords": ["director", "akbar", "khan", "akbar khan", "operations head", "supply chain head"],
        "answer": (
            "**Akbar Khan** is a **Director** of Aayerah Pharmaceuticals Private Limited.\n\n"
            "• **Role**: Director (Director since 11 October 2021)\n"
            "• **DIN**: `09322764`\n"
            "• **Focus**: Pharmaceutical distribution networks, cold-chain storage compliance, and regional hospital supply across Odisha."
        ),
        "source": "Corporate Leadership • Board of Directors",
        "page": 1
    },
    {
        "keywords": ["leadership", "executives", "directors", "management", "board", "founders", "who is the team", "team members", "officers"],
        "answer": (
            "**Aayerah Pharmaceuticals Private Limited Board of Directors:**\n\n"
            "1. **Halima Sadeeya** – Founding Director (DIN: `08332369`, Appointed 15 Jan 2019)\n"
            "   *Focus: Corporate governance, statutory oversight & ethical formulations*\n\n"
            "2. **Akbar Khan** – Director (DIN: `09322764`, Appointed 11 Oct 2021)\n"
            "   *Focus: Commercial logistics, cold-chain rigor & distribution networks*"
        ),
        "source": "Leadership & Governance • MCA Registry",
        "page": 1
    },
    {
        "keywords": ["cin", "registration", "roc", "cuttack", "gst", "gstin", "tax", "license", "licence", "compliance", "nic", "851", "capital"],
        "answer": (
            "**Aayerah Pharmaceuticals Private Limited Statutory Profile:**\n\n"
            "• **CIN**: `U85100OR2019PTC030264` (Ministry of Corporate Affairs)\n"
            "• **Registration Number**: `30264` (ROC Cuttack, Odisha)\n"
            "• **Incorporation Date**: 15 January 2019 (7+ Years in operation)\n"
            "• **Classification**: Human Health Activities (NIC Code 851)\n"
            "• **Company Status**: Active & Unlisted (Non-Govt Private Company)\n"
            "• **Authorised Capital**: ₹10,00,000 | **Paid-up Capital**: ₹1,00,000\n\n"
            "All statutory filings are active and registered under the Registrar of Companies, Cuttack."
        ),
        "source": "Regulatory & Statutory Compliance • MCA Records",
        "page": 1
    },
    {
        "keywords": ["address", "location", "facility", "headquarters", "where are you", "visit", "premise", "office", "directions", "patasahanipur", "odisha"],
        "answer": (
            "**Registered Office & Distribution Facility:**\n\n"
            "📍 **Official Registered Address**:\n"
            "6PFP+WGV, Patasahanipur,\n"
            "Odisha 752054, India\n\n"
            "• **Location**: Patasahanipur | **State**: Odisha | **PIN**: 752054\n"
            "• **Facility Timings**: Monday – Saturday (9:00 AM – 7:30 PM)\n"
            "Direct prescription verification and offline distribution take place at our registered premises."
        ),
        "source": "Facility Access & Registered Office",
        "page": 1
    },
    {
        "keywords": ["phone", "call", "contact number", "mobile", "helpline", "telephone", "reception"],
        "answer": (
            "**Direct Contact Numbers:**\n\n"
            "• **Wholesale & Inquiries**: +1 (800) 555-0199\n"
            "• **Facility Reception & Counter**: +91 98765 43210\n\n"
            "Our staff is available during standard operating hours to confirm product batches and stock status."
        ),
        "source": "Direct Contact Channels",
        "page": 1
    },
    {
        "keywords": ["email", "mail", "contact email", "support email"],
        "answer": (
            "**Official Email Contacts:**\n\n"
            "• **Official Inquiries & Contact**: debabrata_pattnaik@yahoo.com\n\n"
            "You can also send a direct inquiry through the Contact form on our website."
        ),
        "source": "Contact Directory",
        "page": 1
    },
    {
        "keywords": ["timing", "timings", "hours", "open", "opening hours", "closing", "sunday", "working days", "when are you open"],
        "answer": (
            "**Aayerah Operating Hours:**\n\n"
            "• **Monday – Saturday**: 9:00 AM – 7:30 PM (Full counter services, consultations & dispensing)\n"
            "• **Sunday**: 10:00 AM – 2:00 PM (*Emergency dispensing only*)"
        ),
        "source": "Operating Schedule",
        "page": 1
    },
    {
        "keywords": ["history", "founded", "established", "est", "years", "legacy", "about", "who are you", "company profile", "values"],
        "answer": (
            "**About Aayerah Pharma:**\n\n"
            "• **Established**: 2014 (Over 10+ years of pharmaceutical excellence)\n"
            "• **Network**: 18 global partners and 24/7 care guidance\n"
            "• **Guiding Motto**: *Care is a practice*\n\n"
            "**Core Principles:**\n"
            "1. *Integrity in the details* — Transparent, honest guidance on what medicines are and how to use them responsibly.\n"
            "2. *Science, translated* — Evidence-based therapeutics communicated clearly to patients.\n"
            "3. *Care without theatre* — No fear-based marketing; genuine pharmaceutical support."
        ),
        "source": "Company Overview & Legacy",
        "page": 1
    },
    {
        "keywords": ["online order", "buy online", "cart", "checkout", "delivery", "shipping", "home delivery", "ecommerce"],
        "answer": (
            "**Aayerah Website Operating Model:**\n\n"
            "Aayerah functions exclusively as an **informational and promotional pharmaceutical catalogue**.\n\n"
            "• **No Online Checkout**: In strict accordance with healthcare regulations, we do not process online transactions or domestic couriers for medications via this website.\n"
            "• **Offline Dispensing**: Patients and healthcare partners can inspect products, verify stock online, and obtain medications at our registered facility or coordinate institutional dispatch."
        ),
        "source": "Dispensing & Terms Policy",
        "page": 1
    },
    {
        "keywords": ["prescription", "rx", "doctor prescription", "scheduled", "otc"],
        "answer": (
            "**Prescription (Rx) & OTC Guidelines:**\n\n"
            "• **Prescription (Rx) Items**: Items flagged as *Rx Required* require an original, valid prescription issued by a licensed medical practitioner before physical dispensing.\n"
            "• **Over-The-Counter (OTC)**: General wellness, hygiene, first-aid, and supplements do not require a prescription.\n"
            "• In accordance with pharmaceutical safety protocols, all prescription verification occurs offline at our counter."
        ),
        "source": "Prescription Dispensing Protocols",
        "page": 1
    },
    {
        "keywords": ["hospital", "clinic", "institutional", "wholesale", "bulk", "supply"],
        "answer": (
            "**Institutional Supply & Logistics:**\n\n"
            "Aayerah maintains a dedicated supply chain for hospitals, medical clinics, and accredited healthcare partners.\n"
            "• Scheduled cold-chain & bulk dispatch available.\n"
            "• For institutional procurement, reach out to **Wholesale & Inquiries** at `+1 (800) 555-0199` or email `contact@aayerah.com`."
        ),
        "source": "Institutional Logistics",
        "page": 1
    },
    {
        "keywords": ["return", "returns", "refund", "exchange"],
        "answer": (
            "**Returns & Quality Policy:**\n\n"
            "Due to drug safety and temperature-control regulations, medications once dispensed cannot be returned unless there is an evident manufacturer defect or damage upon handover.\n"
            "For non-medicated medical supplies or packaging discrepancies, offline resolution is supported within 7 days with your receipt at our pharmacy desk."
        ),
        "source": "Terms & Conditions",
        "page": 1
    },
    {
        "keywords": ["privacy", "data", "confidential"],
        "answer": (
            "**Privacy & Patient Data Protection:**\n\n"
            "We adhere to strict data protection standards. We only collect voluntary inquiry submissions and do not store or sell patient health information online. Offline records are retained strictly per statutory pharmaceutical record-keeping laws."
        ),
        "source": "Privacy Policy",
        "page": 1
    }
]

def find_matching_kb(query: str) -> Optional[dict]:
    query_lower = query.lower()
    best_match = None
    best_score = 0

    for item in KNOWLEDGE_BASE:
        score = 0
        for kw in item["keywords"]:
            if kw in query_lower:
                # Longer keywords have higher weight
                score += len(kw.split()) * 2 + 1
        if score > best_score:
            best_score = score
            best_match = item

    if best_score > 0:
        return best_match
    return None

def find_relevant_products(query: str, db: DB) -> list[Product]:
    """Find products matching words or full name in the user prompt."""
    query_lower = query.lower()
    cleaned = re.sub(
        r'\b(hey|hello|hi|please|do|you|know|how|much|stock|of|is|left|what|the|price|available|for|in|can|i|buy|get|tell|me|about)\b',
        ' ',
        query_lower
    )
    words = [w.strip() for w in cleaned.split() if len(w.strip()) >= 3]

    all_products = db.scalars(select(Product).where(Product.active.is_(True))).all()
    
    matched = []
    for p in all_products:
        p_name_lower = p.name.lower()
        p_desc_lower = (p.description or "").lower()
        p_cat_lower = (p.category or "").lower()

        # Check exact phrase or words
        if any(w in p_name_lower for w in words):
            matched.append(p)
        elif query_lower in p_name_lower or p_name_lower in query_lower:
            matched.append(p)
        elif any(w in p_desc_lower for w in words if len(w) >= 4):
            matched.append(p)
        elif any(w in p_cat_lower for w in words if len(w) >= 4):
            matched.append(p)

    return matched

@router.post("/api/chat/messages", response_model=ChatResponse)
@router.post("/chat/messages", response_model=ChatResponse)
def handle_chat(req: ChatMessage, db: DB):
    user_query = req.message.strip()
    user_lower = user_query.lower()

    # 1. Product specific query check
    matching_products = find_relevant_products(user_query, db)

    # If the user specifically mentions a product name or asks about stock/price
    is_product_intent = any(k in user_lower for k in ["stock", "price", "dawai", "cost", "medicine", "pill", "tablet", "syrup", "liquid", "antiseptic", "how much", "available", "units"])
    
    if matching_products and (is_product_intent or len(user_query.split()) <= 4):
        primary = matching_products[0]
        sources = [Source(title=f"Catalog: {primary.name}", page=1)]
        
        is_stock_query = any(k in user_lower for k in ["stock", "left", "many", "quantity", "available", "units"])
        is_price_query = any(k in user_lower for k in ["price", "cost", "how much", "rate", "₹", "dollar", "inr"])

        if is_stock_query and not is_price_query:
            if primary.stock > 0:
                answer = (
                    f"We currently have **{primary.stock} units** of **{primary.name}** in stock.\n\n"
                    f"• **Category**: {primary.category}\n"
                    f"• **Price**: ₹{float(primary.price):.2f}\n"
                    f"• **Status**: In stock & available for offline dispensing."
                )
            else:
                answer = f"**{primary.name}** is currently **out of stock**. Please check back or contact our dispensing desk for updates."
        elif is_price_query and not is_stock_query:
            answer = (
                f"**{primary.name}** is priced at **₹{float(primary.price):.2f}**.\n\n"
                f"• **Current Stock**: {primary.stock} units\n"
                f"• **Category**: {primary.category}"
            )
        else:
            stock_str = f"**{primary.stock} units in stock**" if primary.stock > 0 else "**Out of stock**"
            desc_str = f"\n• **Details**: {primary.description}" if primary.description else ""
            answer = (
                f"**{primary.name}**\n\n"
                f"• **Category**: {primary.category}\n"
                f"• **Price**: ₹{float(primary.price):.2f}\n"
                f"• **Availability**: {stock_str}{desc_str}\n\n"
                f"You can view complete clinical details in our online catalogue or collect it at our registered pharmacy counter."
            )

        if len(matching_products) > 1:
            others = ", ".join(p.name for p in matching_products[1:3])
            answer += f"\n\n*Related items in catalogue:* {others}."

        return ChatResponse(
            answer=answer,
            sources=sources,
            message_id=f"msg-{abs(hash(user_query))}",
            fallback=False
        )

    # 2. Check Static Knowledge Base (Leadership, GST, Tax ID, License, Address, Hours, Principles, Policies)
    kb_match = find_matching_kb(user_query)
    if kb_match:
        return ChatResponse(
            answer=kb_match["answer"],
            sources=[Source(title=kb_match["source"], page=kb_match["page"])],
            message_id=f"msg-{abs(hash(user_query))}",
            fallback=False
        )

    # 3. If products matched even without strong product keyword
    if matching_products:
        primary = matching_products[0]
        return ChatResponse(
            answer=(
                f"**{primary.name}** ({primary.category})\n\n"
                f"• **Price**: ₹{float(primary.price):.2f}\n"
                f"• **Stock**: {primary.stock} units\n"
                f"• **Indication**: {primary.description or 'Certified pharmaceutical item.'}"
            ),
            sources=[Source(title=f"Catalog: {primary.name}", page=1)],
            message_id=f"msg-{abs(hash(user_query))}",
            fallback=False
        )

    # 4. Comprehensive Fallback Directory
    all_products = db.scalars(select(Product.name).where(Product.active.is_(True)).limit(4)).all()
    sample_list = ", ".join(f'"{name}"' for name in all_products) if all_products else "our products"

    return ChatResponse(
        answer=(
            "I can assist you with complete details across the entire Aayerah website, including:\n\n"
            f"• **Products & Inventory**: Live stock levels and pricing for {sample_list}.\n"
            "• **Leadership Team**: Founding Director Halima Sadeeya (DIN 08332369) & Director Akbar Khan (DIN 09322764).\n"
            "• **Statutory & Compliance**: MCA Corporate ID (`U85100OR2019PTC030264`), ROC Cuttack (`30264`), and NIC 851 Human Health Activities.\n"
            "• **Facility & Timings**: Patasahanipur, Odisha registered office, contact numbers, and operational hours.\n"
            "• **Policies**: Prescription dispensing requirements and offline distribution model.\n\n"
            "What specific information would you like to know?"
        ),
        sources=[Source(title="Aayerah Pharma Directory", page=1)],
        message_id=f"msg-{abs(hash(user_query))}",
        fallback=True
    )
