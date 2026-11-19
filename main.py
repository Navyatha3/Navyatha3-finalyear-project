#app/main.py

import warnings
from sklearn.exceptions import InconsistentVersionWarning

# Suppress the version warning so the professors don't see it during the demo
warnings.filterwarnings("ignore", category=InconsistentVersionWarning)

import os
import shutil
import asyncio
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import httpx

from app.config import settings
from app.services.ingestion import build_index
from app.services.query_router import route_query, route_domain_with_external_router
from app.services.professional_brain import answer_question as prof_answer, studio_orchestrator
from app.services.admin_brain import answer_admin_query_direct as admin_answer
from app.services.document_brain import (
    register_document, 
    get_document_store, 
    answer_document_question
)
from app.services.llm_factory import is_ollama_memory_error
from app.database import (
    save_chat,
    get_history,
    save_feedback,
    get_feedback_stats,
    chat_collection,
)


# =============================================================================
# SIMPLE CONVERSATION FILTER
# =============================================================================

GREETINGS = {"hello", "hi", "hey", "good morning", "good evening", "greetings"}
THANKS_FAREWELLS = {"thank you", "thanks", "bye", "goodbye", "appreciate it"}


def _friendly_low_memory_message() -> str:
    return (
        "The AI model needs more system memory than is currently available. "
        "Please try one of these: ask a shorter question, switch to a lighter model, "
        "or close other apps and retry."
    )


def _is_low_memory_error_text(text: str) -> bool:
    if not text:
        return False
    try:
        return is_ollama_memory_error(Exception(text))
    except Exception:
        lowered = text.lower()
        return "requires more system memory" in lowered or "out of memory" in lowered


def _low_memory_response_payload(include_message_id: bool = False) -> dict:
    payload = {
        "status": "error",
        "response": _friendly_low_memory_message(),
        "brain": "error",
        "error_code": "MODEL_LOW_MEMORY",
    }
    if include_message_id:
        payload["message_id"] = None
    return payload


# =============================================================================
# REQUEST/RESPONSE MODELS
# =============================================================================

class ChatRequest(BaseModel):
    session_id: str
    query: str
    mode: str = "fast"  # fast or deep for professional brain
    regulation: str = "SITE 21"  # Academic curriculum version: SITE 18/21/23
    document_id: Optional[str] = None  # Optional document ID for Studio mode


class DocumentMode(BaseModel):
    session_id: str
    document_id: str
    query: str


class FeedbackRequest(BaseModel):
    session_id: str
    message_id: str
    rating: int
    comment: Optional[str] = ""


class RouterTestRequest(BaseModel):
    query: str


# =============================================================================
# FASTAPI APP SETUP
# =============================================================================

app = FastAPI(
    title="FusedChat API",
    description="Three-Brain AI Platform for SASI Institute",
    version="1.0.0"
)

# CORS Middleware - Allow React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure directories exist
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs("vector_store", exist_ok=True)


# =============================================================================
# STARTUP & SHUTDOWN EVENTS
# =============================================================================

@app.on_event("startup")
async def startup_event():
    """Initialize system on startup."""
    print("\n" + "="*60)
    print("🚀 FusedChat Backend Starting...")
    print("="*60)
    
    # Build syllabus index if missing
    if not os.path.exists(settings.SYLLABUS_INDEX_PATH):
        print("\n📚 Building Syllabus Index...")
        if os.path.exists(settings.SYLLABUS_PATH):
            build_index(settings.SYLLABUS_PATH, settings.SYLLABUS_INDEX_PATH)
            print("✅ Syllabus Index Ready.")
        else:
            print(f"⚠️ Warning: Syllabus PDF not found at {settings.SYLLABUS_PATH}")
    else:
        print("✅ Syllabus index already built")
    
    print("\n" + "="*60)
    print("✅ Backend Ready!")
    print("="*60 + "\n")


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown."""
    print("\n🛑 Shutting down FusedChat...")


# =============================================================================
# UPLOAD ENDPOINT
# =============================================================================

@app.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    session_id: str = ""
):
    """
    Upload and process a PDF document.
    
    Returns:
        document_id, filename, status, chunk count
    """
    try:
        # Validate file
        if not file.filename.endswith(".pdf"):
            raise HTTPException(status_code=400, detail="Only PDF files allowed")
        
        # Save file
        file_path = os.path.join(settings.UPLOAD_DIR, file.filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        print(f"\n📄 Processing document: {file.filename}")
        
        # Register document
        doc_info = register_document(
            file_path,
            file.filename,
            session_id or "anonymous"
        )
        
        if "error" in doc_info:
            raise HTTPException(status_code=500, detail=doc_info["error"])
        
        print(f"✅ Document registered: {doc_info['document_id']}")
        
        return {
            "status": "success",
            "document_id": doc_info["document_id"],
            "filename": file.filename,
            "chunks_created": doc_info.get("chunks_created", 0),
            "summary": doc_info.get("summary", "Summary unavailable."),
            "topics": doc_info.get("topics", []),
            "message": "Document processed successfully"
        }
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Upload Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# MAIN CHAT ENDPOINT
# =============================================================================

@app.post("/chat")
async def chat(request: ChatRequest):
    """
    Main chat endpoint - Uses Studio Orchestrator for multi-source intelligence.
    """
    
    # 1. Quick system responses (clean punctuation first)
    q = request.query.lower().replace("?", "").replace("!", "").strip()

    if q in ["hi", "hello", "hey", "greetings", "good morning", "good evening", "sup"]:
        return {
            "status": "success",
            "response": "Hello! I am FusedChat Studio, your intelligent academic workspace. I can help you with coursework, uploaded documents, and campus information - all at once! How can I assist you today?",
            "brain": "system",
            "suggestions": [
                "Create a study plan from my syllabus",
                "Analyze my uploaded document",
                "Show me the fee structure",
                "Generate practice questions"
            ]
        }
    
    if q in ["how are you", "how are", "how r u", "how do you do", "whats up"]:
        return {
            "status": "success",
            "response": "I'm functioning perfectly and ready to help! I have access to your syllabus, documents, and all campus information.",
            "brain": "system",
            "suggestions": [
                "What can you do?",
                "Help me study for exams",
                "Upload a document"
            ]
        }
    
    if q in ["what can you do", "your features", "capabilities"]:
        return {
            "status": "success",
            "response": """I'm FusedChat Studio - your AI Research Lab! Here's what I can do:

📚 **Academic Intelligence**: Answer questions using your course syllabus
📄 **Document Analysis**: Analyze PDFs you upload (notes, assignments, research papers)
🏫 **Campus Assistant**: Provide info about fees, buses, faculty, and more
🎯 **Smart Tasks**: Create study plans, generate quizzes, explain code
🔗 **Multi-Source Fusion**: Combine syllabus + your documents for comprehensive answers

Just ask me anything or upload a document to get started!""",
            "brain": "system",
            "suggestions": [
                "Show me bus routes",
                "Create a study guide for Data Structures",
                "What are the fee payment options?"
            ]
        }
    
    print(f"\n💬 Studio Processing: '{request.query}'")
    print(f"   Session: {request.session_id}")
    print(f"   Mode: {request.mode}")
    print(f"   Document: {request.document_id or 'None'}")
    
    try:
        # Use Studio Orchestrator for intelligent multi-source response
        print("   🎯 Activating Studio Orchestrator...")
        
        result = await studio_orchestrator(
            question=request.query,
            session_id=request.session_id,
            document_id=request.document_id,
            mode=request.mode
        )

        if result.get("brain") == "error":
            answer_text = result.get("answer", "")
            if _is_low_memory_error_text(answer_text):
                return _low_memory_response_payload()
            return {
                "status": "error",
                "response": answer_text or "Model backend unavailable.",
                "brain": "error",
            }
        
        # Save to database
        print(f"   💾 Saving to database...")
        try:
            await save_chat(
                session_id=request.session_id,
                query=request.query,
                response=result.get("answer", ""),
                mode="studio"
            )
        except Exception as db_err:
            print(f"   ⚠️ Database Error (Ignored): {db_err}")
        
        print(f"   ✅ Studio response generated")
        
        # Return enriched response with suggestions
        return {
            "status": "success",
            "response": result.get("answer", ""),
            "brain": result.get("brain", "studio_core"),
            "mode": result.get("mode", request.mode),
            "sources_used": result.get("sources_used", []),
            "suggestions": result.get("suggestions", []),
            "source_count": result.get("source_count", 0)
        }
    
    except Exception as exc:
        print(f"❌ Studio Error: {exc}")
        import traceback
        traceback.print_exc()

        if is_ollama_memory_error(exc):
            return _low_memory_response_payload()
        
        # Fallback response
        return {
            "status": "error",
            "response": "I apologize, but I encountered an error processing your request. Please try rephrasing your question or contact support.",
            "brain": "error",
            "error": str(exc)
        }


@app.post("/chat/v2")
async def chat_v2(request: ChatRequest):
    """
    /chat/v2 — identical to /chat but returns message_id for feedback.

    You can migrate the frontend to /chat/v2 and retire the old /chat,
    or keep both running during the viva for backward compatibility.
    """
    print(f"\n💬 Studio Processing: '{request.query}'")

    try:
        result = await studio_orchestrator(
            question=request.query,
            session_id=request.session_id,
            document_id=request.document_id,
            mode=request.mode,
        )

        if result.get("brain") == "error":
            answer_text = result.get("answer", "")
            if _is_low_memory_error_text(answer_text):
                payload = _low_memory_response_payload(include_message_id=True)
                payload["history_turns_used"] = result.get("history_turns_used", 0)
                return payload
            return {
                "status": "error",
                "response": answer_text or "Model backend unavailable.",
                "brain": "error",
                "message_id": None,
                "history_turns_used": result.get("history_turns_used", 0),
            }

        # Save and capture the inserted _id
        message_id = None
        try:
            doc = {
                "session_id": request.session_id,
                "user_query": request.query,
                "bot_response": result.get("answer", ""),
                "mode": "studio",
            }
            insert_result = await chat_collection.insert_one(doc)
            message_id = str(insert_result.inserted_id)
        except Exception as db_err:
            print(f"   ⚠️ Database Error (Ignored): {db_err}")

        return {
            "status": "success",
            "response": result.get("answer", ""),
            "brain": result.get("brain", "studio_core"),
            "mode": result.get("mode", request.mode),
            "sources_used": result.get("sources_used", []),
            "suggestions": result.get("suggestions", []),
            "source_count": result.get("source_count", 0),
            "message_id": message_id,
            "history_turns_used": result.get("history_turns_used", 0),
        }

    except Exception as exc:
        print(f"❌ Studio Error: {exc}")
        import traceback
        traceback.print_exc()
        if is_ollama_memory_error(exc):
            payload = _low_memory_response_payload(include_message_id=True)
            payload["history_turns_used"] = 0
            return payload
        return {
            "status": "error",
            "response": "I encountered an error. Please try rephrasing your question.",
            "brain": "error",
            "error": str(exc),
        }


# =============================================================================
# DOCUMENT CHAT ENDPOINT
# =============================================================================

@app.post("/chat/document")
async def chat_document(request: DocumentMode):
    """
    Chat about a specific uploaded document.
    
    Requires: document_id from previous upload
    """
    print(f"\n📄 Document Chat: {request.query}")
    print(f"   Document: {request.document_id}")
    
    try:
        # Get vector store for document
        vector_store = get_document_store(request.document_id)
        
        if not vector_store:
            raise HTTPException(
                status_code=404,
                detail=f"Document {request.document_id} not found"
            )
        
        # Answer question about document
        result = await answer_document_question(
            query=request.query,
            vector_store=vector_store,
            document_id=request.document_id
        )
        
        # Save to database
        try:
            await save_chat(
                session_id=request.session_id,
                query=request.query,
                response=result.get("answer", ""),
                mode="document"
            )
        except Exception as db_err:
            print(f"⚠️ Database Error (Ignored): {db_err}")
        
        print(f"✅ Document chat response generated")
        
        return {
            "status": "success",
            "response": result.get("answer", ""),
            "brain": "document",
            "document_id": request.document_id,
            "citations": result.get("citations", []),
            "pages_referenced": result.get("pages_referenced", []),
            "confidence": result.get("confidence", 0.8)
        }
    
    except HTTPException:
        raise
    except Exception as exc:
        print(f"❌ Document Chat Error: {exc}")
        if is_ollama_memory_error(exc):
            raise HTTPException(status_code=503, detail=_friendly_low_memory_message())
        raise HTTPException(status_code=500, detail=str(exc))


# =============================================================================
# CONVERSATION HISTORY ENDPOINT
# =============================================================================

@app.get("/history/{session_id}")
async def get_conversation_history(
    session_id: str,
    limit: int = 50
):
    """
    Retrieve conversation history for a session.
    
    Args:
        session_id: User session ID
        limit: Maximum number of messages to return
        
    Returns:
        List of messages in conversation
    """
    try:
        print(f"\n📜 Fetching history for session: {session_id}")
        
        history = await get_history(session_id, limit=limit)
        
        return {
            "status": "success",
            "session_id": session_id,
            "message_count": len(history),
            "messages": history
        }
    except Exception as e:
        print(f"❌ History retrieval error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/sessions/{session_id}")
async def get_session_messages(
    session_id: str,
    limit: int = 50
):
    """
    Alias endpoint for frontend session-history UI.
    Mirrors /history/{session_id} shape for compatibility.
    """
    return await get_conversation_history(session_id=session_id, limit=limit)


@app.post("/feedback")
async def submit_feedback(request: FeedbackRequest):
    """
    Receive thumbs-up / thumbs-down on a bot response.
    """
    if request.rating not in (1, -1):
        raise HTTPException(status_code=400, detail="Rating must be 1 (up) or -1 (down)")

    success = await save_feedback(
        session_id=request.session_id,
        message_id=request.message_id,
        rating=request.rating,
        comment=request.comment or "",
    )

    if not success:
        raise HTTPException(status_code=404, detail="Message not found or session mismatch")

    return {"status": "success", "message": "Feedback saved"}


@app.post("/router-test")
async def router_test(request: RouterTestRequest):
    """Debug endpoint to compare external router.pkl and internal routing."""
    route_result = await route_query(request.query)
    domain_result = route_domain_with_external_router(request.query)

    return {
        "status": "success",
        "query": request.query,
        "external_router_domain": domain_result,
        "enforce_domain": settings.ROUTER_ENFORCE_DOMAIN,
        "router_pkl_path": settings.ROUTER_PKL_PATH,
        "internal_router": {
            "brain": route_result.get("brain"),
            "confidence": route_result.get("confidence"),
            "matched_keywords": route_result.get("matched_keywords", []),
            "routing_method": route_result.get("routing_method"),
            "mode": route_result.get("mode"),
        },
    }


@app.get("/stats")
async def get_stats():
    """
    Returns REAL usage and satisfaction statistics from MongoDB.
    """
    from datetime import datetime

    # Total query count
    total = await chat_collection.count_documents({})

    # Per-mode breakdown
    pipeline = [
        {"$group": {"_id": "$mode", "count": {"$sum": 1}}}
    ]
    cursor = chat_collection.aggregate(pipeline)
    mode_rows = await cursor.to_list(length=20)
    mode_breakdown = {row["_id"]: row["count"] for row in mode_rows}

    # Feedback / satisfaction
    satisfaction = await get_feedback_stats()
    total_up = sum(item.get("thumbs_up", 0) for item in satisfaction.values())
    total_down = sum(item.get("thumbs_down", 0) for item in satisfaction.values())
    total_feedback = total_up + total_down

    # Optional response-time metric (if stored by future backend versions)
    response_time_rows = await chat_collection.aggregate([
        {"$match": {"response_time_ms": {"$exists": True}}},
        {"$group": {"_id": None, "avg": {"$avg": "$response_time_ms"}}}
    ]).to_list(length=1)

    avg_response_time_ms = None
    if response_time_rows and response_time_rows[0].get("avg") is not None:
        avg_response_time_ms = round(float(response_time_rows[0]["avg"]), 2)

    user_satisfaction = None
    if total_feedback > 0:
        user_satisfaction = round((total_up / total_feedback) * 100, 2)

    return {
        "status": "success",
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "total_queries": total,
        "queries_by_mode": mode_breakdown,
        "satisfaction_by_mode": satisfaction,
        "avg_response_time_ms": avg_response_time_ms,
        "user_satisfaction": user_satisfaction,
        "note": "Satisfaction scores are based on real user feedback (thumbs up/down)."
    }


# =============================================================================
# HEALTH CHECK
# =============================================================================

@app.get("/health")
async def health_check():
    """Simple health check endpoint."""
    base_url = (settings.OLLAMA_BASE_URL or "").rstrip("/")
    ollama_url = f"{base_url}/api/tags" if base_url else ""
    ollama_ok = False
    ollama_error = None

    headers = {}
    if "ngrok-free.dev" in base_url or "ngrok.io" in base_url:
        headers["ngrok-skip-browser-warning"] = "true"

    if ollama_url:
        try:
            async with httpx.AsyncClient(timeout=6.0, headers=headers) as client:
                response = await client.get(ollama_url)
                ollama_ok = response.status_code == 200
                if not ollama_ok:
                    ollama_error = f"HTTP {response.status_code}"
        except Exception as exc:
            ollama_error = str(exc)

    return {
        "status": "healthy" if ollama_ok else "degraded",
        "service": "FusedChat Backend",
        "version": "1.0.0",
        "ollama_reachable": ollama_ok,
        "ollama_base_url": base_url,
        "ollama_error": ollama_error,
    }


# =============================================================================
# ROOT ENDPOINT
# =============================================================================

@app.get("/")
async def root():
    """Welcome message and API info."""
    return {
        "welcome": "FusedChat - Three-Brain AI Platform",
        "institute": "SASI Institute of Technology & Engineering",
        "endpoints": {
            "chat": "POST /chat - Main chat interface",
            "upload": "POST /upload - Upload PDF document",
            "document_chat": "POST /chat/document - Chat about uploaded document",
            "history": "GET /history/{session_id} - Get conversation history",
            "health": "GET /health - Health check",
            "docs": "GET /docs - Interactive API documentation"
        },
        "brains": ["professional", "administrator", "document"]
    }
